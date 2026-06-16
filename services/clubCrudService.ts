/**
 * Club CRUD Service
 * Extracted from contexts/AppContext.tsx — handles add, update, delete for clubs.
 * No logic changes from original implementation.
 */
import { Club, Terrain } from '@/types/petanque';
import { logModification } from '@/services/modificationLogService';
import { enqueueOperation, buildClubDbPayload, buildUpdateDbPayload } from '@/services/offlineQueueService';

interface ClubCrudDeps {
  supabase: any;
  userId: string | undefined;
  isConnected: boolean;
  clubs: Club[];
  setClubs: React.Dispatch<React.SetStateAction<Club[]>>;
  setTerrains: React.Dispatch<React.SetStateAction<Terrain[]>>;
  sharedItemPermissions: Record<string, 'read' | 'write'>;
}

export async function addClubOp(
  club: Omit<Club, 'id'>,
  deps: ClubCrudDeps
): Promise<void> {
  const { supabase, userId, isConnected, setClubs } = deps;

  if (!userId) {
    const newClub: Club = { ...club, id: Date.now().toString() };
    setClubs(prev => [...prev, newClub]);
    return;
  }

  if (!isConnected) {
    const tempId = `temp_${Date.now()}`;
    enqueueOperation({ type: 'insert', table: 'clubs', dbPayload: buildClubDbPayload(club), tempId });
    setClubs(prev => [...prev, { ...club, id: tempId }]);
    return;
  }

  try {
    const { data, error } = await supabase.from('clubs').insert({
      user_id: userId,
      name: club.name,
      logo: club.logo,
      address: club.address,
      city: club.city,
      country: club.country || 'France',
      location: club.location,
      members_count: club.membersCount,
      founded_year: club.foundedYear,
      description: club.description,
      facilities: club.facilities,
      contact_email: club.contactEmail,
      contact_phone: club.contactPhone,
      terrain_id: club.terrainId,
      terrain_name: club.terrainName,
      membership_cost: club.membershipCost,
      club_card_url: club.clubCardUrl || null,
      website: club.website || null,
      facebook_url: club.facebookUrl || null,
      instagram_handle: club.instagramHandle || null,
    }).select().single();

    if (error) throw error;

    if (data) {
      const newClub: Club = {
        id: data.id,
        name: data.name,
        logo: data.logo,
        address: data.address,
        city: data.city,
        country: data.country || 'France',
        location: data.location,
        membersCount: data.members_count,
        foundedYear: data.founded_year,
        description: data.description,
        facilities: data.facilities,
        contactEmail: data.contact_email,
        contactPhone: data.contact_phone,
        terrainId: data.terrain_id,
        terrainName: data.terrain_name,
        membershipCost: data.membership_cost ? parseFloat(data.membership_cost) : undefined,
        isPublic: data.is_public ?? false,
        showContactPublic: data.show_contact_public ?? false,
        clubCardUrl: data.club_card_url || undefined,
        website: data.website || undefined,
        facebookUrl: data.facebook_url || undefined,
        instagramHandle: data.instagram_handle || undefined,
      };
      setClubs(prev => [...prev, newClub]);
    }
  } catch (error) {
    console.log('Error adding club:', error);
    const newClub: Club = { ...club, id: Date.now().toString() };
    setClubs(prev => [...prev, newClub]);
  }
}

export async function updateClubOp(
  id: string,
  updates: Partial<Club>,
  deps: ClubCrudDeps
): Promise<void> {
  const { supabase, userId, isConnected, clubs, setClubs, sharedItemPermissions } = deps;
  const oldClub = clubs.find(c => c.id === id);

  setClubs(prev => prev.map(club =>
    club.id === id ? { ...club, ...updates } : club
  ));

  if (!userId) return;

  if (!isConnected) {
    enqueueOperation({ type: 'update', table: 'clubs', itemId: id, dbPayload: buildUpdateDbPayload('clubs', updates) });
    return;
  }

  try {
    const dbUpdates: any = {};
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.logo !== undefined) dbUpdates.logo = updates.logo;
    if (updates.address !== undefined) dbUpdates.address = updates.address;
    if (updates.city !== undefined) dbUpdates.city = updates.city;
    if (updates.country !== undefined) dbUpdates.country = updates.country;
    if (updates.location !== undefined) dbUpdates.location = updates.location;
    if (updates.membersCount !== undefined) dbUpdates.members_count = updates.membersCount;
    if (updates.foundedYear !== undefined) dbUpdates.founded_year = updates.foundedYear;
    if (updates.description !== undefined) dbUpdates.description = updates.description || null;
    if (updates.facilities !== undefined) dbUpdates.facilities = updates.facilities;
    if (updates.contactEmail !== undefined) dbUpdates.contact_email = updates.contactEmail || null;
    if (updates.contactPhone !== undefined) dbUpdates.contact_phone = updates.contactPhone || null;
    if (updates.terrainId !== undefined) dbUpdates.terrain_id = updates.terrainId;
    if (updates.terrainName !== undefined) dbUpdates.terrain_name = updates.terrainName;
    if (updates.membershipCost !== undefined) dbUpdates.membership_cost = updates.membershipCost;
    if (updates.showContactPublic !== undefined) dbUpdates.show_contact_public = updates.showContactPublic;
    if ((updates as any).clubCardUrl !== undefined) dbUpdates.club_card_url = (updates as any).clubCardUrl || null;
    if (updates.website !== undefined) dbUpdates.website = updates.website || null;
    if (updates.facebookUrl !== undefined) dbUpdates.facebook_url = updates.facebookUrl || null;
    if (updates.instagramHandle !== undefined) dbUpdates.instagram_handle = updates.instagramHandle || null;
    dbUpdates.updated_at = new Date().toISOString();

    await supabase.from('clubs').update(dbUpdates).eq('id', id);

    // Log modification for shared items
    if (sharedItemPermissions[id] === 'write' && oldClub) {
      const { data: row } = await supabase.from('clubs').select('user_id').eq('id', id).single();
      if (row?.user_id) {
        const changes = Object.keys(updates).filter(k => (oldClub as any)[k] !== (updates as any)[k]).map(k => ({ field: k, oldValue: (oldClub as any)[k], newValue: (updates as any)[k] }));
        logModification({ itemType: 'club', itemId: id, ownerId: row.user_id, changes }).catch(() => {});
      }
    }
  } catch (error) {
    console.log('Error updating club:', error);
  }
}

export async function deleteClubOp(
  id: string,
  deps: Pick<ClubCrudDeps, 'supabase' | 'userId' | 'isConnected' | 'setClubs' | 'setTerrains'>
): Promise<void> {
  const { supabase, userId, isConnected, setClubs, setTerrains } = deps;
  setClubs(prev => prev.filter(club => club.id !== id));
  setTerrains(prev => prev.map(t =>
    t.clubId === id ? { ...t, clubId: undefined, clubName: undefined } : t
  ));

  if (!userId) return;

  if (!isConnected) {
    enqueueOperation({ type: 'delete', table: 'clubs', itemId: id });
    return;
  }

  try {
    await supabase.from('clubs').delete().eq('id', id);
  } catch (error) {
    console.log('Error deleting club:', error);
  }
}
