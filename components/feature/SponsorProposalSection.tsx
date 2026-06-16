import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/services/haptics';
import { getSupabaseClient } from '@/template';
import { useAlert } from '@/template';
import { getTierLimits, canSponsorItemType, getSponsoringLimitLabel } from '@/constants/partnerTiers';

interface SponsorProposalSectionProps {
  sponsorId: string;
  sponsorName: string;
  isSilverPlus: boolean;
  tierColor: string;
  fr: boolean;
  badgeType?: string;
}

export default function SponsorProposalSection({ sponsorId, sponsorName, isSilverPlus, tierColor, fr, badgeType = 'partner' }: SponsorProposalSectionProps) {
  const supabase = getSupabaseClient();
  const { showAlert } = useAlert();
  const [itemType, setItemType] = useState<'terrains' | 'clubs' | 'tournaments' | 'players'>('terrains');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [proposals, setProposals] = useState<any[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limits = getTierLimits(badgeType);

  useEffect(() => {
    supabase.from('sponsor_proposals').select('*').eq('ambassador_id', sponsorId).order('created_at', { ascending: false }).then(({ data }) => {
      setProposals(data || []);
    });
    // Count active sponsorings (approved proposals + directly assigned items)
    const countActive = async () => {
      const [t, c, to, pl] = await Promise.all([
        supabase.from('terrains').select('id').eq('sponsor_id', sponsorId),
        supabase.from('clubs').select('id').eq('sponsor_id', sponsorId),
        supabase.from('tournaments').select('id').eq('sponsor_id', sponsorId),
        supabase.from('players').select('id').eq('sponsor_id', sponsorId),
      ]);
      setActiveCount((t.data?.length || 0) + (c.data?.length || 0) + (to.data?.length || 0) + (pl.data?.length || 0));
    };
    countActive();
  }, [sponsorId]);

  const handleSearch = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from(itemType)
        .select(itemType === 'tournaments' ? 'id, name, date, sponsor_id' : itemType === 'players' ? 'id, name, city, sponsor_id, is_public' : 'id, name, city, sponsor_id')
        .ilike('name', `%${text.trim()}%`)
        .limit(10);
      setSearchResults(data || []);
      setSearching(false);
    }, 350);
  }, [supabase, itemType]);

  const handleSubmit = useCallback(async (itemId: string, itemName: string) => {
    // Check tier limit
    if (limits.maxSponsoringTotal !== null) {
      const pendingCount = proposals.filter(p => p.status === 'pending').length;
      if (activeCount + pendingCount >= limits.maxSponsoringTotal) {
        showAlert(
          fr ? 'Limite atteinte' : 'Limit reached',
          fr ? `Votre niveau ${badgeType === 'sponsor' ? 'Argent' : 'Bronze'} autorise ${limits.maxSponsoringTotal} sponsoring(s) actif(s). Passez au niveau superieur pour plus.` : `Your ${badgeType === 'sponsor' ? 'Silver' : 'Bronze'} tier allows ${limits.maxSponsoringTotal} active sponsorship(s). Upgrade for more.`
        );
        setSubmitting(null);
        return;
      }
    }
    // Check item type allowed
    if (!canSponsorItemType(badgeType, itemType)) {
      const typeLabel = itemType === 'clubs' ? (fr ? 'clubs' : 'clubs') : (fr ? 'tournois' : 'tournaments');
      showAlert(
        fr ? 'Non disponible' : 'Not available',
        fr ? `Le sponsoring de ${typeLabel} est reserve au niveau ${itemType === 'tournaments' ? 'Or' : 'Argent'} et superieur.` : `Sponsoring ${typeLabel} is reserved for ${itemType === 'tournaments' ? 'Gold' : 'Silver'} tier and above.`
      );
      setSubmitting(null);
      return;
    }
    setSubmitting(itemId);
    const { error } = await supabase.from('sponsor_proposals').insert({
      ambassador_id: sponsorId,
      ambassador_name: sponsorName,
      item_type: itemType === 'terrains' ? 'terrain' : itemType === 'clubs' ? 'club' : itemType === 'players' ? 'player' : 'tournament',
      item_id: itemId,
      item_name: itemName,
    });
    setSubmitting(null);
    if (error) { showAlert(fr ? 'Erreur' : 'Error', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert(fr ? 'Demande envoyee' : 'Request sent', fr ? 'Votre demande sera examinee par un administrateur.' : 'Your request will be reviewed by an administrator.');
    setSearchQuery(''); setSearchResults([]);
    const { data } = await supabase.from('sponsor_proposals').select('*').eq('ambassador_id', sponsorId).order('created_at', { ascending: false });
    setProposals(data || []);
  }, [sponsorId, sponsorName, itemType, supabase, fr, showAlert]);

  const handleCancel = useCallback(async (id: string) => {
    await supabase.from('sponsor_proposals').delete().eq('id', id);
    setProposals(prev => prev.filter(p => p.id !== id));
    Haptics.selectionAsync();
  }, [supabase]);

  if (!isSilverPlus) {
    return (
      <View style={[s.card, { borderWidth: 1, borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>  
        <MaterialIcons name="lock" size={24} color="#F59E0B" />
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E', textAlign: 'center', marginTop: 8 }}>
          {fr ? 'Sponsoring disponible des Argent' : 'Sponsorship available from Silver'}
        </Text>
        <Text style={{ fontSize: 12, color: '#92400E', textAlign: 'center', lineHeight: 18, marginTop: 4 }}>
          {fr ? 'Passez au tier Argent ou Or pour proposer des associations sponsor.' : 'Upgrade to Silver or Gold to propose sponsor associations.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#2563EB12', alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name="handshake" size={20} color="#2563EB" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Proposer un sponsoring' : 'Propose Sponsorship'}</Text>
          <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{fr ? 'Associez votre banniere a un item' : 'Link your banner to an item'}</Text>
        </View>
      </View>

      {/* Limit indicator */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
        <MaterialIcons name="data-usage" size={16} color={tierColor} />
        <Text style={{ flex: 1, fontSize: 12, color: '#334155' }}>
          {fr ? 'Sponsorings actifs' : 'Active sponsorships'}: <Text style={{ fontWeight: '800', color: tierColor }}>{activeCount}</Text>
          {limits.maxSponsoringTotal !== null ? ` / ${limits.maxSponsoringTotal}` : ` (${fr ? 'illimite' : 'unlimited'})`}
        </Text>
        {limits.maxSponsoringTotal !== null && activeCount >= limits.maxSponsoringTotal ? (
          <View style={{ backgroundColor: '#EF444415', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
            <Text style={{ fontSize: 9, fontWeight: '800', color: '#EF4444' }}>MAX</Text>
          </View>
        ) : null}
      </View>

      {/* Type selector */}
      <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
        {([
          { id: 'terrains' as const, label: fr ? 'Terrains' : 'Terrains', icon: 'sports-soccer', color: '#10B981' },
          { id: 'clubs' as const, label: 'Clubs', icon: 'home', color: '#D97706' },
          { id: 'tournaments' as const, label: fr ? 'Tournois' : 'Tournaments', icon: 'emoji-events', color: '#B45309' },
          { id: 'players' as const, label: fr ? 'Joueurs' : 'Players', icon: 'person', color: '#2563EB' },
        ]).map(t => {
          const active = itemType === t.id;
          const locked = !canSponsorItemType(badgeType, t.id);
          return (
            <Pressable key={t.id} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12, backgroundColor: active ? t.color : '#F8FAFC', borderWidth: 1.5, borderColor: active ? t.color : '#E2E8F0', opacity: locked ? 0.4 : 1 }} onPress={() => { if (locked) { showAlert(fr ? 'Non disponible' : 'Not available', fr ? `Reservee au niveau ${t.id === 'tournaments' ? 'Or' : 'Argent'}.` : `Reserved for ${t.id === 'tournaments' ? 'Gold' : 'Silver'} tier.`); return; } setItemType(t.id); setSearchQuery(''); setSearchResults([]); }}>
              <MaterialIcons name={locked ? 'lock' : t.icon as any} size={14} color={active ? '#FFF' : locked ? '#94A3B8' : t.color} />
              <Text style={{ fontSize: 12, fontWeight: '700', color: active ? '#FFF' : locked ? '#94A3B8' : '#334155' }}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Search */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12 }}>
        <MaterialIcons name="search" size={18} color="#94A3B8" />
        <TextInput style={{ flex: 1, fontSize: 14, color: '#0F172A', padding: 0 }} value={searchQuery} onChangeText={handleSearch} placeholder={fr ? 'Rechercher...' : 'Search...'} placeholderTextColor="#94A3B8" />
        {searching ? <ActivityIndicator size="small" color={tierColor} /> : null}
      </View>

      {/* Results */}
      {searchResults.length > 0 ? (
        <View style={{ gap: 6 }}>
          {searchResults.map((item: any) => {
            const alreadySponsor = item.sponsor_id === sponsorId;
            const hasOther = item.sponsor_id && item.sponsor_id !== sponsorId;
            const alreadyProposed = proposals.some(p => p.item_id === item.id && p.status === 'pending');
            return (
              <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: alreadySponsor ? '#10B98108' : '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: alreadySponsor ? '#10B98130' : '#E2E8F0' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#334155' }} numberOfLines={1}>{item.name}</Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{item.city || (item.date ? new Date(item.date).toLocaleDateString() : '')}</Text>
                </View>
                {alreadySponsor ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10B98112', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
                    <MaterialIcons name="check-circle" size={14} color="#10B981" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>{fr ? 'Actif' : 'Active'}</Text>
                  </View>
                ) : hasOther ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B12', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
                    <MaterialIcons name="warning" size={14} color="#F59E0B" />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#F59E0B' }}>{fr ? 'Pris' : 'Taken'}</Text>
                  </View>
                ) : alreadyProposed ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#3B82F612', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
                    <MaterialIcons name="schedule" size={14} color="#3B82F6" />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6' }}>{fr ? 'En attente' : 'Pending'}</Text>
                  </View>
                ) : (
                  <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 }} onPress={() => handleSubmit(item.id, item.name)} disabled={submitting === item.id}>
                    {submitting === item.id ? <ActivityIndicator size="small" color="#FFF" /> : (
                      <>
                        <MaterialIcons name="send" size={14} color="#FFF" />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>{fr ? 'Proposer' : 'Propose'}</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
      ) : searchQuery.trim().length >= 2 && !searching ? (
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <MaterialIcons name="search-off" size={28} color="#94A3B8" />
          <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>{fr ? 'Aucun resultat' : 'No results'}</Text>
        </View>
      ) : null}

      {/* My proposals */}
      {proposals.length > 0 ? (
        <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 10 }}>{fr ? 'MES DEMANDES' : 'MY REQUESTS'} ({proposals.length})</Text>
          {proposals.map(p => {
            const sc = p.status === 'approved' ? '#10B981' : p.status === 'rejected' ? '#EF4444' : '#F59E0B';
            const sl = p.status === 'approved' ? (fr ? 'Approuve' : 'Approved') : p.status === 'rejected' ? (fr ? 'Refuse' : 'Rejected') : (fr ? 'En attente' : 'Pending');
            return (
              <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }} numberOfLines={1}>{p.item_name}</Text>
                  <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{p.item_type} • {new Date(p.created_at).toLocaleDateString()}</Text>
                </View>
                <View style={{ backgroundColor: sc + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: sc }}>{sl}</Text>
                </View>
                {p.status === 'pending' ? (
                  <Pressable onPress={() => handleCancel(p.id)} hitSlop={8} style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#EF444410', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="close" size={14} color="#EF4444" />
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Info */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, marginTop: 12, borderWidth: 1, borderColor: '#FDE68A' }}>
        <MaterialIcons name="info" size={14} color="#F59E0B" />
        <Text style={{ flex: 1, fontSize: 11, color: '#92400E', lineHeight: 15 }}>
          {fr ? 'Les demandes sont soumises a validation admin avant activation.' : 'Requests are subject to admin validation before activation.'}
        </Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' as any },
});
