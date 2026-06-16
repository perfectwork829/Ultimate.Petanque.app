/**
 * Admin A/B Test History Dashboard
 *
 * Dedicated page showing complete A/B test history with:
 * - Overall win statistics (A vs B)
 * - Comparison charts per test
 * - Win rate by message type patterns
 * - Recommendations based on past results
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
import { useLanguage } from '@/hooks/useLanguage';
import { getSupabaseClient } from '@/template';
import AdminGuard from '@/components/feature/AdminGuard';
import PageErrorBoundary from '@/components/ui/PageErrorBoundary';

interface ABTest {
  id: string;
  titleFr: string;
  titleEn: string;
  messageFr: string;
  messageEn: string;
  targetType: string;
  targetValue: string | null;
  createdAt: string;
  pushSentCount: number;
  pushErrorCount: number;
  abData: {
    variantB?: { titleFr: string; titleEn: string; messageFr: string; messageEn: string };
    variantASent?: number;
    variantAErrors?: number;
    variantBSent?: number;
    variantBErrors?: number;
    winner?: 'A' | 'B' | null;
    winnerDeterminedAt?: string;
    winnerRateA?: number;
    winnerRateB?: number;
    resent?: boolean;
    resentSent?: number;
  };
}

export default function AdminABTestsScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const fr = language === 'fr';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tests, setTests] = useState<ABTest[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .not('ab_data', 'is', null)
        .eq('status', 'sent')
        .order('created_at', { ascending: false })
        .limit(50);

      if (data) {
        setTests(data.filter((a: any) => a.ab_data?.variantB).map((a: any) => ({
          id: a.id,
          titleFr: a.title_fr,
          titleEn: a.title_en,
          messageFr: a.message_fr,
          messageEn: a.message_en,
          targetType: a.target_type,
          targetValue: a.target_value,
          createdAt: a.created_at,
          pushSentCount: a.push_sent_count || 0,
          pushErrorCount: a.push_error_count || 0,
          abData: a.ab_data,
        })));
      }
    } catch (e) {
      console.log('[ABTests] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Aggregate statistics
  const stats = useMemo(() => {
    const total = tests.length;
    const withWinner = tests.filter(t => t.abData.winner);
    const aWins = withWinner.filter(t => t.abData.winner === 'A').length;
    const bWins = withWinner.filter(t => t.abData.winner === 'B').length;
    const pending = total - withWinner.length;
    const resent = tests.filter(t => t.abData.resent).length;

    // Average delivery rates
    let totalARate = 0, totalBRate = 0, rateCount = 0;
    withWinner.forEach(t => {
      const aS = t.abData.variantASent || 0;
      const aE = t.abData.variantAErrors || 0;
      const bS = t.abData.variantBSent || 0;
      const bE = t.abData.variantBErrors || 0;
      if (aS > 0 && bS > 0) {
        totalARate += Math.round(((aS - aE) / aS) * 100);
        totalBRate += Math.round(((bS - bE) / bS) * 100);
        rateCount++;
      }
    });
    const avgARate = rateCount > 0 ? Math.round(totalARate / rateCount) : 0;
    const avgBRate = rateCount > 0 ? Math.round(totalBRate / rateCount) : 0;

    // Win margin analysis
    const margins: number[] = [];
    withWinner.forEach(t => {
      const aR = t.abData.winnerRateA || (t.abData.variantASent ? Math.round(((t.abData.variantASent - (t.abData.variantAErrors || 0)) / t.abData.variantASent) * 100) : 0);
      const bR = t.abData.winnerRateB || (t.abData.variantBSent ? Math.round(((t.abData.variantBSent - (t.abData.variantBErrors || 0)) / t.abData.variantBSent) * 100) : 0);
      margins.push(Math.abs(aR - bR));
    });
    const avgMargin = margins.length > 0 ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) : 0;

    // Target type breakdown
    const targetBreakdown: Record<string, { total: number; aWins: number; bWins: number }> = {};
    withWinner.forEach(t => {
      const tt = t.targetType || 'all';
      if (!targetBreakdown[tt]) targetBreakdown[tt] = { total: 0, aWins: 0, bWins: 0 };
      targetBreakdown[tt].total++;
      if (t.abData.winner === 'A') targetBreakdown[tt].aWins++;
      else targetBreakdown[tt].bWins++;
    });

    // Monthly trend
    const monthlyMap: Record<string, { total: number; aWins: number; bWins: number }> = {};
    tests.forEach(t => {
      const m = new Date(t.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
      if (!monthlyMap[m]) monthlyMap[m] = { total: 0, aWins: 0, bWins: 0 };
      monthlyMap[m].total++;
      if (t.abData.winner === 'A') monthlyMap[m].aWins++;
      else if (t.abData.winner === 'B') monthlyMap[m].bWins++;
    });
    const monthly = Object.entries(monthlyMap).map(([month, d]) => ({ month, ...d }));

    return { total, aWins, bWins, pending, resent, avgARate, avgBRate, avgMargin, targetBreakdown, monthly };
  }, [tests, fr]);

  // Recommendations
  const recommendations = useMemo(() => {
    const recs: { icon: string; color: string; text: string }[] = [];
    if (stats.total < 3) {
      recs.push({ icon: 'science', color: '#3B82F6', text: fr ? 'Lancez plus de tests A/B pour obtenir des insights statistiquement significatifs (minimum 5 recommande).' : 'Run more A/B tests for statistically significant insights (minimum 5 recommended).' });
      return recs;
    }
    if (stats.aWins > stats.bWins * 2) {
      recs.push({ icon: 'lightbulb', color: '#F59E0B', text: fr ? 'La variante A (message principal) gagne systematiquement. Essayez des variantes B plus differenciees pour de meilleurs tests.' : 'Variant A (main message) wins consistently. Try more differentiated B variants for better tests.' });
    }
    if (stats.bWins > stats.aWins * 2) {
      recs.push({ icon: 'trending-up', color: '#10B981', text: fr ? 'La variante B gagne souvent. Envisagez d\'appliquer ces patterns dans vos messages principaux.' : 'Variant B wins often. Consider applying these patterns to your main messages.' });
    }
    if (stats.avgMargin < 3) {
      recs.push({ icon: 'info', color: '#0EA5E9', text: fr ? 'Les marges de victoire sont faibles (< 3pts). Les variantes sont trop similaires. Testez des changements plus radicaux (ton, longueur, emojis).' : 'Win margins are small (< 3pts). Variants are too similar. Test more radical changes (tone, length, emojis).' });
    }
    if (stats.avgMargin > 15) {
      recs.push({ icon: 'emoji-events', color: '#10B981', text: fr ? 'Excellentes marges de victoire (>15pts). Vos tests revelent de vraies differences. Continuez a exploiter les gagnants via "Renvoyer gagnant".' : 'Excellent win margins (>15pts). Your tests reveal real differences. Continue leveraging winners via "Resend winner".' });
    }
    if (stats.resent < stats.aWins + stats.bWins && stats.total >= 3) {
      recs.push({ icon: 'send', color: '#7C3AED', text: fr ? `Vous n\'avez renvoye que ${stats.resent}/${stats.aWins + stats.bWins} gagnant(s). Utilisez "Renvoyer gagnant" pour maximiser l\'impact.` : `You have only resent ${stats.resent}/${stats.aWins + stats.bWins} winner(s). Use "Resend winner" to maximize impact.` });
    }
    // Target type insight
    const bestTarget = Object.entries(stats.targetBreakdown).sort((a, b) => b[1].total - a[1].total)[0];
    if (bestTarget && bestTarget[1].total >= 2) {
      const bWinRate = bestTarget[1].total > 0 ? Math.round((bestTarget[1].bWins / bestTarget[1].total) * 100) : 0;
      if (bWinRate > 60) {
        recs.push({ icon: 'people', color: '#EC4899', text: fr ? `Pour le ciblage "${bestTarget[0]}", la variante B gagne ${bWinRate}% du temps. Adaptez vos messages principaux en consequence.` : `For "${bestTarget[0]}" targeting, variant B wins ${bWinRate}% of the time. Adapt your main messages accordingly.` });
      }
    }
    return recs;
  }, [stats, fr]);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
          </Pressable>
          <Text style={s.headerTitle}>A/B Tests</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <PageErrorBoundary pageName="ABTests">
    <AdminGuard language={language}>
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </Pressable>
        <Text style={s.headerTitle}>A/B Tests</Text>
        <Pressable style={s.backBtn} onPress={() => { Haptics.selectionAsync(); router.push('/admin-announcements' as any); }}>
          <MaterialIcons name="campaign" size={20} color="#7C3AED" />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {tests.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 64 }}>
            <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <MaterialIcons name="science" size={36} color="#7C3AED" />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 6 }}>{fr ? 'Aucun test A/B' : 'No A/B tests yet'}</Text>
            <Text style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', maxWidth: 280, lineHeight: 19 }}>
              {fr ? 'Activez le toggle A/B Test dans la page Annonces pour creer votre premier test.' : 'Enable the A/B Test toggle in the Announcements page to create your first test.'}
            </Text>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, backgroundColor: '#7C3AED' }}
              onPress={() => { Haptics.selectionAsync(); router.push('/admin-announcements' as any); }}
            >
              <MaterialIcons name="add" size={18} color="#FFF" />
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{fr ? 'Creer un test A/B' : 'Create A/B test'}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Overview KPIs */}
            <Text style={s.sectionTitle}>{fr ? 'VUE D\'ENSEMBLE' : 'OVERVIEW'}</Text>
            <View style={s.kpiRow}>
              <View style={[s.kpiCard, { borderColor: '#7C3AED20' }]}>
                <Text style={[s.kpiValue, { color: '#7C3AED' }]}>{stats.total}</Text>
                <Text style={s.kpiLabel}>{fr ? 'Tests' : 'Tests'}</Text>
              </View>
              <View style={[s.kpiCard, { borderColor: '#3B82F620' }]}>
                <Text style={[s.kpiValue, { color: '#3B82F6' }]}>{stats.aWins}</Text>
                <Text style={s.kpiLabel}>A {fr ? 'gagne' : 'wins'}</Text>
              </View>
              <View style={[s.kpiCard, { borderColor: '#10B98120' }]}>
                <Text style={[s.kpiValue, { color: '#10B981' }]}>{stats.bWins}</Text>
                <Text style={s.kpiLabel}>B {fr ? 'gagne' : 'wins'}</Text>
              </View>
              <View style={[s.kpiCard, { borderColor: '#F59E0B20' }]}>
                <Text style={[s.kpiValue, { color: '#F59E0B' }]}>{stats.pending}</Text>
                <Text style={s.kpiLabel}>{fr ? 'En cours' : 'Pending'}</Text>
              </View>
            </View>

            {/* Win Rate Donut-like Visualization */}
            {(stats.aWins + stats.bWins) > 0 ? (
              <View style={s.card}>
                <Text style={s.cardTitle}>{fr ? 'Taux de victoire' : 'Win Rate'}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                  <View style={{ flex: 1, height: 24, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', backgroundColor: '#F1F5F9' }}>
                    <View style={{ width: `${Math.round((stats.aWins / (stats.aWins + stats.bWins)) * 100)}%`, backgroundColor: '#3B82F6', borderRadius: 12 }} />
                    <View style={{ width: `${Math.round((stats.bWins / (stats.aWins + stats.bWins)) * 100)}%`, backgroundColor: '#10B981', borderTopRightRadius: 12, borderBottomRightRadius: 12 }} />
                  </View>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#3B82F6' }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#3B82F6' }}>A: {Math.round((stats.aWins / (stats.aWins + stats.bWins)) * 100)}%</Text>
                    <Text style={{ fontSize: 10, color: '#94A3B8' }}>({stats.aWins})</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: '#10B981' }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#10B981' }}>B: {Math.round((stats.bWins / (stats.aWins + stats.bWins)) * 100)}%</Text>
                    <Text style={{ fontSize: 10, color: '#94A3B8' }}>({stats.bWins})</Text>
                  </View>
                </View>
                {/* Average rates */}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                  <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#3B82F608', borderRadius: 10, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#3B82F6' }}>{stats.avgARate}%</Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Livraison moy. A' : 'Avg delivery A'}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#10B98108', borderRadius: 10, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#10B981' }}>{stats.avgBRate}%</Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Livraison moy. B' : 'Avg delivery B'}</Text>
                  </View>
                  <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#F59E0B08', borderRadius: 10, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 18, fontWeight: '800', color: '#F59E0B' }}>{stats.avgMargin}pts</Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Marge moy.' : 'Avg margin'}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Resend stats */}
            {stats.resent > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#DCFCE7', borderRadius: 12, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: '#BBF7D0' }}>
                <MaterialIcons name="send" size={16} color="#10B981" />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#166534' }}>
                  {stats.resent} {fr ? 'gagnant(s) renvoye(s) a l\'autre moitie' : 'winner(s) resent to the other half'}
                </Text>
              </View>
            ) : null}

            {/* Target type breakdown */}
            {Object.keys(stats.targetBreakdown).length > 0 ? (
              <>
                <Text style={s.sectionTitle}>{fr ? 'PAR TYPE DE CIBLAGE' : 'BY TARGET TYPE'}</Text>
                <View style={s.card}>
                  {Object.entries(stats.targetBreakdown).map(([tt, data]) => {
                    const targetLabels: Record<string, string> = { all: fr ? 'Tous' : 'All', city: fr ? 'Ville' : 'City', club: 'Club', rank: fr ? 'Rang' : 'Rank', account_age: fr ? 'Nouveaux' : 'New', match_count: fr ? 'Matchs' : 'Matches', last_active: fr ? 'Inactifs' : 'Inactive' };
                    const targetColors: Record<string, string> = { all: '#10B981', city: '#2563EB', club: '#7C3AED', rank: '#D97706', account_age: '#0EA5E9', match_count: '#EC4899', last_active: '#6366F1' };
                    const aWinPct = data.total > 0 ? Math.round((data.aWins / data.total) * 100) : 0;
                    const bWinPct = data.total > 0 ? Math.round((data.bWins / data.total) * 100) : 0;
                    return (
                      <View key={tt} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
                        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: (targetColors[tt] || '#94A3B8') + '12', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: targetColors[tt] || '#94A3B8' }}>{data.total}</Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#0F172A' }}>{targetLabels[tt] || tt}</Text>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          <View style={{ backgroundColor: '#3B82F615', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#3B82F6' }}>A {aWinPct}%</Text>
                          </View>
                          <View style={{ backgroundColor: '#10B98115', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#10B981' }}>B {bWinPct}%</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}

            {/* Monthly trend */}
            {stats.monthly.length > 1 ? (
              <>
                <Text style={s.sectionTitle}>{fr ? 'TENDANCE MENSUELLE' : 'MONTHLY TREND'}</Text>
                <View style={s.card}>
                  {(() => {
                    const maxM = Math.max(...stats.monthly.map(m => m.total), 1);
                    return stats.monthly.map((m, idx) => (
                      <View key={m.month} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <Text style={{ width: 46, fontSize: 9, fontWeight: idx === stats.monthly.length - 1 ? '800' : '600', color: idx === stats.monthly.length - 1 ? '#7C3AED' : '#94A3B8' }}>{m.month}</Text>
                        <View style={{ flex: 1, height: 18, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', flexDirection: 'row' }}>
                          {m.aWins > 0 ? <View style={{ height: '100%', width: `${Math.max(2, (m.aWins / maxM) * 100)}%`, backgroundColor: '#3B82F6' }} /> : null}
                          {m.bWins > 0 ? <View style={{ height: '100%', width: `${Math.max(2, (m.bWins / maxM) * 100)}%`, backgroundColor: '#10B981' }} /> : null}
                          {(m.total - m.aWins - m.bWins) > 0 ? <View style={{ height: '100%', width: `${Math.max(2, ((m.total - m.aWins - m.bWins) / maxM) * 100)}%`, backgroundColor: '#F59E0B' }} /> : null}
                        </View>
                        <Text style={{ width: 20, fontSize: 10, fontWeight: '800', color: '#0F172A', textAlign: 'right' }}>{m.total}</Text>
                      </View>
                    ));
                  })()}
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 6, justifyContent: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#3B82F6' }} />
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>A</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#10B981' }} />
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>B</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#F59E0B' }} />
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'En cours' : 'Pending'}</Text>
                    </View>
                  </View>
                </View>
              </>
            ) : null}

            {/* Recommendations */}
            {recommendations.length > 0 ? (
              <>
                <Text style={s.sectionTitle}>{fr ? 'RECOMMANDATIONS' : 'RECOMMENDATIONS'}</Text>
                <View style={{ gap: 8, marginBottom: 16 }}>
                  {recommendations.map((rec, idx) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: rec.color + '08', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: rec.color + '20' }}>
                      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: rec.color + '15', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                        <MaterialIcons name={rec.icon as any} size={16} color={rec.color} />
                      </View>
                      <Text style={{ flex: 1, fontSize: 12, color: rec.color + 'DD', lineHeight: 18 }}>{rec.text}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* Test History */}
            <Text style={s.sectionTitle}>{fr ? 'HISTORIQUE DES TESTS' : 'TEST HISTORY'} ({tests.length})</Text>
            <View style={{ gap: 8, marginBottom: 16 }}>
              {tests.map((test) => {
                const ab = test.abData;
                const aSent = ab.variantASent || 0;
                const aErr = ab.variantAErrors || 0;
                const bSent = ab.variantBSent || 0;
                const bErr = ab.variantBErrors || 0;
                const aRate = aSent > 0 ? Math.round(((aSent - aErr) / aSent) * 100) : 0;
                const bRate = bSent > 0 ? Math.round(((bSent - bErr) / bSent) * 100) : 0;
                const winner = ab.winner;
                const isExpanded = expandedId === test.id;
                const margin = Math.abs(aRate - bRate);

                return (
                  <Pressable
                    key={test.id}
                    style={[s.testCard, winner ? { borderLeftColor: winner === 'A' ? '#3B82F6' : '#10B981' } : { borderLeftColor: '#F59E0B' }]}
                    onPress={() => { Haptics.selectionAsync(); setExpandedId(isExpanded ? null : test.id); }}
                  >
                    {/* Header */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: winner ? (winner === 'A' ? '#3B82F612' : '#10B98112') : '#F59E0B12', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name={winner ? 'emoji-events' : 'hourglass-top'} size={16} color={winner ? (winner === 'A' ? '#3B82F6' : '#10B981') : '#F59E0B'} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>
                          {fr ? test.titleFr : test.titleEn}
                        </Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>
                          {new Date(test.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' • '}{test.targetType}
                          {test.pushSentCount > 0 ? ` • ${test.pushSentCount} sent` : ''}
                        </Text>
                      </View>
                      {winner ? (
                        <View style={{ backgroundColor: winner === 'A' ? '#3B82F615' : '#10B98115', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: winner === 'A' ? '#3B82F6' : '#10B981' }}>{winner} +{margin}pts</Text>
                        </View>
                      ) : (
                        <View style={{ backgroundColor: '#F59E0B15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#F59E0B' }}>{fr ? 'En cours' : 'Pending'}</Text>
                        </View>
                      )}
                      <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={18} color="#94A3B8" />
                    </View>

                    {/* Comparison bars */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: winner === 'A' ? '#3B82F6' : '#64748B' }}>A{winner === 'A' ? ' \u2605' : ''}</Text>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: winner === 'A' ? '#3B82F6' : '#0F172A' }}>{aRate}%</Text>
                        </View>
                        <View style={{ height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${Math.max(3, aRate)}%`, backgroundColor: winner === 'A' ? '#3B82F6' : '#93C5FD', borderRadius: 4 }} />
                        </View>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: winner === 'B' ? '#10B981' : '#64748B' }}>B{winner === 'B' ? ' \u2605' : ''}</Text>
                          <Text style={{ fontSize: 11, fontWeight: '800', color: winner === 'B' ? '#10B981' : '#0F172A' }}>{bRate}%</Text>
                        </View>
                        <View style={{ height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                          <View style={{ height: '100%', width: `${Math.max(3, bRate)}%`, backgroundColor: winner === 'B' ? '#10B981' : '#86EFAC', borderRadius: 4 }} />
                        </View>
                      </View>
                    </View>

                    {/* Expanded details */}
                    {isExpanded ? (
                      <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                        {/* Variant A details */}
                        <View style={{ marginBottom: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' }}>
                              <Text style={{ fontSize: 8, fontWeight: '900', color: '#FFF' }}>A</Text>
                            </View>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#3B82F6' }}>{fr ? 'Variante A (Principale)' : 'Variant A (Main)'}</Text>
                          </View>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#0F172A', marginBottom: 2 }}>{fr ? test.titleFr : test.titleEn}</Text>
                          <Text style={{ fontSize: 10, color: '#64748B', lineHeight: 15 }} numberOfLines={3}>{fr ? test.messageFr : test.messageEn}</Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                            <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Envoyes' : 'Sent'}: {aSent}</Text>
                            {aErr > 0 ? <Text style={{ fontSize: 9, fontWeight: '600', color: '#EF4444' }}>{fr ? 'Erreurs' : 'Errors'}: {aErr}</Text> : null}
                          </View>
                        </View>
                        {/* Variant B details */}
                        {ab.variantB ? (
                          <View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 8, fontWeight: '900', color: '#FFF' }}>B</Text>
                              </View>
                              <Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>{fr ? 'Variante B' : 'Variant B'}</Text>
                            </View>
                            <Text style={{ fontSize: 11, fontWeight: '600', color: '#0F172A', marginBottom: 2 }}>{fr ? ab.variantB.titleFr : ab.variantB.titleEn}</Text>
                            <Text style={{ fontSize: 10, color: '#64748B', lineHeight: 15 }} numberOfLines={3}>{fr ? ab.variantB.messageFr : ab.variantB.messageEn}</Text>
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                              <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Envoyes' : 'Sent'}: {bSent}</Text>
                              {bErr > 0 ? <Text style={{ fontSize: 9, fontWeight: '600', color: '#EF4444' }}>{fr ? 'Erreurs' : 'Errors'}: {bErr}</Text> : null}
                            </View>
                          </View>
                        ) : null}
                        {/* Resent info */}
                        {ab.resent ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#DCFCE7', borderRadius: 8, padding: 8 }}>
                            <MaterialIcons name="check-circle" size={12} color="#10B981" />
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#166534' }}>
                              {fr ? 'Gagnant renvoye' : 'Winner resent'}: {ab.resentSent || 0} {fr ? 'envoyes' : 'sent'}
                            </Text>
                          </View>
                        ) : null}
                        {/* Winner determination time */}
                        {ab.winnerDeterminedAt ? (
                          <Text style={{ fontSize: 9, color: '#94A3B8', marginTop: 6 }}>
                            {fr ? 'Gagnant determine le' : 'Winner determined'} {new Date(ab.winnerDeterminedAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
    </AdminGuard>
    </PageErrorBoundary>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 10, marginTop: 8, paddingHorizontal: 4 },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  kpiCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  kpiValue: { fontSize: 22, fontWeight: '800' },
  kpiLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 3, elevation: 1 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 12 },
  testCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F1F5F9', borderLeftWidth: 3 },
});
