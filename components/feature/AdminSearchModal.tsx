/**
 * Admin Global Search Modal
 * 
 * Searches across users, clubs, terrains, reports, and activity logs.
 * Results are grouped by category with navigation to detail pages.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { getSupabaseClient } from '@/template';
import theme from '@/constants/theme';

interface SearchResult {
  id: string;
  type: 'user' | 'club' | 'terrain' | 'report' | 'player' | 'suspicious' | 'transfer' | 'announcement';
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  route: string;
}

interface AdminSearchModalProps {
  visible: boolean;
  onClose: () => void;
  language: string;
}

const TYPE_CONFIG = {
  user: { icon: 'person', color: '#3B82F6', labelFr: 'Utilisateurs', labelEn: 'Users' },
  club: { icon: 'home', color: '#7C3AED', labelFr: 'Clubs', labelEn: 'Clubs' },
  terrain: { icon: 'sports-soccer', color: '#10B981', labelFr: 'Terrains', labelEn: 'Terrains' },
  report: { icon: 'flag', color: '#EF4444', labelFr: 'Signalements', labelEn: 'Reports' },
  player: { icon: 'sports', color: '#D97706', labelFr: 'Joueurs', labelEn: 'Players' },
  suspicious: { icon: 'gpp-bad', color: '#DC2626', labelFr: 'Joueurs suspects', labelEn: 'Suspicious Players' },
  transfer: { icon: 'swap-horiz', color: '#0EA5E9', labelFr: 'Transferts', labelEn: 'Transfers' },
  announcement: { icon: 'campaign', color: '#7C3AED', labelFr: 'Annonces', labelEn: 'Announcements' },
};

export default function AdminSearchModal({ visible, onClose, language }: AdminSearchModalProps) {
  const fr = language === 'fr';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 300);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  const performSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const supabase = getSupabaseClient();
      const searchTerm = `%${q.trim().toLowerCase()}%`;
      const allResults: SearchResult[] = [];

      // Search users
      const { data: users } = await supabase
        .from('user_profiles')
        .select('id, username, email, is_admin, is_premium')
        .or(`username.ilike.${searchTerm},email.ilike.${searchTerm}`)
        .limit(5);
      (users || []).forEach((u: any) => {
        const badges = [u.is_admin ? 'Admin' : null, u.is_premium ? 'Premium' : null].filter(Boolean).join(' · ');
        allResults.push({
          id: u.id, type: 'user', title: u.username || u.email,
          subtitle: `${u.email}${badges ? ` · ${badges}` : ''}`,
          icon: 'person', color: '#3B82F6', route: '/admin-users',
        });
      });

      // Search clubs
      const { data: clubs } = await supabase
        .from('clubs')
        .select('id, name, city, is_verified, members_count')
        .or(`name.ilike.${searchTerm},city.ilike.${searchTerm}`)
        .limit(5);
      (clubs || []).forEach((c: any) => {
        allResults.push({
          id: c.id, type: 'club', title: c.name,
          subtitle: `${c.city} · ${c.members_count || 0} ${fr ? 'membres' : 'members'}${c.is_verified ? ' ✓' : ''}`,
          icon: 'home', color: '#7C3AED', route: `/club/${c.id}`,
        });
      });

      // Search terrains
      const { data: terrains } = await supabase
        .from('terrains')
        .select('id, name, city, type')
        .or(`name.ilike.${searchTerm},city.ilike.${searchTerm}`)
        .limit(5);
      (terrains || []).forEach((t: any) => {
        allResults.push({
          id: t.id, type: 'terrain', title: t.name,
          subtitle: `${t.city} · ${t.type}`,
          icon: 'sports-soccer', color: '#10B981', route: `/terrain/${t.id}`,
        });
      });

      // Search players
      const { data: players } = await supabase
        .from('players')
        .select('id, name, club, city:location->>city, role')
        .or(`name.ilike.${searchTerm},club.ilike.${searchTerm}`)
        .limit(5);
      (players || []).forEach((p: any) => {
        allResults.push({
          id: p.id, type: 'player', title: p.name,
          subtitle: [p.role, p.club].filter(Boolean).join(' · '),
          icon: 'sports', color: '#D97706', route: `/player/${p.id}`,
        });
      });

      // Search suspicious players
      const { data: suspicious } = await supabase
        .from('suspicious_players')
        .select('id, player_id, trust_score, status, details')
        .or(`status.ilike.${searchTerm}`)
        .limit(5);
      // Also search by player name in suspicious table via join
      const { data: suspByName } = await supabase
        .from('players')
        .select('id, name, user_id')
        .ilike('name', searchTerm)
        .limit(10);
      const suspPlayerIds = new Set((suspByName || []).map((p: any) => p.id));
      if (suspPlayerIds.size > 0) {
        const { data: suspMatched } = await supabase
          .from('suspicious_players')
          .select('id, player_id, trust_score, status')
          .in('player_id', [...suspPlayerIds])
          .limit(5);
        const nameMap = new Map((suspByName || []).map((p: any) => [p.id, p.name]));
        (suspMatched || []).forEach((sp: any) => {
          if (!allResults.some(r => r.type === 'suspicious' && r.id === sp.id)) {
            allResults.push({
              id: sp.id, type: 'suspicious',
              title: nameMap.get(sp.player_id) || sp.player_id.substring(0, 8),
              subtitle: `Trust: ${sp.trust_score}/100 · ${sp.status}`,
              icon: 'gpp-bad', color: '#DC2626', route: '/admin-anticheat',
            });
          }
        });
      }

      // Search pending transfers
      const { data: transfers } = await supabase
        .from('player_transfer_requests')
        .select('id, player_name, status, sender_user_id, recipient_user_id, created_at')
        .ilike('player_name', searchTerm)
        .limit(5);
      (transfers || []).forEach((t: any) => {
        const statusLabel = t.status === 'pending' ? (fr ? 'En attente' : 'Pending') : t.status;
        allResults.push({
          id: t.id, type: 'transfer', title: t.player_name,
          subtitle: `${statusLabel} · ${new Date(t.created_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}`,
          icon: 'swap-horiz', color: '#0EA5E9', route: '/admin-dashboard',
        });
      });

      // Search announcements
      const { data: announcements } = await supabase
        .from('announcements')
        .select('id, title_fr, title_en, target_type, push_sent_count, created_at, status')
        .or(`title_fr.ilike.${searchTerm},title_en.ilike.${searchTerm},message_fr.ilike.${searchTerm}`)
        .order('created_at', { ascending: false })
        .limit(5);
      (announcements || []).forEach((a: any) => {
        const title = fr ? a.title_fr : (a.title_en || a.title_fr);
        const statusBadge = a.status === 'scheduled' ? (fr ? ' [Planifie]' : ' [Scheduled]') : a.status === 'cancelled' ? (fr ? ' [Annule]' : ' [Cancelled]') : '';
        allResults.push({
          id: a.id, type: 'announcement', title: title + statusBadge,
          subtitle: `${a.target_type} · ${a.push_sent_count} sent · ${new Date(a.created_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}`,
          icon: 'campaign', color: '#7C3AED', route: '/admin-announcements',
        });
      });

      setResults(allResults);
    } catch (e) {
      console.log('[AdminSearch] Error:', e);
    } finally {
      setSearching(false);
    }
  }, [fr]);

  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(text), 300);
  }, [performSearch]);

  const handleSelect = useCallback((result: SearchResult) => {
    Haptics.selectionAsync();
    onClose();
    setTimeout(() => router.push(result.route as any), 200);
  }, [onClose]);

  // Group results by type
  const grouped = results.reduce((acc, r) => {
    if (!acc[r.type]) acc[r.type] = [];
    acc[r.type].push(r);
    return acc;
  }, {} as Record<string, SearchResult[]>);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <View style={s.searchBar}>
            <MaterialIcons name="search" size={22} color="#94A3B8" />
            <TextInput
              ref={inputRef}
              style={s.searchInput}
              value={query}
              onChangeText={handleQueryChange}
              placeholder={fr ? 'Rechercher utilisateurs, clubs, terrains...' : 'Search users, clubs, terrains...'}
              placeholderTextColor="#94A3B8"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <Pressable onPress={() => { setQuery(''); setResults([]); }} hitSlop={8}>
                <MaterialIcons name="close" size={20} color="#94A3B8" />
              </Pressable>
            ) : null}
          </View>
          <Pressable style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>{fr ? 'Fermer' : 'Close'}</Text>
          </Pressable>
        </View>

        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {searching ? (
            <View style={s.centerWrap}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={s.searchingText}>{fr ? 'Recherche...' : 'Searching...'}</Text>
            </View>
          ) : query.length < 2 ? (
            <View style={s.centerWrap}>
              <View style={s.hintIcon}><MaterialIcons name="search" size={40} color="#CBD5E1" /></View>
              <Text style={s.hintTitle}>{fr ? 'Recherche globale admin' : 'Admin global search'}</Text>
              <Text style={s.hintDesc}>{fr ? 'Tapez au moins 2 caracteres pour rechercher dans toutes les donnees admin.' : 'Type at least 2 characters to search across all admin data.'}</Text>
              <View style={s.hintCategories}>
                {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                  <View key={key} style={[s.hintCat, { backgroundColor: cfg.color + '10' }]}>
                    <MaterialIcons name={cfg.icon as any} size={14} color={cfg.color} />
                    <Text style={[s.hintCatText, { color: cfg.color }]}>{fr ? cfg.labelFr : cfg.labelEn}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : results.length === 0 ? (
            <View style={s.centerWrap}>
              <MaterialIcons name="search-off" size={48} color="#CBD5E1" />
              <Text style={s.emptyTitle}>{fr ? 'Aucun resultat' : 'No results'}</Text>
              <Text style={s.emptyDesc}>{fr ? `Aucun resultat pour "${query}"` : `No results for "${query}"`}</Text>
            </View>
          ) : (
            Object.entries(grouped).map(([type, items]) => {
              const cfg = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
              if (!cfg) return null;
              return (
                <View key={type} style={s.group}>
                  <View style={s.groupHeader}>
                    <MaterialIcons name={cfg.icon as any} size={14} color={cfg.color} />
                    <Text style={[s.groupTitle, { color: cfg.color }]}>{fr ? cfg.labelFr : cfg.labelEn}</Text>
                    <View style={[s.groupCount, { backgroundColor: cfg.color + '15' }]}>
                      <Text style={[s.groupCountText, { color: cfg.color }]}>{items.length}</Text>
                    </View>
                  </View>
                  {items.map(item => (
                    <Pressable key={item.id} style={s.resultItem} onPress={() => handleSelect(item)}>
                      <View style={[s.resultIcon, { backgroundColor: item.color + '12' }]}>
                        <MaterialIcons name={item.icon as any} size={18} color={item.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.resultTitle} numberOfLines={1}>{item.title}</Text>
                        <Text style={s.resultSubtitle} numberOfLines={1}>{item.subtitle}</Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={18} color="#CBD5E1" />
                    </Pressable>
                  ))}
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 10 : 4 },
  searchInput: { flex: 1, fontSize: 16, color: '#0F172A', padding: 0 },
  cancelBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  cancelText: { fontSize: 15, fontWeight: '600', color: '#3B82F6' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },

  centerWrap: { alignItems: 'center', paddingVertical: 56 },
  searchingText: { fontSize: 14, color: '#94A3B8', marginTop: 12 },
  hintIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  hintTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  hintDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center' },
  hintCategories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20, justifyContent: 'center' },
  hintCat: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  hintCatText: { fontSize: 12, fontWeight: '600' },

  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginTop: 12 },
  emptyDesc: { fontSize: 13, color: '#94A3B8', marginTop: 4 },

  group: { marginBottom: 20 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 4 },
  groupTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', flex: 1 },
  groupCount: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  groupCountText: { fontSize: 10, fontWeight: '800' },

  resultItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 6, borderWidth: 1, borderColor: '#F1F5F9', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 3 }, android: { elevation: 1 }, default: {} }) },
  resultIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  resultSubtitle: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
});
