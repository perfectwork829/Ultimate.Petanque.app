/**
 * Admin Reports Page
 *
 * Weekly report history with trend graphs (users, matches, clubs)
 * and week-over-week comparison.
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

import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import { useLanguage } from '@/hooks/useLanguage';
import { getSupabaseClient } from '@/template';
// expo-file-system and expo-sharing loaded dynamically to avoid web bundler crash
import AdminGuard from '@/components/feature/AdminGuard';

interface WeeklySnapshot {
  weekStart: string;
  weekLabel: string;
  totalUsers: number;
  newUsers: number;
  totalMatches: number;
  newMatches: number;
  totalClubs: number;
  newClubs: number;
  pendingReports: number;
  pendingAppeals: number;
}

export default function AdminReportsScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const fr = language === 'fr';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snapshots, setSnapshots] = useState<WeeklySnapshot[]>([]);
  const [activeMetric, setActiveMetric] = useState<'users' | 'matches' | 'clubs'>('users');
  const [exporting, setExporting] = useState(false);

  const loadReports = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const now = new Date();
      const weeks: WeeklySnapshot[] = [];

      // Build 8 weeks of data
      for (let i = 7; i >= 0; i--) {
        const weekEnd = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
        const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
        const weekLabel = weekStart.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
        weeks.push({
          weekStart: weekStart.toISOString(),
          weekLabel,
          totalUsers: 0,
          newUsers: 0,
          totalMatches: 0,
          newMatches: 0,
          totalClubs: 0,
          newClubs: 0,
          pendingReports: 0,
          pendingAppeals: 0,
        });
      }

      // Fetch all data in parallel
      const [usersRes, matchesRes, clubsRes, reportsRes, appealsRes] = await Promise.all([
        supabase.from('user_profiles').select('created_at, consent_date'),
        supabase.from('matches').select('created_at').gte('created_at', weeks[0].weekStart),
        supabase.from('clubs').select('created_at').gte('created_at', weeks[0].weekStart),
        supabase.from('player_reports').select('status, created_at'),
        supabase.from('ban_appeals').select('status, created_at'),
      ]);

      const users = usersRes.data || [];
      const matches = matchesRes.data || [];
      const clubs = clubsRes.data || [];
      const reports = reportsRes.data || [];
      const appeals = appealsRes.data || [];

      // Compute running totals
      let runningUsers = users.filter((u: any) => {
        const d = u.created_at || u.consent_date;
        return d && new Date(d) < new Date(weeks[0].weekStart);
      }).length;

      let runningMatches = 0; // Only count new per week
      let runningClubs = 0;

      // Total counts up to start of tracking window
      const totalUsersBase = runningUsers;

      for (let w = 0; w < weeks.length; w++) {
        const wStart = new Date(weeks[w].weekStart);
        const wEnd = w < weeks.length - 1 ? new Date(weeks[w + 1].weekStart) : new Date();

        const newUsersWeek = users.filter((u: any) => {
          const d = u.created_at || u.consent_date;
          if (!d) return false;
          const dt = new Date(d);
          return dt >= wStart && dt < wEnd;
        }).length;

        const newMatchesWeek = matches.filter((m: any) => {
          if (!m.created_at) return false;
          const dt = new Date(m.created_at);
          return dt >= wStart && dt < wEnd;
        }).length;

        const newClubsWeek = clubs.filter((c: any) => {
          if (!c.created_at) return false;
          const dt = new Date(c.created_at);
          return dt >= wStart && dt < wEnd;
        }).length;

        runningUsers += newUsersWeek;

        weeks[w].totalUsers = runningUsers;
        weeks[w].newUsers = newUsersWeek;
        weeks[w].newMatches = newMatchesWeek;
        weeks[w].newClubs = newClubsWeek;

        // Count pending reports/appeals at that point in time
        weeks[w].pendingReports = reports.filter((r: any) => r.status === 'pending' && new Date(r.created_at) <= wEnd).length;
        weeks[w].pendingAppeals = appeals.filter((a: any) => a.status === 'pending' && new Date(a.created_at) <= wEnd).length;
      }

      setSnapshots(weeks);
    } catch (e) {
      console.log('[AdminReports] Error:', e);
    } finally {
      setLoading(false);
    }
  }, [fr]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadReports();
    setRefreshing(false);
  }, [loadReports]);

  const handleExportReport = useCallback(async () => {
    if (exporting || snapshots.length === 0) return;
    setExporting(true);
    try {
      const headers = 'Week,New Users,New Matches,New Clubs,Pending Reports,Pending Appeals,Total Users';
      const rows = snapshots.map(s => `${s.weekLabel},${s.newUsers},${s.newMatches},${s.newClubs},${s.pendingReports},${s.pendingAppeals},${s.totalUsers}`);
      const curr = snapshots[snapshots.length - 1];
      const totalMatches8w = snapshots.reduce((sum, s) => sum + s.newMatches, 0);
      const totalClubs8w = snapshots.reduce((sum, s) => sum + s.newClubs, 0);
      const summary = `\n--- Summary ---\nTotal Users,${curr?.totalUsers || 0}\nMatches (8 weeks),${totalMatches8w}\nClubs (8 weeks),${totalClubs8w}\nPending Reports,${curr?.pendingReports || 0}\nPending Appeals,${curr?.pendingAppeals || 0}`;
      const csv = [headers, ...rows, summary].join('\n');
      if (typeof document !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `weekly-report-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const FS = require('expo-file-system');
        const SH = require('expo-sharing');
        const path = `${FS.cacheDirectory}weekly-report-${new Date().toISOString().slice(0, 10)}.csv`;
        await FS.writeAsStringAsync(path, csv, { encoding: FS.EncodingType.UTF8 });
        const canShare = await SH.isAvailableAsync();
        if (canShare) await SH.shareAsync(path, { mimeType: 'text/csv', dialogTitle: fr ? 'Exporter rapport' : 'Export report' });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { console.log('[Reports] Export error:', e); }
    setExporting(false);
  }, [exporting, snapshots, fr]);

  const metricConfig = useMemo(() => ({
    users: { label: fr ? 'Utilisateurs' : 'Users', color: '#3B82F6', icon: 'people', getNew: (s: WeeklySnapshot) => s.newUsers, getTotal: (s: WeeklySnapshot) => s.totalUsers },
    matches: { label: fr ? 'Matchs' : 'Matches', color: '#10B981', icon: 'sports', getNew: (s: WeeklySnapshot) => s.newMatches, getTotal: (s: WeeklySnapshot) => s.newMatches },
    clubs: { label: 'Clubs', color: '#7C3AED', icon: 'home', getNew: (s: WeeklySnapshot) => s.newClubs, getTotal: (s: WeeklySnapshot) => s.newClubs },
  }), [fr]);

  const currentConfig = metricConfig[activeMetric];
  const currentWeek = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
  const prevWeek = snapshots.length > 1 ? snapshots[snapshots.length - 2] : null;

  const getDelta = (curr: number, prev: number) => {
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{fr ? 'Rapports' : 'Reports'}</Text>
        </View>
        <View style={s.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <AdminGuard language={language} requiredPermission="reports">
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{fr ? 'Rapports hebdomadaires' : 'Weekly Reports'}</Text>
        <Pressable
          style={[s.backBtn, { borderWidth: 1, borderColor: '#DBEAFE' }, exporting && { opacity: 0.5 }]}
          onPress={handleExportReport}
          disabled={exporting}
        >
          {exporting ? <ActivityIndicator size="small" color="#3B82F6" /> : <MaterialIcons name="file-download" size={20} color="#3B82F6" />}
        </Pressable>
      </View>

      <AdminQuickNav currentRoute="/admin-reports" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Summary Cards */}
        {currentWeek ? (
          <View>
            <Text style={s.sectionTitle}>{fr ? 'CETTE SEMAINE' : 'THIS WEEK'}</Text>
            <View style={s.summaryGrid}>
              {([
                { label: fr ? 'Nouveaux utilisateurs' : 'New users', value: currentWeek.newUsers, prev: prevWeek?.newUsers || 0, color: '#3B82F6', icon: 'person-add' },
                { label: fr ? 'Matchs joues' : 'Matches played', value: currentWeek.newMatches, prev: prevWeek?.newMatches || 0, color: '#10B981', icon: 'sports' },
                { label: fr ? 'Nouveaux clubs' : 'New clubs', value: currentWeek.newClubs, prev: prevWeek?.newClubs || 0, color: '#7C3AED', icon: 'home' },
                { label: fr ? 'Signalements' : 'Reports', value: currentWeek.pendingReports, prev: prevWeek?.pendingReports || 0, color: '#EF4444', icon: 'flag' },
              ]).map((card, idx) => {
                const delta = getDelta(card.value, card.prev);
                const isUp = delta > 0;
                const isDown = delta < 0;
                return (
                  <View key={idx} style={[s.summaryCard, { borderColor: card.color + '20' }]}>
                    <View style={[s.summaryIcon, { backgroundColor: card.color + '12' }]}>
                      <MaterialIcons name={card.icon as any} size={16} color={card.color} />
                    </View>
                    <Text style={[s.summaryValue, { color: card.color }]}>{card.value}</Text>
                    <Text style={s.summaryLabel}>{card.label}</Text>
                    {delta !== 0 ? (
                      <View style={[s.summaryDelta, { backgroundColor: isUp ? '#DCFCE7' : '#FEF2F2' }]}>
                        <MaterialIcons name={isUp ? 'trending-up' : 'trending-down'} size={10} color={isUp ? '#10B981' : '#EF4444'} />
                        <Text style={[s.summaryDeltaText, { color: isUp ? '#10B981' : '#EF4444' }]}>{isUp ? '+' : ''}{delta}%</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Metric Selector */}
        <View>
          <Text style={s.sectionTitle}>{fr ? 'TENDANCES' : 'TRENDS'}</Text>
          <View style={s.metricSelector}>
            {(['users', 'matches', 'clubs'] as const).map(key => {
              const cfg = metricConfig[key];
              const isActive = activeMetric === key;
              return (
                <Pressable key={key} style={[s.metricChip, isActive && { backgroundColor: cfg.color, borderColor: cfg.color }]} onPress={() => { Haptics.selectionAsync(); setActiveMetric(key); }}>
                  <MaterialIcons name={cfg.icon as any} size={14} color={isActive ? '#FFF' : '#64748B'} />
                  <Text style={[s.metricChipText, isActive && { color: '#FFF' }]}>{cfg.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Trend Chart */}
        <View>
          <View style={s.chartCard}>
            {(() => {
              const values = snapshots.map(s => currentConfig.getNew(s));
              const maxVal = Math.max(...values, 1);
              return snapshots.map((snap, idx) => {
                const val = values[idx];
                const isLast = idx === snapshots.length - 1;
                const prevVal = idx > 0 ? values[idx - 1] : 0;
                const change = prevVal > 0 ? Math.round(((val - prevVal) / prevVal) * 100) : 0;
                return (
                  <View key={idx} style={s.chartRow}>
                    <Text style={[s.chartLabel, isLast && { color: currentConfig.color, fontWeight: '700' as any }]}>{snap.weekLabel}</Text>
                    <View style={s.chartBarBg}>
                      <View style={[s.chartBarFill, { width: `${Math.max(3, (val / maxVal) * 100)}%`, backgroundColor: isLast ? currentConfig.color : currentConfig.color + '70' }]} />
                    </View>
                    <Text style={[s.chartValue, isLast && { color: currentConfig.color }]}>{val}</Text>
                    {idx > 0 && change !== 0 ? (
                      <Text style={[s.chartChange, { color: change > 0 ? '#10B981' : '#EF4444' }]}>{change > 0 ? '+' : ''}{change}%</Text>
                    ) : <Text style={s.chartChange}> </Text>}
                  </View>
                );
              });
            })()}
          </View>
        </View>

        {/* Week-over-Week Detail Table */}
        <View>
          <Text style={s.sectionTitle}>{fr ? 'DETAIL PAR SEMAINE' : 'WEEKLY DETAIL'}</Text>
          <View style={s.tableCard}>
            {/* Header */}
            <View style={[s.tableRow, s.tableHeader]}>
              <Text style={[s.tableCell, s.tableCellHeader, { flex: 1.2 }]}>{fr ? 'Semaine' : 'Week'}</Text>
              <Text style={[s.tableCell, s.tableCellHeader]}>👤</Text>
              <Text style={[s.tableCell, s.tableCellHeader]}>⚽</Text>
              <Text style={[s.tableCell, s.tableCellHeader]}>🏠</Text>
              <Text style={[s.tableCell, s.tableCellHeader]}>🚩</Text>
            </View>
            {[...snapshots].reverse().map((snap, idx) => {
              const isFirst = idx === 0;
              return (
                <View key={idx} style={[s.tableRow, isFirst && { backgroundColor: '#EFF6FF' }]}>
                  <Text style={[s.tableCell, { flex: 1.2 }, isFirst && { color: '#3B82F6', fontWeight: '700' as any }]}>{snap.weekLabel}{isFirst ? (fr ? ' (actuel)' : ' (current)') : ''}</Text>
                  <Text style={[s.tableCell, isFirst && { fontWeight: '700' as any }]}>{snap.newUsers}</Text>
                  <Text style={[s.tableCell, isFirst && { fontWeight: '700' as any }]}>{snap.newMatches}</Text>
                  <Text style={[s.tableCell, isFirst && { fontWeight: '700' as any }]}>{snap.newClubs}</Text>
                  <Text style={[s.tableCell, isFirst && { fontWeight: '700' as any, color: snap.pendingReports > 0 ? '#EF4444' : '#0F172A' }]}>{snap.pendingReports}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Totals */}
        {currentWeek ? (
          <View>
            <Text style={s.sectionTitle}>{fr ? 'TOTAUX CUMULES' : 'CUMULATIVE TOTALS'}</Text>
            <View style={s.totalsRow}>
              <View style={s.totalCard}>
                <MaterialIcons name="people" size={20} color="#3B82F6" />
                <Text style={[s.totalValue, { color: '#3B82F6' }]}>{currentWeek.totalUsers}</Text>
                <Text style={s.totalLabel}>{fr ? 'Utilisateurs' : 'Users'}</Text>
              </View>
              <View style={s.totalCard}>
                <MaterialIcons name="sports" size={20} color="#10B981" />
                <Text style={[s.totalValue, { color: '#10B981' }]}>{snapshots.reduce((sum, s) => sum + s.newMatches, 0)}</Text>
                <Text style={s.totalLabel}>{fr ? 'Matchs (8 sem.)' : 'Matches (8 wks)'}</Text>
              </View>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
    </AdminGuard>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 10, marginTop: 8, paddingHorizontal: 4 },

  // Summary
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  summaryCard: { width: '48%', flexGrow: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1 },
  summaryIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  summaryValue: { fontSize: 24, fontWeight: '800' },
  summaryLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginTop: 2, textAlign: 'center' },
  summaryDelta: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, marginTop: 6 },
  summaryDeltaText: { fontSize: 10, fontWeight: '800' },

  // Metric selector
  metricSelector: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  metricChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  metricChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },

  // Chart
  chartCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  chartLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', width: 48 },
  chartBarBg: { flex: 1, height: 20, backgroundColor: '#F1F5F9', borderRadius: 6, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: 6 },
  chartValue: { fontSize: 12, fontWeight: '800', color: '#0F172A', width: 28, textAlign: 'right' },
  chartChange: { fontSize: 9, fontWeight: '700', width: 32, textAlign: 'right' },

  // Table
  tableCard: { backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 16 },
  tableRow: { flexDirection: 'row', paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  tableHeader: { backgroundColor: '#F8FAFC' },
  tableCell: { flex: 1, fontSize: 11, fontWeight: '500', color: '#0F172A', textAlign: 'center' },
  tableCellHeader: { fontWeight: '700', color: '#64748B', fontSize: 10 },

  // Totals
  totalsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  totalCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 16, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#F1F5F9' },
  totalValue: { fontSize: 26, fontWeight: '800' },
  totalLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', textAlign: 'center' },
});
