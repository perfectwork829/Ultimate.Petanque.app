import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  RefreshControl, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';
import { Image } from 'expo-image';
import { LinearGradient as LG2 } from 'expo-linear-gradient';
import Svg, { Polyline, Circle as SvgCircle, Rect as SvgRect } from 'react-native-svg';

interface DigestEntry {
  id: string;
  date: string;
  impressions: number;
  clicks: number;
  ctr: string;
  pushes: number;
  weekLabel: string;
}

function Sparkline({ data, width, height, color }: { data: number[]; width: number; height: number; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const points = data.map((v, i) => `${pad + (i / (data.length - 1)) * w},${pad + h - (v / max) * h}`).join(' ');
  const lastIdx = data.length - 1;
  const lastX = pad + (lastIdx / (data.length - 1)) * w;
  const lastY = pad + h - (data[lastIdx] / max) * h;
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      <SvgCircle cx={lastX} cy={lastY} r={4} fill={color} />
    </Svg>
  );
}

function ComparisonBarChart({ label, current, previous, color, suffix, fr }: { label: string; current: number; previous: number; color: string; suffix?: string; fr: boolean }) {
  const max = Math.max(current, previous, 1);
  const diff = previous > 0 ? Math.round(((current - previous) / previous) * 100) : (current > 0 ? 100 : 0);
  const isUp = diff >= 0;
  const barW = 140;
  const barH = 48;
  const gap = 6;
  const bw = (barW - gap) / 2;
  const h1 = Math.max(6, (previous / max) * (barH - 4));
  const h2 = Math.max(6, (current / max) * (barH - 4));
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 6, textTransform: 'uppercase' }}>{label}</Text>
      <View style={{ width: barW, height: barH, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap }}>
        <Svg width={bw} height={barH}>
          <SvgRect x={0} y={barH - h1} width={bw} height={h1} rx={4} ry={4} fill="#CBD5E1" opacity={0.6} />
        </Svg>
        <Svg width={bw} height={barH}>
          <SvgRect x={0} y={barH - h2} width={bw} height={h2} rx={4} ry={4} fill={color} />
        </Svg>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <Text style={{ fontSize: 9, color: '#94A3B8' }}>{previous}{suffix || ''}</Text>
        <Text style={{ fontSize: 13, fontWeight: '900', color }}>{current}{suffix || ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3, backgroundColor: isUp ? '#10B98112' : '#EF444412', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
        <MaterialIcons name={isUp ? 'arrow-upward' : 'arrow-downward'} size={8} color={isUp ? '#10B981' : '#EF4444'} />
        <Text style={{ fontSize: 9, fontWeight: '800', color: isUp ? '#10B981' : '#EF4444' }}>{isUp ? '+' : ''}{diff}%</Text>
      </View>
    </View>
  );
}

export default function SponsorDigestScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { language } = useLanguage();
  const fr = language === 'fr';
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sponsor, setSponsor] = useState<any | null>(null);
  const [digests, setDigests] = useState<DigestEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [exportingDigest, setExportingDigest] = useState(false);
  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);

  const chartW = Math.min(screenWidth - 100, 420);

  const loadData = useCallback(async () => {
    if (!user?.id) return;
    // Load sponsor record
    const { data: sp } = await supabase
      .from('ambassadors')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    setSponsor(sp);
    if (!sp) { setLoading(false); return; }

    // Load digest entries
    const { data: digestData } = await supabase
      .from('ambassador_analytics')
      .select('id, created_at, source_page')
      .eq('ambassador_id', sp.id)
      .eq('event_type', 'weekly_digest')
      .order('created_at', { ascending: false })
      .limit(12);

    if (digestData && digestData.length > 0) {
      const entries: DigestEntry[] = digestData.map((d: any) => {
        const parts = (d.source_page || '').split('|');
        const parseKV = (s: string) => { const p = s.split(':'); return p[1] || '0'; };
        const dt = new Date(d.created_at);
        const weekStart = new Date(dt);
        weekStart.setDate(dt.getDate() - dt.getDay() + 1);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        const weekLabel = `${weekStart.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}`;
        return {
          id: d.id,
          date: d.created_at,
          impressions: parseInt(parseKV(parts[0] || 'imp:0')) || 0,
          clicks: parseInt(parseKV(parts[1] || 'clk:0')) || 0,
          ctr: parseKV(parts[2] || 'ctr:0'),
          pushes: parseInt(parseKV(parts[3] || 'push:0')) || 0,
          weekLabel,
        };
      });
      setDigests(entries);
      if (entries.length > 0) setSelectedIdx(0);
    }
    setLoading(false);
  }, [user?.id, fr, supabase]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const isGold = sponsor?.badge_type === 'gold_sponsor';
  const tierColor = isGold ? '#D4A017' : sponsor?.badge_type === 'sponsor' ? '#78909C' : '#A1887F';

  // Compute trends from digest history
  const impTrend = digests.map(d => d.impressions);
  const clkTrend = digests.map(d => d.clicks).reverse();
  const impTrendReversed = [...impTrend].reverse();

  // Week-over-week comparison
  const selected = selectedIdx !== null ? digests[selectedIdx] : null;
  const previous = selectedIdx !== null && selectedIdx + 1 < digests.length ? digests[selectedIdx + 1] : null;

  const computeChange = (current: number, prev: number): { value: string; positive: boolean } => {
    if (prev === 0) return { value: current > 0 ? '+100%' : '0%', positive: current >= 0 };
    const pct = Math.round(((current - prev) / prev) * 100);
    return { value: `${pct >= 0 ? '+' : ''}${pct}%`, positive: pct >= 0 };
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loadingWrap}><ActivityIndicator size="large" color="#6366F1" /></View>
      </SafeAreaView>
    );
  }

  if (!sponsor) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.headerRow}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{fr ? 'Historique Digests' : 'Digest History'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.loadingWrap}>
          <MaterialIcons name="lock" size={48} color={theme.textMuted} />
          <Text style={s.emptyText}>{fr ? 'Acces reserve aux sponsors' : 'Sponsors only'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.headerRow}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{fr ? 'Historique Digests' : 'Digest History'}</Text>
        <Pressable style={s.backBtn} onPress={() => router.push('/sponsor-portal' as any)}>
          <MaterialIcons name="dashboard" size={20} color={tierColor} />
        </Pressable>
      </View>

      {/* Hero */}
      <LinearGradient colors={['#4338CA', '#6366F1', '#818CF8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.hero}>
        <View style={s.heroDecoCircle1} />
        <View style={s.heroContent}>
          <View style={s.heroIconWrap}>
            <MaterialIcons name="email" size={28} color="#FFF" />
          </View>
          <Text style={s.heroTitle}>{fr ? 'Recaps Hebdomadaires' : 'Weekly Recaps'}</Text>
          <Text style={s.heroSub}>
            {fr ? `${digests.length} digest(s) disponible(s)` : `${digests.length} digest(s) available`}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#6366F1" />}
      >
        {digests.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(300)} style={s.emptyCard}>
            <MaterialIcons name="inbox" size={48} color="#94A3B8" />
            <Text style={s.emptyCardTitle}>{fr ? 'Aucun digest envoye' : 'No digests sent'}</Text>
            <Text style={s.emptyCardDesc}>
              {fr ? 'Les recaps hebdomadaires sont envoyes automatiquement chaque lundi.' : 'Weekly recaps are sent automatically every Monday.'}
            </Text>
          </Animated.View>
        ) : (
          <>
            {/* 3-Month Trend */}
            {digests.length >= 3 ? (
              <Animated.View entering={FadeInDown.duration(300)} style={s.trendCard}>
                <View style={s.trendHeader}>
                  <MaterialIcons name="trending-up" size={18} color="#6366F1" />
                  <Text style={s.trendTitle}>{fr ? 'Tendance 3 mois' : '3-Month Trend'}</Text>
                </View>
                <View style={s.trendChartBlock}>
                  <View style={s.trendChartHeader}>
                    <View style={[s.trendDot, { backgroundColor: '#3B82F6' }]} />
                    <Text style={s.trendLabel}>{fr ? 'Impressions' : 'Impressions'}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Sparkline data={impTrendReversed} width={chartW} height={48} color="#3B82F6" />
                  </View>
                </View>
                <View style={[s.trendChartBlock, { marginTop: 12 }]}>
                  <View style={s.trendChartHeader}>
                    <View style={[s.trendDot, { backgroundColor: '#10B981' }]} />
                    <Text style={s.trendLabel}>{fr ? 'Clics' : 'Clicks'}</Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Sparkline data={clkTrend} width={chartW} height={48} color="#10B981" />
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {/* Selected Digest Detail */}
            {selected ? (
              <Animated.View entering={FadeInDown.duration(300).delay(100)} style={s.detailCard}>
                <View style={s.detailHeader}>
                  <View style={s.detailIcon}>
                    <MaterialIcons name="email" size={20} color="#6366F1" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.detailTitle}>{selected.weekLabel}</Text>
                    <Text style={s.detailDate}>
                      {new Date(selected.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </Text>
                  </View>
                </View>

                {/* KPIs */}
                <View style={s.detailKpiRow}>
                  {[
                    { value: selected.impressions, label: 'Impressions', color: '#3B82F6', icon: 'visibility' as const, change: previous ? computeChange(selected.impressions, previous.impressions) : null },
                    { value: selected.clicks, label: fr ? 'Clics' : 'Clicks', color: '#10B981', icon: 'touch-app' as const, change: previous ? computeChange(selected.clicks, previous.clicks) : null },
                    { value: `${selected.ctr}%`, label: 'CTR', color: '#F59E0B', icon: 'trending-up' as const, change: previous ? computeChange(parseFloat(selected.ctr), parseFloat(previous.ctr)) : null },
                    { value: selected.pushes, label: 'Push', color: '#7C3AED', icon: 'notifications' as const, change: previous ? computeChange(selected.pushes, previous.pushes) : null },
                  ].map((kpi, i) => (
                    <View key={i} style={s.detailKpi}>
                      <MaterialIcons name={kpi.icon} size={16} color={kpi.color} />
                      <Text style={[s.detailKpiValue, { color: kpi.color }]}>{kpi.value}</Text>
                      <Text style={s.detailKpiLabel}>{kpi.label}</Text>
                      {kpi.change ? (
                        <View style={[s.detailKpiChange, { backgroundColor: kpi.change.positive ? '#10B98112' : '#EF444412' }]}>
                          <MaterialIcons name={kpi.change.positive ? 'arrow-upward' : 'arrow-downward'} size={8} color={kpi.change.positive ? '#10B981' : '#EF4444'} />
                          <Text style={[s.detailKpiChangeText, { color: kpi.change.positive ? '#10B981' : '#EF4444' }]}>{kpi.change.value}</Text>
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>

                {/* Week-over-week comparison */}
                {previous ? (
                  <View style={s.wowBlock}>
                    <View style={s.wowHeader}>
                      <MaterialIcons name="compare-arrows" size={14} color="#64748B" />
                      <Text style={s.wowTitle}>{fr ? 'vs semaine precedente' : 'vs previous week'}</Text>
                    </View>
                    <View style={s.wowRow}>
                      <View style={s.wowCell}>
                        <Text style={s.wowCellLabel}>{fr ? 'Cette semaine' : 'This week'}</Text>
                        <Text style={[s.wowCellValue, { color: '#6366F1' }]}>{selected.impressions}</Text>
                      </View>
                      <View style={s.wowDivider} />
                      <View style={s.wowCell}>
                        <Text style={s.wowCellLabel}>{fr ? 'Sem. precedente' : 'Previous week'}</Text>
                        <Text style={s.wowCellValue}>{previous.impressions}</Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                {/* Comparison Bar Charts */}
                {previous ? (
                  <View style={{ marginTop: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                      <MaterialIcons name="bar-chart" size={16} color="#6366F1" />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Comparaison visuelle' : 'Visual Comparison'}</Text>
                    </View>
                    {/* Legend */}
                    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: '#CBD5E1', opacity: 0.6 }} />
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Sem. precedente' : 'Previous'}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: '#6366F1' }} />
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Cette semaine' : 'This week'}</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <ComparisonBarChart label="Impressions" current={selected.impressions} previous={previous.impressions} color="#3B82F6" fr={fr} />
                      <ComparisonBarChart label={fr ? 'Clics' : 'Clicks'} current={selected.clicks} previous={previous.clicks} color="#10B981" fr={fr} />
                      <ComparisonBarChart label="CTR" current={parseFloat(selected.ctr)} previous={parseFloat(previous.ctr)} color="#F59E0B" suffix="%" fr={fr} />
                      <ComparisonBarChart label="Push" current={selected.pushes} previous={previous.pushes} color="#7C3AED" fr={fr} />
                    </View>
                  </View>
                ) : null}

                {/* Share / Export Digest */}
                <View style={{ marginTop: 14 }}>
                  <Pressable
                    style={({ pressed }) => [s.shareBtn, exportingDigest && { opacity: 0.6 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                    onPress={async () => {
                      if (!selected || !sponsor) return;
                      setExportingDigest(true);
                      try {
                        const tierCol = isGold ? '#D4A017' : sponsor?.badge_type === 'sponsor' ? '#78909C' : '#A1887F';
                        const tierLbl = isGold ? (fr ? 'Partenaire Or' : 'Gold Partner') : sponsor?.badge_type === 'sponsor' ? (fr ? 'Partenaire Argent' : 'Silver Partner') : (fr ? 'Partenaire Bronze' : 'Bronze Partner');
                        const prevRow = previous;
                        const impChg = prevRow ? (prevRow.impressions > 0 ? Math.round(((selected.impressions - prevRow.impressions) / prevRow.impressions) * 100) : 100) : 0;
                        const clkChg = prevRow ? (prevRow.clicks > 0 ? Math.round(((selected.clicks - prevRow.clicks) / prevRow.clicks) * 100) : 100) : 0;
                        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
                          body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:32px;color:#0F172A}
                          .hdr{text-align:center;padding:24px;border-radius:16px;background:linear-gradient(135deg,${tierCol},${tierCol}CC);color:#FFF;margin-bottom:28px}
                          .hdr h1{margin:0 0 4px;font-size:20px}.hdr .badge{display:inline-block;background:rgba(255,255,255,0.2);padding:2px 10px;border-radius:6px;font-size:10px;font-weight:800;letter-spacing:0.5px}
                          .hdr .week{font-size:14px;opacity:0.8;margin-top:8px}
                          .kpi-row{display:flex;gap:12px;margin-bottom:24px}
                          .kpi{flex:1;text-align:center;background:#F8FAFC;border-radius:14px;padding:16px;border:1px solid #E2E8F0}
                          .kpi-val{font-size:28px;font-weight:900}.kpi-lbl{font-size:10px;font-weight:600;color:#94A3B8;text-transform:uppercase;margin-top:4px}
                          .kpi-chg{font-size:10px;font-weight:800;margin-top:4px}
                          .section{margin-bottom:24px}.section-title{font-size:14px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #E2E8F0}
                          .wow-row{display:flex;gap:12px}.wow-cell{flex:1;text-align:center;background:#F8FAFC;border-radius:12px;padding:14px;border:1px solid #E2E8F0}
                          .wow-lbl{font-size:10px;color:#94A3B8;font-weight:600}.wow-val{font-size:22px;font-weight:900;margin-top:4px}
                          .footer{text-align:center;font-size:11px;color:#94A3B8;margin-top:28px;padding-top:16px;border-top:1px solid #E2E8F0}
                        </style></head><body>
                          <div class="hdr">
                            <div class="badge">${tierLbl.toUpperCase()}</div>
                            <h1>${fr ? 'Recap Hebdomadaire' : 'Weekly Recap'}</h1>
                            <div class="week">${selected.weekLabel}</div>
                          </div>
                          <div class="kpi-row">
                            <div class="kpi"><div class="kpi-val" style="color:#3B82F6">${selected.impressions}</div><div class="kpi-lbl">Impressions</div>${prevRow ? `<div class="kpi-chg" style="color:${impChg >= 0 ? '#10B981' : '#EF4444'}">${impChg >= 0 ? '+' : ''}${impChg}%</div>` : ''}</div>
                            <div class="kpi"><div class="kpi-val" style="color:#10B981">${selected.clicks}</div><div class="kpi-lbl">${fr ? 'Clics' : 'Clicks'}</div>${prevRow ? `<div class="kpi-chg" style="color:${clkChg >= 0 ? '#10B981' : '#EF4444'}">${clkChg >= 0 ? '+' : ''}${clkChg}%</div>` : ''}</div>
                            <div class="kpi"><div class="kpi-val" style="color:#F59E0B">${selected.ctr}%</div><div class="kpi-lbl">CTR</div></div>
                            <div class="kpi"><div class="kpi-val" style="color:#7C3AED">${selected.pushes}</div><div class="kpi-lbl">Push</div></div>
                          </div>
                          ${prevRow ? `<div class="section"><div class="section-title">${fr ? 'vs Semaine precedente' : 'vs Previous Week'}</div><div class="wow-row"><div class="wow-cell"><div class="wow-lbl">${fr ? 'Cette semaine' : 'This week'}</div><div class="wow-val" style="color:#6366F1">${selected.impressions}</div></div><div class="wow-cell"><div class="wow-lbl">${fr ? 'Sem. precedente' : 'Previous'}</div><div class="wow-val">${prevRow.impressions}</div></div></div></div>` : ''}
                          <div class="footer">${sponsor.display_name} &middot; Ultimate Petanque &middot; ${new Date(selected.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                        </body></html>`;
                        if (Platform.OS === 'web') {
                          try {
                            const win = window.open('', '_blank');
                            if (win) { win.document.write(html); win.document.close(); setTimeout(() => win.print(), 500); }
                          } catch { showAlert(fr ? 'Erreur' : 'Error'); }
                        } else {
                          const Print = require('expo-print');
                          const SharingModule = require('expo-sharing');
                          const { uri } = await Print.printToFileAsync({ html, base64: false });
                          const canShare = await SharingModule.isAvailableAsync();
                          if (canShare) await SharingModule.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fr ? 'Digest PDF' : 'Digest PDF' });
                        }
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      } catch (e: any) { showAlert(fr ? 'Erreur' : 'Error', e.message); }
                      setExportingDigest(false);
                    }}
                    disabled={exportingDigest}
                  >
                    {exportingDigest ? <ActivityIndicator size="small" color="#6366F1" /> : (
                      <>
                        <MaterialIcons name="share" size={16} color="#6366F1" />
                        <Text style={s.shareBtnText}>{fr ? 'Partager ce digest (PDF)' : 'Share this digest (PDF)'}</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}

            {/* Digest History List */}
            <Animated.View entering={FadeInDown.duration(300).delay(200)} style={s.listCard}>
              <Text style={s.listTitle}>{fr ? 'Tous les digests' : 'All digests'}</Text>
              {digests.map((digest, idx) => {
                const isSelected = selectedIdx === idx;
                const impChange = idx + 1 < digests.length ? computeChange(digest.impressions, digests[idx + 1].impressions) : null;
                return (
                  <Pressable
                    key={digest.id}
                    style={({ pressed }) => [s.listItem, isSelected && s.listItemSelected, pressed && { opacity: 0.85 }]}
                    onPress={() => { Haptics.selectionAsync(); setSelectedIdx(idx); }}
                  >
                    <View style={[s.listItemDot, isSelected && { backgroundColor: '#6366F1' }]}>
                      <MaterialIcons name="email" size={14} color={isSelected ? '#FFF' : '#94A3B8'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.listItemWeek, isSelected && { color: '#6366F1', fontWeight: '700' }]}>{digest.weekLabel}</Text>
                      <View style={s.listItemStats}>
                        <Text style={s.listItemStat}>{digest.impressions} imp</Text>
                        <Text style={s.listItemStatDot}>·</Text>
                        <Text style={s.listItemStat}>{digest.clicks} {fr ? 'clics' : 'clicks'}</Text>
                        <Text style={s.listItemStatDot}>·</Text>
                        <Text style={[s.listItemStat, { color: '#F59E0B', fontWeight: '700' }]}>{digest.ctr}%</Text>
                      </View>
                    </View>
                    {impChange ? (
                      <View style={[s.listItemBadge, { backgroundColor: impChange.positive ? '#10B98112' : '#EF444412' }]}>
                        <MaterialIcons name={impChange.positive ? 'arrow-upward' : 'arrow-downward'} size={10} color={impChange.positive ? '#10B981' : '#EF4444'} />
                        <Text style={[s.listItemBadgeText, { color: impChange.positive ? '#10B981' : '#EF4444' }]}>{impChange.value}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </Animated.View>

            {/* Info */}
            <Animated.View entering={FadeInDown.duration(300).delay(300)} style={s.infoCard}>
              <MaterialIcons name="info-outline" size={16} color="#6366F1" />
              <Text style={s.infoText}>
                {fr
                  ? 'Les digests sont generes automatiquement chaque lundi et envoyes via notification push aux sponsors actifs.'
                  : 'Digests are generated automatically every Monday and sent via push notification to active sponsors.'}
              </Text>
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: theme.textMuted, textAlign: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  // Hero
  hero: { paddingTop: 24, paddingBottom: 28, paddingHorizontal: 24, overflow: 'hidden', position: 'relative' },
  heroDecoCircle1: { position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroContent: { alignItems: 'center', position: 'relative', zIndex: 1 },
  heroIconWrap: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 6 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, maxWidth: 640, alignSelf: 'center' as const, width: '100%' },
  // Empty
  emptyCard: { alignItems: 'center', backgroundColor: '#FFF', borderRadius: 20, padding: 40, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 10 },
  emptyCardTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  emptyCardDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 19, maxWidth: 280 },
  // Trend
  trendCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  trendHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  trendTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  trendChartBlock: {},
  trendChartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  trendDot: { width: 10, height: 10, borderRadius: 5 },
  trendLabel: { fontSize: 13, fontWeight: '600', color: '#334155' },
  // Detail
  detailCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#6366F120' },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  detailIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#6366F112', alignItems: 'center', justifyContent: 'center' },
  detailTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  detailDate: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  detailKpiRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  detailKpi: { flex: 1, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 4, borderWidth: 1, borderColor: '#E2E8F0', gap: 2 },
  detailKpiValue: { fontSize: 20, fontWeight: '900' },
  detailKpiLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' },
  detailKpiChange: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2 },
  detailKpiChangeText: { fontSize: 9, fontWeight: '800' },
  // WoW
  wowBlock: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  wowHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  wowTitle: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  wowRow: { flexDirection: 'row', alignItems: 'center' },
  wowCell: { flex: 1, alignItems: 'center' },
  wowCellLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginBottom: 4 },
  wowCellValue: { fontSize: 22, fontWeight: '900', color: '#334155' },
  wowDivider: { width: 1, height: 36, backgroundColor: '#E2E8F0', marginHorizontal: 12 },
  // List
  listCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  listTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 14 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  listItemSelected: { backgroundColor: '#6366F108', borderBottomColor: '#6366F115' },
  listItemDot: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  listItemWeek: { fontSize: 13, fontWeight: '600', color: '#334155' },
  listItemStats: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  listItemStat: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
  listItemStatDot: { fontSize: 11, color: '#CBD5E1' },
  listItemBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  listItemBadgeText: { fontSize: 10, fontWeight: '800' },
  // Info
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EEF2FF', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: '#C7D2FE' },
  infoText: { flex: 1, fontSize: 12, color: '#4338CA', lineHeight: 18 },
  shareBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: '#6366F10A', borderRadius: 12, paddingVertical: 12, borderWidth: 1.5, borderColor: '#6366F120' },
  shareBtnText: { fontSize: 13, fontWeight: '600' as const, color: '#6366F1' },
});
