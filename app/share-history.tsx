/**
 * Share Request History Page
 * Shows all past share requests across all matches with status,
 * ELO impact summary, and timeline.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, getSupabaseClient } from '@/template';
import { getSentShareRequests, getReceivedShareRequests, MatchShareRequest, getShareRequestRemainingTime } from '@/services/matchShareService';

type FilterKey = 'all' | 'sent' | 'received' | 'pending' | 'accepted' | 'declined';
type DateRange = 'all' | '7d' | '30d' | '3m';
type SortKey = 'date' | 'elo';

interface EnrichedRequest extends MatchShareRequest {
  direction: 'sent' | 'received';
  recipientName?: string;
  eloDelta?: number;
  matchSummary?: string;
}

export default function ShareHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { user } = useAuth();
  const fr = language === 'fr';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<EnrichedRequest[]>([]);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [dateRange, setDateRange] = useState<DateRange>('all');
  const [sortBy, setSortBy] = useState<SortKey>('date');

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    try {
      const [sentResult, receivedResult] = await Promise.all([
        getSentShareRequests(),
        getReceivedShareRequests(),
      ]);

      const all: EnrichedRequest[] = [];

      // Enrich sent requests
      for (const req of sentResult.requests) {
        let recipientName = req.recipientUserId?.slice(0, 8) || '?';
        try {
          const { data: profile } = await supabase.from('user_profiles').select('username').eq('id', req.recipientUserId).single();
          if (profile?.username) recipientName = profile.username;
        } catch { /* silent */ }

        // Fetch ELO delta if accepted
        let eloDelta: number | undefined;
        if (req.status === 'accepted' && req.itemType === 'match') {
          try {
            const { data: eloRow } = await supabase
              .from('elo_history')
              .select('elo_delta')
              .eq('player_id', req.recipientUserId)
              .eq('match_id', req.itemId)
              .limit(1)
              .single();
            if (eloRow) eloDelta = eloRow.elo_delta;
          } catch { /* silent */ }
        }

        // Fetch match summary
        let matchSummary = req.itemSummary || '';
        if (!matchSummary && req.itemType === 'match') {
          try {
            const { data: match } = await supabase.from('matches').select('team_a, team_b').eq('id', req.itemId).single();
            if (match) {
              const ta = typeof match.team_a === 'string' ? JSON.parse(match.team_a) : match.team_a;
              const tb = typeof match.team_b === 'string' ? JSON.parse(match.team_b) : match.team_b;
              matchSummary = `${(ta?.playerNames || []).join(', ')} vs ${(tb?.playerNames || []).join(', ')} (${ta?.score || 0}-${tb?.score || 0})`;
            }
          } catch { /* silent */ }
        }

        all.push({ ...req, direction: 'sent', recipientName, eloDelta, matchSummary });
      }

      // Enrich received requests
      for (const req of receivedResult.requests) {
        let senderDisplayName = req.senderName || req.senderUserId?.slice(0, 8) || '?';

        let eloDelta: number | undefined;
        if (req.status === 'accepted' && req.itemType === 'match') {
          try {
            const { data: eloRow } = await supabase
              .from('elo_history')
              .select('elo_delta')
              .eq('player_id', user.id)
              .eq('match_id', req.itemId)
              .limit(1)
              .single();
            if (eloRow) eloDelta = eloRow.elo_delta;
          } catch { /* silent */ }
        }

        let matchSummary = req.itemSummary || '';
        if (!matchSummary && req.itemType === 'match') {
          try {
            const { data: match } = await supabase.from('matches').select('team_a, team_b').eq('id', req.itemId).single();
            if (match) {
              const ta = typeof match.team_a === 'string' ? JSON.parse(match.team_a) : match.team_a;
              const tb = typeof match.team_b === 'string' ? JSON.parse(match.team_b) : match.team_b;
              matchSummary = `${(ta?.playerNames || []).join(', ')} vs ${(tb?.playerNames || []).join(', ')} (${ta?.score || 0}-${tb?.score || 0})`;
            }
          } catch { /* silent */ }
        }

        // Avoid duplicates (same request appearing in both sent and received if same user)
        if (!all.find(a => a.id === req.id)) {
          all.push({ ...req, direction: 'received', senderName: senderDisplayName, eloDelta, matchSummary });
        }
      }

      // Sort by date descending
      all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRequests(all);
    } catch (e) {
      console.log('[ShareHistory] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const filtered = useMemo(() => {
    let items = requests;
    // Direction / status filter
    if (filter === 'sent') items = items.filter(r => r.direction === 'sent');
    if (filter === 'received') items = items.filter(r => r.direction === 'received');
    if (filter === 'pending') items = items.filter(r => r.status === 'pending');
    if (filter === 'accepted') items = items.filter(r => r.status === 'accepted');
    if (filter === 'declined') items = items.filter(r => r.status === 'declined');
    // Date range filter
    if (dateRange !== 'all') {
      const now = Date.now();
      const msMap: Record<string, number> = { '7d': 7 * 86400000, '30d': 30 * 86400000, '3m': 90 * 86400000 };
      const cutoff = now - (msMap[dateRange] || 0);
      items = items.filter(r => new Date(r.createdAt).getTime() >= cutoff);
    }
    // Sort
    if (sortBy === 'elo') {
      items = [...items].sort((a, b) => Math.abs(b.eloDelta || 0) - Math.abs(a.eloDelta || 0));
    }
    // else already sorted by date desc from loadData
    return items;
  }, [requests, filter, dateRange, sortBy]);

  // Summary stats
  const stats = useMemo(() => {
    const sent = requests.filter(r => r.direction === 'sent').length;
    const received = requests.filter(r => r.direction === 'received').length;
    const accepted = requests.filter(r => r.status === 'accepted').length;
    const pending = requests.filter(r => r.status === 'pending').length;
    const declined = requests.filter(r => r.status === 'declined').length;
    const totalEloDelta = requests
      .filter(r => r.eloDelta !== undefined)
      .reduce((sum, r) => sum + (r.eloDelta || 0), 0);
    return { sent, received, accepted, pending, declined, totalEloDelta, total: requests.length };
  }, [requests]);

  const FILTERS: { key: FilterKey; labelFr: string; labelEn: string; icon: string }[] = [
    { key: 'all', labelFr: 'Tout', labelEn: 'All', icon: 'list' },
    { key: 'sent', labelFr: 'Envoyes', labelEn: 'Sent', icon: 'call-made' },
    { key: 'received', labelFr: 'Recus', labelEn: 'Received', icon: 'call-received' },
    { key: 'pending', labelFr: 'En attente', labelEn: 'Pending', icon: 'schedule' },
    { key: 'accepted', labelFr: 'Acceptes', labelEn: 'Accepted', icon: 'check-circle' },
    { key: 'declined', labelFr: 'Refuses', labelEn: 'Declined', icon: 'cancel' },
  ];

  const statusConfig: Record<string, { icon: string; color: string; labelFr: string; labelEn: string }> = {
    pending: { icon: 'schedule', color: '#F59E0B', labelFr: 'En attente', labelEn: 'Pending' },
    accepted: { icon: 'check-circle', color: '#10B981', labelFr: 'Accepte', labelEn: 'Accepted' },
    declined: { icon: 'cancel', color: '#EF4444', labelFr: 'Refuse', labelEn: 'Declined' },
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{fr ? 'Historique des partages' : 'Share History'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{fr ? 'Historique des partages' : 'Share History'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Summary Card */}
        <Animated.View entering={FadeInDown.duration(250)} style={s.summaryCard}>
          <View style={s.summaryHeader}>
            <View style={s.summaryIconBg}>
              <MaterialIcons name="swap-horiz" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.summaryTitle}>{fr ? 'Resume des partages' : 'Share Summary'}</Text>
              <Text style={s.summarySub}>{stats.total} {fr ? 'partage(s) au total' : 'total share(s)'}</Text>
            </View>
          </View>
          <View style={s.summaryGrid}>
            <View style={s.summaryItem}>
              <View style={[s.summaryItemIcon, { backgroundColor: '#3B82F612' }]}>
                <MaterialIcons name="call-made" size={14} color="#3B82F6" />
              </View>
              <Text style={s.summaryItemValue}>{stats.sent}</Text>
              <Text style={s.summaryItemLabel}>{fr ? 'Envoyes' : 'Sent'}</Text>
            </View>
            <View style={s.summaryItem}>
              <View style={[s.summaryItemIcon, { backgroundColor: '#7C3AED12' }]}>
                <MaterialIcons name="call-received" size={14} color="#7C3AED" />
              </View>
              <Text style={s.summaryItemValue}>{stats.received}</Text>
              <Text style={s.summaryItemLabel}>{fr ? 'Recus' : 'Received'}</Text>
            </View>
            <View style={s.summaryItem}>
              <View style={[s.summaryItemIcon, { backgroundColor: '#10B98112' }]}>
                <MaterialIcons name="check-circle" size={14} color="#10B981" />
              </View>
              <Text style={s.summaryItemValue}>{stats.accepted}</Text>
              <Text style={s.summaryItemLabel}>{fr ? 'Acceptes' : 'Accepted'}</Text>
            </View>
            <View style={s.summaryItem}>
              <View style={[s.summaryItemIcon, { backgroundColor: '#F59E0B12' }]}>
                <MaterialIcons name="schedule" size={14} color="#F59E0B" />
              </View>
              <Text style={s.summaryItemValue}>{stats.pending}</Text>
              <Text style={s.summaryItemLabel}>{fr ? 'En attente' : 'Pending'}</Text>
            </View>
          </View>
          {/* ELO impact summary */}
          {stats.totalEloDelta !== 0 ? (
            <View style={[s.eloSummary, { backgroundColor: (stats.totalEloDelta >= 0 ? '#10B981' : '#EF4444') + '08', borderColor: (stats.totalEloDelta >= 0 ? '#10B981' : '#EF4444') + '20' }]}>
              <MaterialIcons name={stats.totalEloDelta >= 0 ? 'trending-up' : 'trending-down'} size={16} color={stats.totalEloDelta >= 0 ? '#10B981' : '#EF4444'} />
              <Text style={[s.eloSummaryText, { color: stats.totalEloDelta >= 0 ? '#10B981' : '#EF4444' }]}>
                {fr ? 'Impact ELO total' : 'Total ELO impact'}: {stats.totalEloDelta >= 0 ? '+' : ''}{stats.totalEloDelta}
              </Text>
            </View>
          ) : null}
        </Animated.View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipBar}>
          {FILTERS.map(f => {
            const isActive = filter === f.key;
            return (
              <Pressable
                key={f.key}
                style={[s.chip, isActive && s.chipActive]}
                onPress={() => { Haptics.selectionAsync(); setFilter(f.key); }}
              >
                <MaterialIcons name={f.icon as any} size={14} color={isActive ? '#FFF' : theme.textSecondary} />
                <Text style={[s.chipText, isActive && s.chipTextActive]}>{fr ? f.labelFr : f.labelEn}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Date range + Sort row */}
        <View style={s.filterRow}>
          <View style={s.filterGroup}>
            <MaterialIcons name="date-range" size={14} color={theme.textMuted} />
            {(['all', '7d', '30d', '3m'] as DateRange[]).map(dr => {
              const isActive = dateRange === dr;
              const label = dr === 'all' ? (fr ? 'Tout' : 'All') : dr === '7d' ? '7j' : dr === '30d' ? '30j' : '3m';
              return (
                <Pressable
                  key={dr}
                  style={[s.miniChip, isActive && s.miniChipActive]}
                  onPress={() => { Haptics.selectionAsync(); setDateRange(dr); }}
                >
                  <Text style={[s.miniChipText, isActive && s.miniChipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            style={[s.sortBtn, sortBy === 'elo' && s.sortBtnActive]}
            onPress={() => { Haptics.selectionAsync(); setSortBy(sortBy === 'elo' ? 'date' : 'elo'); }}
          >
            <MaterialIcons name={sortBy === 'elo' ? 'trending-up' : 'swap-vert'} size={14} color={sortBy === 'elo' ? '#FFF' : theme.textSecondary} />
            <Text style={[s.sortBtnText, sortBy === 'elo' && s.sortBtnTextActive]}>
              {sortBy === 'elo' ? 'ELO' : (fr ? 'Date' : 'Date')}
            </Text>
          </Pressable>
        </View>

        {/* Results count */}
        <View style={s.resultCountRow}>
          <Text style={s.resultCount}>{filtered.length} {fr ? 'resultat(s)' : 'result(s)'}</Text>
          {dateRange !== 'all' ? (
            <Pressable style={s.clearDateBtn} onPress={() => setDateRange('all')} hitSlop={6}>
              <MaterialIcons name="close" size={12} color={theme.primary} />
              <Text style={s.clearDateBtnText}>{fr ? 'Toutes dates' : 'All dates'}</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Request list */}
        {filtered.length > 0 ? (
          <View style={s.listSection}>
            {filtered.map((req, idx) => {
              const cfg = statusConfig[req.status] || statusConfig.pending;
              const isSent = req.direction === 'sent';
              const remaining = getShareRequestRemainingTime(req.createdAt, req.status);
              const dateStr = new Date(req.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
              const timeStr = new Date(req.createdAt).toLocaleTimeString(fr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
              return (
                <Animated.View key={req.id} entering={FadeInDown.duration(200).delay(idx * 25)}>
                  <Pressable
                    style={[s.card, { borderLeftWidth: 3, borderLeftColor: cfg.color }]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      if (req.itemType === 'match') {
                        router.push(`/match-detail/${req.itemId}` as any);
                      } else {
                        router.push(`/challenge/${req.itemId}` as any);
                      }
                    }}
                  >
                    <View style={s.cardRow}>
                      <View style={[s.cardIconBg, { backgroundColor: (isSent ? '#3B82F6' : '#7C3AED') + '12' }]}>
                        <MaterialIcons name={isSent ? 'call-made' : 'call-received'} size={18} color={isSent ? '#3B82F6' : '#7C3AED'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={s.cardTitle} numberOfLines={1}>
                            {isSent
                              ? `→ ${req.recipientName || '?'}`
                              : `← ${req.senderName || '?'}`}
                          </Text>
                          <View style={[s.directionChip, { backgroundColor: (isSent ? '#3B82F6' : '#7C3AED') + '12' }]}>
                            <Text style={[s.directionChipText, { color: isSent ? '#3B82F6' : '#7C3AED' }]}>
                              {isSent ? (fr ? 'Envoye' : 'Sent') : (fr ? 'Recu' : 'Received')}
                            </Text>
                          </View>
                        </View>
                        {req.matchSummary ? (
                          <Text style={s.cardMeta} numberOfLines={1}>{req.matchSummary}</Text>
                        ) : null}
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <View style={[s.typeChip, { backgroundColor: (req.itemType === 'match' ? theme.primary : '#7C3AED') + '10' }]}>
                            <MaterialIcons name={req.itemType === 'match' ? 'sports' : 'track-changes'} size={9} color={req.itemType === 'match' ? theme.primary : '#7C3AED'} />
                            <Text style={[s.typeChipText, { color: req.itemType === 'match' ? theme.primary : '#7C3AED' }]}>
                              {req.itemType === 'match' ? 'Match' : (fr ? 'Defi' : 'Challenge')}
                            </Text>
                          </View>
                          <View style={[s.permChip, { backgroundColor: (req.permission === 'write' ? theme.accent : theme.textMuted) + '10' }]}>
                            <MaterialIcons name={req.permission === 'write' ? 'edit' : 'visibility'} size={9} color={req.permission === 'write' ? theme.accent : theme.textMuted} />
                            <Text style={[s.permChipText, { color: req.permission === 'write' ? theme.accent : theme.textMuted }]}>
                              {req.permission === 'write' ? (fr ? 'Modif.' : 'Edit') : (fr ? 'Lect.' : 'Read')}
                            </Text>
                          </View>
                          <Text style={s.cardDate}>{dateStr} {timeStr}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Status + ELO + Expiry */}
                    <View style={s.cardFooter}>
                      <View style={[s.statusBadge, { backgroundColor: cfg.color + '12' }]}>
                        <MaterialIcons name={cfg.icon as any} size={12} color={cfg.color} />
                        <Text style={[s.statusBadgeText, { color: cfg.color }]}>{fr ? cfg.labelFr : cfg.labelEn}</Text>
                      </View>
                      {req.eloDelta !== undefined ? (
                        <View style={[s.eloBadge, { backgroundColor: (req.eloDelta >= 0 ? '#10B981' : '#EF4444') + '12' }]}>
                          <MaterialIcons name={req.eloDelta >= 0 ? 'arrow-upward' : 'arrow-downward'} size={10} color={req.eloDelta >= 0 ? '#10B981' : '#EF4444'} />
                          <Text style={[s.eloBadgeText, { color: req.eloDelta >= 0 ? '#10B981' : '#EF4444' }]}>
                            {req.eloDelta >= 0 ? '+' : ''}{req.eloDelta} ELO
                          </Text>
                        </View>
                      ) : null}
                      {remaining ? (
                        <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <MaterialIcons name="timer" size={10} color={remaining.daysLeft <= 1 ? '#EF4444' : '#F59E0B'} />
                          <Text style={{ fontSize: 9, fontWeight: '600', color: remaining.daysLeft <= 1 ? '#EF4444' : '#F59E0B' }}>
                            {remaining.isExpired
                              ? (fr ? 'Expire' : 'Expired')
                              : remaining.daysLeft > 0
                                ? `${remaining.daysLeft}${fr ? 'j' : 'd'} ${remaining.hoursLeft}h`
                                : `${remaining.hoursLeft}h`}
                          </Text>
                        </View>
                      ) : null}
                      <MaterialIcons name="chevron-right" size={16} color={theme.textMuted} style={{ marginLeft: remaining ? 0 : 'auto' }} />
                    </View>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        ) : (
          <View style={s.emptyState}>
            <View style={s.emptyIconBg}>
              <MaterialIcons name={filter !== 'all' ? 'filter-list-off' : 'swap-horiz'} size={40} color={theme.textMuted} />
            </View>
            <Text style={s.emptyTitle}>{filter !== 'all' ? (fr ? 'Aucun resultat' : 'No results') : (fr ? 'Aucun partage' : 'No shares')}</Text>
            <Text style={s.emptyDesc}>
              {filter !== 'all'
                ? (fr ? 'Essayez un autre filtre' : 'Try a different filter')
                : (fr ? 'Vos partages de matchs et defis apparaitront ici' : 'Your match and challenge shares will appear here')}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  // Summary
  summaryCard: { backgroundColor: theme.surface, borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: theme.border },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  summaryIconBg: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },
  summarySub: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  summaryGrid: { flexDirection: 'row', gap: 8 },
  summaryItem: { flex: 1, alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 10, gap: 4 },
  summaryItemIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  summaryItemValue: { fontSize: 18, fontWeight: '800', color: theme.textPrimary },
  summaryItemLabel: { fontSize: 9, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  eloSummary: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  eloSummaryText: { fontSize: 13, fontWeight: '700' },

  // Filter row
  filterRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 10, gap: 8 },
  filterGroup: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, flex: 1 },
  miniChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  miniChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  miniChipText: { fontSize: 11, fontWeight: '700' as const, color: theme.textSecondary },
  miniChipTextActive: { color: '#FFF' },
  sortBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  sortBtnActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  sortBtnText: { fontSize: 11, fontWeight: '700' as const, color: theme.textSecondary },
  sortBtnTextActive: { color: '#FFF' },
  clearDateBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: theme.primary + '10' },
  clearDateBtnText: { fontSize: 10, fontWeight: '600' as const, color: theme.primary },

  // Chips
  chipBar: { gap: 6, paddingBottom: 12 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  chipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  chipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  chipTextActive: { color: '#FFF' },

  // Results count
  resultCountRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
  resultCount: { fontSize: 12, fontWeight: '600', color: theme.textMuted },

  // List
  listSection: { gap: 8 },
  card: { backgroundColor: theme.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  cardIconBg: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, flex: 1 },
  cardMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 3, lineHeight: 17 },
  cardDate: { fontSize: 10, color: theme.textMuted, fontWeight: '500' },
  directionChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  directionChipText: { fontSize: 9, fontWeight: '700' },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  typeChipText: { fontSize: 9, fontWeight: '700' },
  permChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  permChipText: { fontSize: 9, fontWeight: '700' },

  // Footer
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '40' },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },
  eloBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  eloBadgeText: { fontSize: 10, fontWeight: '700' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIconBg: { width: 72, height: 72, borderRadius: 22, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: theme.textMuted, textAlign: 'center', lineHeight: 19 },
});
