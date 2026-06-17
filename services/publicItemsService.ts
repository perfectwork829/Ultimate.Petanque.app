import { getSupabaseClient } from '@/template';

export interface PublicPlayer {
  id: string;
  userId: string;
  name: string;
  nickname?: string;
  avatar?: string;
  club?: string;
  role: string;
  level: string;
  location?: { latitude: number; longitude: number; city: string };
  country?: string;
  stats: any;
  isPremium?: boolean;
}

export interface PublicClub {
  id: string;
  userId: string;
  name: string;
  address: string;
  city: string;
  country?: string;
  location: { latitude: number; longitude: number };
  membersCount: number;
  foundedYear?: number;
  description?: string;
  facilities?: string[];
  terrainName?: string;
  membershipCost?: number;
}

export interface PublicTerrain {
  id: string;
  userId: string;
  name: string;
  address: string;
  city: string;
  location: { latitude: number; longitude: number };
  type: string;
  description?: string;
  facilities?: string[];
  clubName?: string;
  courtsCount: number;
  lighting: boolean;
  covered: boolean;
}

export interface PublicTournament {
  id: string;
  userId: string;
  name: string;
  date: string;
  endDate?: string;
  type: string;
  format: string;
  location: { name: string; city: string; latitude: number; longitude: number };
  terrainName?: string;
  clubName?: string;
  status: string;
  participants: number;
  maxParticipants: number;
  prize?: string;
  description?: string;
}

export async function fetchPublicPlayers(): Promise<{ items: PublicPlayer[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const { data, error } = await supabase.from('players').select('*').eq('is_public', true);
  if (error) return { items: [], error: error.message };

  const filtered = (data || []).filter((p: any) => p.user_id !== userId);

  // Fetch premium status for all player user_ids
  const userIds = filtered.map((p: any) => p.user_id).filter(Boolean);
  let premiumIds: Set<string> = new Set();
  if (userIds.length > 0) {
    try {
      const { data: premiumData } = await supabase.rpc('get_premium_user_ids', { user_ids: userIds });
      if (Array.isArray(premiumData)) {
        premiumIds = new Set(premiumData);
      }
    } catch { /* silent */ }
  }

  const items: PublicPlayer[] = filtered.map((p: any) => ({
      id: p.id, userId: p.user_id, name: p.name, nickname: p.nickname, avatar: p.avatar,
      club: p.club, role: p.role, level: p.level, location: p.location,
      country: p.country, stats: p.stats || {}, isPremium: premiumIds.has(p.user_id),
    }));
  return { items, error: null };
}

export async function fetchPublicClubs(): Promise<{ items: PublicClub[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const { data, error } = await supabase.from('clubs').select('*').eq('is_public', true);
  if (error) return { items: [], error: error.message };

  const items: PublicClub[] = (data || [])
    .filter((c: any) => c.user_id !== userId)
    .map((c: any) => ({
      id: c.id, userId: c.user_id, name: c.name, address: c.address, city: c.city,
      country: c.country, location: c.location || { latitude: 0, longitude: 0 },
      membersCount: c.members_count || 0, foundedYear: c.founded_year,
      description: c.description, facilities: c.facilities,
      terrainName: c.terrain_name, membershipCost: c.membership_cost ? parseFloat(c.membership_cost) : undefined,
    }));
  return { items, error: null };
}

export async function fetchPublicTerrains(): Promise<{ items: PublicTerrain[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const { data, error } = await supabase.from('terrains').select('*').eq('is_public', true);
  if (error) return { items: [], error: error.message };

  const items: PublicTerrain[] = (data || [])
    .filter((t: any) => t.user_id !== userId)
    .map((t: any) => ({
      id: t.id, userId: t.user_id, name: t.name, address: t.address, city: t.city,
      location: t.location || { latitude: 0, longitude: 0 }, type: t.type,
      description: t.description, facilities: t.facilities, clubName: t.club_name,
      courtsCount: t.courts_count || 1, lighting: t.lighting ?? false, covered: t.covered ?? false,
    }));
  return { items, error: null };
}

export async function fetchPublicTournaments(): Promise<{ items: PublicTournament[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const { data, error } = await supabase.from('tournaments').select('*').eq('is_public', true);
  if (error) return { items: [], error: error.message };

  const items: PublicTournament[] = (data || [])
    .filter((t: any) => t.user_id !== userId)
    .map((t: any) => ({
      id: t.id, userId: t.user_id, name: t.name, date: t.date, endDate: t.end_date,
      type: t.type, format: t.format, location: t.location,
      terrainName: t.terrain_name, clubName: t.club_name, status: t.status,
      participants: t.participants || 0, maxParticipants: t.max_participants || 32,
      prize: t.prize, description: t.description,
    }));
  return { items, error: null };
}

export async function toggleItemPublic(
  table: 'players' | 'clubs' | 'terrains' | 'tournaments',
  itemId: string,
  isPublic: boolean,
): Promise<{ error: string | null }> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(table).update({ is_public: isPublic, updated_at: new Date().toISOString() }).eq('id', itemId);
  return { error: error?.message || null };
}

/** Turn on community directory visibility for a new user's primary player profile. */
export async function enableSelfPlayerPublicProfile(
  userId: string,
): Promise<{ playerId: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data: canonical } = await supabase
    .from('players')
    .select('id, is_public')
    .eq('id', userId)
    .maybeSingle();

  let playerId: string | null = null;

  if (canonical) {
    playerId = canonical.id;
    if (!canonical.is_public) {
      const { error } = await supabase
        .from('players')
        .update({ is_public: true, updated_at: now })
        .eq('id', playerId);
      if (error) return { playerId: null, error: error.message };
    }
  } else {
    const { data: linked } = await supabase
      .from('players')
      .select('id, is_public')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!linked) {
      return { playerId: null, error: null };
    }

    playerId = linked.id;
    if (!linked.is_public) {
      const { error } = await supabase
        .from('players')
        .update({ is_public: true, updated_at: now })
        .eq('id', playerId);
      if (error) return { playerId: null, error: error.message };
    }
  }

  await supabase
    .from('user_profiles')
    .update({ is_public_profile: true })
    .eq('id', userId);

  return { playerId, error: null };
}

export async function importPublicItemToDirectory(
  table: 'players' | 'clubs' | 'terrains' | 'tournaments',
  itemId: string,
): Promise<{ newItemId: string | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { newItemId: null, error: 'Not connected' };

  try {
    const { data: source, error: fetchErr } = await supabase.from(table).select('*').eq('id', itemId).single();
    if (fetchErr || !source) return { newItemId: null, error: `Item not found in ${table}` };

    // Build insert payload without id, user_id, created_at, updated_at
    const payload: any = { user_id: userData.user.id };

    if (table === 'players') {
      Object.assign(payload, {
        name: source.name, nickname: source.nickname, avatar: source.avatar,
        club: source.club, role: source.role, level: source.level,
        location: source.location, phone: null, email: null,
        country: source.country, boules: source.boules, stats: source.stats,
        handedness: source.handedness, terrain_name: source.terrain_name,
        is_public: false,
      });
    } else if (table === 'clubs') {
      Object.assign(payload, {
        name: source.name, logo: source.logo, address: source.address,
        city: source.city, country: source.country, location: source.location,
        members_count: source.members_count, founded_year: source.founded_year,
        description: source.description, facilities: source.facilities,
        contact_email: null, contact_phone: null,
        terrain_name: source.terrain_name, membership_cost: source.membership_cost,
        is_public: false,
      });
    } else if (table === 'terrains') {
      Object.assign(payload, {
        name: source.name, address: source.address, city: source.city,
        location: source.location, type: source.type, description: source.description,
        facilities: source.facilities, photos: source.photos,
        club_name: source.club_name, is_public: false,
        courts_count: source.courts_count, lighting: source.lighting, covered: source.covered,
      });
    } else if (table === 'tournaments') {
      Object.assign(payload, {
        name: source.name, date: source.date, end_date: source.end_date,
        type: source.type, format: source.format, location: source.location,
        terrain_name: source.terrain_name, club_name: source.club_name,
        status: source.status, participants: source.participants,
        max_participants: source.max_participants, prize: source.prize,
        description: source.description, tournament_level: source.tournament_level,
        tournament_category: source.tournament_category,
        registration_type: source.registration_type,
        tournament_scope: source.tournament_scope,
        registration_cost: source.registration_cost,
        is_public: false,
      });
    }

    const { data: newItem, error: insertErr } = await supabase.from(table).insert(payload).select('id').single();
    if (insertErr) return { newItemId: null, error: insertErr.message };
    return { newItemId: newItem?.id || null, error: null };
  } catch (e: any) {
    return { newItemId: null, error: e.message || 'Import error' };
  }
}

// Check for duplicate public terrains by Google place_id first, then city + address similarity
export async function checkDuplicatePublicTerrains(
  city: string,
  address?: string,
  googlePlaceId?: string,
): Promise<{ duplicates: (PublicTerrain & { matchType: 'exact' | 'city' | 'place_id' })[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  // 1. Check exact match by Google Place ID first
  if (googlePlaceId) {
    const { data: placeMatches, error: placeErr } = await supabase
      .from('terrains')
      .select('*')
      .eq('google_place_id', googlePlaceId);
    if (!placeErr && placeMatches && placeMatches.length > 0) {
      const placeIdDups = placeMatches
        .filter((t: any) => t.user_id !== userId)
        .map((t: any) => ({
          id: t.id, userId: t.user_id, name: t.name, address: t.address, city: t.city,
          location: t.location || { latitude: 0, longitude: 0 }, type: t.type,
          description: t.description, facilities: t.facilities, clubName: t.club_name,
          courtsCount: t.courts_count || 1, lighting: t.lighting ?? false, covered: t.covered ?? false,
          matchType: 'place_id' as const,
        }));
      // Also check own terrains
      const ownPlaceDups = placeMatches
        .filter((t: any) => t.user_id === userId)
        .map((t: any) => ({
          id: t.id, userId: t.user_id, name: t.name, address: t.address, city: t.city,
          location: t.location || { latitude: 0, longitude: 0 }, type: t.type,
          description: t.description, facilities: t.facilities, clubName: t.club_name,
          courtsCount: t.courts_count || 1, lighting: t.lighting ?? false, covered: t.covered ?? false,
          matchType: 'place_id' as const,
        }));
      if (placeIdDups.length > 0 || ownPlaceDups.length > 0) {
        return { duplicates: [...placeIdDups, ...ownPlaceDups], error: null };
      }
    }
  }

  // 2. Fallback to city + address fuzzy matching
  const normalizedCity = city.trim().toLowerCase();
  if (!normalizedCity) return { duplicates: [], error: null };

  const { data, error } = await supabase.from('terrains').select('*').eq('is_public', true);
  if (error) return { duplicates: [], error: error.message };

  const normalizedAddress = (address || '').trim().toLowerCase();

  const duplicates = (data || [])
    .filter((t: any) => t.user_id !== userId)
    .filter((t: any) => {
      const tCity = (t.city || '').trim().toLowerCase();
      return tCity === normalizedCity;
    })
    .map((t: any) => {
      const tAddress = (t.address || '').trim().toLowerCase();
      const isExact = normalizedAddress && tAddress && (
        tAddress.includes(normalizedAddress) || normalizedAddress.includes(tAddress)
      );
      return {
        id: t.id, userId: t.user_id, name: t.name, address: t.address, city: t.city,
        location: t.location || { latitude: 0, longitude: 0 }, type: t.type,
        description: t.description, facilities: t.facilities, clubName: t.club_name,
        courtsCount: t.courts_count || 1, lighting: t.lighting ?? false, covered: t.covered ?? false,
        matchType: isExact ? 'exact' as const : 'city' as const,
      };
    })
    .sort((a: any, b: any) => (a.matchType === 'exact' ? -1 : 1) - (b.matchType === 'exact' ? -1 : 1));

  return { duplicates, error: null };
}

// Check for duplicate public clubs by city + name similarity
export async function checkDuplicatePublicClubs(
  city: string,
  name?: string,
): Promise<{ duplicates: (PublicClub & { matchType: 'exact' | 'city' })[]; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;

  const normalizedCity = city.trim().toLowerCase();
  if (!normalizedCity) return { duplicates: [], error: null };

  const { data, error } = await supabase.from('clubs').select('*').eq('is_public', true);
  if (error) return { duplicates: [], error: error.message };

  const normalizedName = (name || '').trim().toLowerCase();

  const duplicates = (data || [])
    .filter((c: any) => c.user_id !== userId)
    .filter((c: any) => {
      const cCity = (c.city || '').trim().toLowerCase();
      return cCity === normalizedCity;
    })
    .map((c: any) => {
      const cName = (c.name || '').trim().toLowerCase();
      const isExact = normalizedName && cName && (
        cName.includes(normalizedName) || normalizedName.includes(cName)
      );
      return {
        id: c.id, userId: c.user_id, name: c.name, address: c.address, city: c.city,
        country: c.country, location: c.location || { latitude: 0, longitude: 0 },
        membersCount: c.members_count || 0, foundedYear: c.founded_year,
        description: c.description, facilities: c.facilities,
        terrainName: c.terrain_name, membershipCost: c.membership_cost ? parseFloat(c.membership_cost) : undefined,
        matchType: isExact ? 'exact' as const : 'city' as const,
      };
    })
    .sort((a: any, b: any) => (a.matchType === 'exact' ? -1 : 1) - (b.matchType === 'exact' ? -1 : 1));

  return { duplicates, error: null };
}

// Check for duplicate public terrains excluding a specific item (for edit pages)
export async function checkDuplicatePublicTerrainsExcluding(
  city: string,
  address?: string,
  excludeId?: string,
): Promise<{ duplicates: (PublicTerrain & { matchType: 'exact' | 'city' })[]; error: string | null }> {
  const result = await checkDuplicatePublicTerrains(city, address);
  if (result.error) return result;
  return {
    duplicates: result.duplicates.filter(d => d.id !== excludeId),
    error: null,
  };
}

// Check for duplicate public clubs excluding a specific item (for edit pages)
export async function checkDuplicatePublicClubsExcluding(
  city: string,
  name?: string,
  excludeId?: string,
): Promise<{ duplicates: (PublicClub & { matchType: 'exact' | 'city' })[]; error: string | null }> {
  const result = await checkDuplicatePublicClubs(city, name);
  if (result.error) return result;
  return {
    duplicates: result.duplicates.filter(d => d.id !== excludeId),
    error: null,
  };
}

// Fetch full public terrain data for merging
export async function fetchPublicTerrainById(itemId: string): Promise<{ item: any | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('terrains').select('*').eq('id', itemId).single();
  if (error) return { item: null, error: error.message };
  return { item: data, error: null };
}

// Fetch full public club data for merging
export async function fetchPublicClubById(itemId: string): Promise<{ item: any | null; error: string | null }> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('clubs').select('*').eq('id', itemId).single();
  if (error) return { item: null, error: error.message };
  return { item: data, error: null };
}

// Get the user's own items that can be made public
export async function getMyPublicableItems(): Promise<{
  players: { id: string; name: string; isPublic: boolean }[];
  clubs: { id: string; name: string; isPublic: boolean }[];
  terrains: { id: string; name: string; isPublic: boolean }[];
  tournaments: { id: string; name: string; isPublic: boolean }[];
}> {
  const supabase = getSupabaseClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return { players: [], clubs: [], terrains: [], tournaments: [] };

  const uid = userData.user.id;
  const [pRes, cRes, tRes, toRes] = await Promise.all([
    supabase.from('players').select('id, name, is_public, email').eq('user_id', uid),
    supabase.from('clubs').select('id, name, is_public').eq('user_id', uid),
    supabase.from('terrains').select('id, name, is_public').eq('user_id', uid),
    supabase.from('tournaments').select('id, name, is_public').eq('user_id', uid),
  ]);

  return {
    players: (pRes.data || []).map((p: any) => ({ id: p.id, name: p.name, isPublic: p.is_public ?? false, email: p.email || null })),
    clubs: (cRes.data || []).map((c: any) => ({ id: c.id, name: c.name, isPublic: c.is_public ?? false })),
    terrains: (tRes.data || []).map((t: any) => ({ id: t.id, name: t.name, isPublic: t.is_public ?? false })),
    tournaments: (toRes.data || []).map((t: any) => ({ id: t.id, name: t.name, isPublic: t.is_public ?? false })),
  };
}
