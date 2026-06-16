
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, RefreshControl, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import * as Haptics from '@/services/haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, getSupabaseClient } from '@/template';
import AdminGuard from '@/components/feature/AdminGuard';

type PartnerTier = 'gold_sponsor' | 'sponsor' | 'partner';
type TimeRange = '7d' | '30d' | '90d' | 'all';

const TIER_CONFIG: Record<PartnerTier, { label: string; labelEn: string; color: string; icon: string }> = {
  gold_sponsor: { label: 'Or', labelEn: 'Gold', color: '#D4A017', icon: 'star' },
  sponsor: { label: 'Argent', labelEn: 'Silver', color: '#78909C', icon: 'workspace-premium' },
  partner: { label: 'Bronze', labelEn: 'Bronze', color: '#A1887F', icon: 'workspace-premium' },
};

interface PartnerStat {
  id: string;
  displayName: string;
  photo?: string;
  badgeType: PartnerTier;
  brandColor?: string;
  isActive: boolean;
  expiresAt?: string;
  impressions: number;
  profileViews: number;
  socialClicks: number;
  referrals: number;
  monthlyCost: number;
  totalInvested: number;
}

interface TierSummary {
  tier: PartnerTier;
  count: number;
  activeCount: number;
  totalImpressions: number;
  totalViews: number;
  totalClicks: number;
  avgImpressions: number;
}

export default function PartnerAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const fr = language === 'fr';
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [partners, setPartners] = useState<PartnerStat[]>([]);
  const [dailyData, setDailyData] = useState<{ date: string; impressions: number; views: number; clicks: number }[]>([]);
  const [partnerGoals, setPartnerGoals] = useState<Map<string, any[]>>(new Map());
  const [exportingInvoice, setExportingInvoice] = useState<string | null>(null);
  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);

  const loadData = useCallback(async () => {
    try {
      // Fetch partners
      const { data: partnerRows } = await supabase
        .from('ambassadors')
        .select('id, display_name, photo, badge_type, brand_color, is_active, expires_at, referral_count, monthly_cost, total_invested')
        .in('badge_type', ['gold_sponsor', 'sponsor', 'partner'])
        .order('sort_order', { ascending: true });

      if (!partnerRows) { setLoading(false); return; }

      // Compute date range
      const now = new Date();
      let sinceDate: string | null = null;
      if (timeRange === '7d') { const d = new Date(now); d.setDate(d.getDate() - 7); sinceDate = d.toISOString(); }
      else if (timeRange === '30d') { const d = new Date(now); d.setDate(d.getDate() - 30); sinceDate = d.toISOString(); }
      else if (timeRange === '90d') { const d = new Date(now); d.setDate(d.getDate() - 90); sinceDate = d.toISOString(); }

      const partnerIds = partnerRows.map((p: any) => p.id);

      // Fetch analytics events
      let query = supabase
        .from('ambassador_analytics')
        .select('ambassador_id, event_type, created_at')
        .in('ambassador_id', partnerIds);
      if (sinceDate) query = query.gte('created_at', sinceDate);
      const { data: events } = await query;

      // Aggregate per partner
      const statsMap = new Map<string, { impressions: number; profileViews: number; socialClicks: number }>();
      partnerIds.forEach((id: string) => statsMap.set(id, { impressions: 0, profileViews: 0, socialClicks: 0 }));

      (events || []).forEach((ev: any) => {
        const stat = statsMap.get(ev.ambassador_id);
        if (!stat) return;
        if (ev.event_type === 'banner_impression') stat.impressions++;
        else if (ev.event_type === 'profile_view') stat.profileViews++;
        else if (ev.event_type === 'social_click') stat.socialClicks++;
      });

      const result: PartnerStat[] = partnerRows.map((p: any) => {
        const s = statsMap.get(p.id) || { impressions: 0, profileViews: 0, socialClicks: 0 };
        return {
          id: p.id,
          displayName: p.display_name,
          photo: p.photo,
          badgeType: p.badge_type as PartnerTier,
          brandColor: p.brand_color,
          isActive: p.is_active,
          expiresAt: p.expires_at,
          impressions: s.impressions,
          profileViews: s.profileViews,
          socialClicks: s.socialClicks,
          referrals: p.referral_count || 0,
          monthlyCost: parseFloat(p.monthly_cost) || 0,
          totalInvested: parseFloat(p.total_invested) || 0,
        };
      });

      setPartners(result);

      // Load goals for all partners
      const { data: goalsData } = await supabase
        .from('partner_goals')
        .select('*')
        .in('ambassador_id', partnerIds);
      if (goalsData) {
        const gMap = new Map<string, any[]>();
        goalsData.forEach((g: any) => {
          const arr = gMap.get(g.ambassador_id) || [];
          arr.push(g);
          gMap.set(g.ambassador_id, arr);
        });
        setPartnerGoals(gMap);
      }

      // Compute daily data for mini chart
      const dayMap = new Map<string, { impressions: number; views: number; clicks: number }>();
      const daysCount = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : 30;
      for (let i = daysCount - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        dayMap.set(key, { impressions: 0, views: 0, clicks: 0 });
      }
      (events || []).forEach((ev: any) => {
        const key = ev.created_at?.slice(0, 10);
        const entry = dayMap.get(key);
        if (!entry) return;
        if (ev.event_type === 'banner_impression') entry.impressions++;
        else if (ev.event_type === 'profile_view') entry.views++;
        else if (ev.event_type === 'social_click') entry.clicks++;
      });
      setDailyData(Array.from(dayMap.entries()).map(([date, d]) => ({ date, ...d })));
    } catch { /* silent */ }
    setLoading(false);
  }, [supabase, timeRange]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Summaries
  const totals = useMemo(() => {
    return partners.reduce((acc, p) => ({
      impressions: acc.impressions + p.impressions,
      views: acc.views + p.profileViews,
      clicks: acc.clicks + p.socialClicks,
      referrals: acc.referrals + p.referrals,
    }), { impressions: 0, views: 0, clicks: 0, referrals: 0 });
  }, [partners]);

  const tierSummaries = useMemo((): TierSummary[] => {
    return (['gold_sponsor', 'sponsor', 'partner'] as PartnerTier[]).map(tier => {
      const tierPartners = partners.filter(p => p.badgeType === tier);
      const active = tierPartners.filter(p => p.isActive);
      const totalImp = tierPartners.reduce((s, p) => s + p.impressions, 0);
      const totalViews = tierPartners.reduce((s, p) => s + p.profileViews, 0);
      const totalClicks = tierPartners.reduce((s, p) => s + p.socialClicks, 0);
      return {
        tier,
        count: tierPartners.length,
        activeCount: active.length,
        totalImpressions: totalImp,
        totalViews: totalViews,
        totalClicks: totalClicks,
        avgImpressions: tierPartners.length > 0 ? Math.round(totalImp / tierPartners.length) : 0,
      };
    });
  }, [partners]);

  const topPartners = useMemo(() => {
    return [...partners].sort((a, b) => (b.impressions + b.profileViews * 3 + b.socialClicks * 5) - (a.impressions + a.profileViews * 3 + a.socialClicks * 5)).slice(0, 5);
  }, [partners]);

  // Expiring soon (within 30 days)
  const expiringSoon = useMemo(() => {
    const now = Date.now();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    return partners.filter(p => p.expiresAt && new Date(p.expiresAt).getTime() - now < thirtyDays && new Date(p.expiresAt).getTime() > now);
  }, [partners]);

  const expired = useMemo(() => {
    const now = Date.now();
    return partners.filter(p => p.expiresAt && new Date(p.expiresAt).getTime() <= now);
  }, [partners]);

  // Goals progress computation
  const goalsProgress = useMemo(() => {
    return partners.map(p => {
      const pGoals = partnerGoals.get(p.id) || [];
      return {
        partnerId: p.id,
        partnerName: p.displayName,
        goals: pGoals.map((g: any) => {
          let current = 0;
          if (g.goal_type === 'impressions') current = p.impressions;
          else if (g.goal_type === 'profile_views') current = p.profileViews;
          else if (g.goal_type === 'social_clicks') current = p.socialClicks;
          else if (g.goal_type === 'conversion_rate') current = p.impressions > 0 ? parseFloat(((p.profileViews / p.impressions) * 100).toFixed(1)) : 0;
          const target = parseFloat(g.target_value) || 1;
          const progress = Math.min(100, Math.round((current / target) * 100));
          return { ...g, current, target, progress };
        }),
      };
    }).filter(p => p.goals.length > 0);
  }, [partners, partnerGoals]);

  // Invoice export
  const handleExportInvoice = useCallback(async (partner: PartnerStat) => {
    setExportingInvoice(partner.id);
    try {
      const cfg = TIER_CONFIG[partner.badgeType] || TIER_CONFIG.partner;
      const tierLabel = fr ? cfg.label : cfg.labelEn;
      const rangeLabel = timeRange === '7d' ? '7 jours' : timeRange === '30d' ? '30 jours' : timeRange === '90d' ? '90 jours' : 'Total';
      const costPerImp = partner.impressions > 0 ? (partner.totalInvested / partner.impressions).toFixed(3) : '0';
      const costPerView = partner.profileViews > 0 ? (partner.totalInvested / partner.profileViews).toFixed(3) : '0';
      const estimatedValue = partner.impressions * 0.01 + partner.profileViews * 0.10 + partner.socialClicks * 0.50;
      const roi = partner.totalInvested > 0 ? ((estimatedValue - partner.totalInvested) / partner.totalInvested * 100).toFixed(1) : '0';
      const now = new Date();
      const invoiceNumber = `INV-${partner.id.slice(0, 8).toUpperCase()}-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
        body{margin:0;padding:24px;font-family:-apple-system,sans-serif;color:#0F172A;background:#FFF;}
        .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;border-bottom:3px solid ${cfg.color};padding-bottom:16px;}
        .logo{font-size:22px;font-weight:900;color:${cfg.color};}
        .invoice-info{text-align:right;}
        .invoice-num{font-size:13px;font-weight:700;color:#64748B;}
        .invoice-date{font-size:12px;color:#94A3B8;margin-top:4px;}
        .partner-box{background:#F8FAFC;border-radius:12px;padding:16px;margin-bottom:24px;border:1px solid #E2E8F0;}
        .partner-name{font-size:18px;font-weight:800;color:#0F172A;}
        .partner-tier{display:inline-block;background:${cfg.color};color:#FFF;font-size:10px;font-weight:800;padding:2px 10px;border-radius:8px;margin-top:4px;letter-spacing:0.5px;}
        .section-title{font-size:11px;font-weight:700;color:#64748B;letter-spacing:1px;text-transform:uppercase;margin:24px 0 12px;}
        table{width:100%;border-collapse:collapse;}
        th{text-align:left;font-size:11px;font-weight:700;color:#64748B;padding:8px 12px;border-bottom:2px solid #E2E8F0;}
        td{font-size:13px;padding:10px 12px;border-bottom:1px solid #F1F5F9;}
        .val{font-weight:700;color:#0F172A;text-align:right;}
        .highlight{background:#F0FDF4;}
        .total-row td{font-weight:800;font-size:14px;border-top:2px solid #E2E8F0;}
        .roi-box{background:${parseFloat(roi) >= 0 ? '#F0FDF4' : '#FEF2F2'};border-radius:12px;padding:16px;text-align:center;margin:24px 0;border:1px solid ${parseFloat(roi) >= 0 ? '#BBF7D0' : '#FECACA'};}
        .roi-val{font-size:28px;font-weight:900;color:${parseFloat(roi) >= 0 ? '#10B981' : '#EF4444'};}
        .roi-label{font-size:11px;color:#64748B;margin-top:4px;}
        .footer{margin-top:32px;padding-top:16px;border-top:1px solid #E2E8F0;text-align:center;font-size:10px;color:#94A3B8;}
      </style></head><body>
        <div class="header">
          <div><div class="logo">Ultimate Petanque</div><div style="font-size:12px;color:#64748B;margin-top:4px;">Partner Performance Report</div></div>
          <div class="invoice-info"><div class="invoice-num">${invoiceNumber}</div><div class="invoice-date">${now.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</div><div class="invoice-date">${fr ? 'Periode' : 'Period'}: ${rangeLabel}</div></div>
        </div>
        <div class="partner-box">
          <div class="partner-name">${partner.displayName}</div>
          <div class="partner-tier">${tierLabel.toUpperCase()}</div>
          ${partner.expiresAt ? `<div style="font-size:11px;color:#64748B;margin-top:6px;">${fr ? 'Expire le' : 'Expires'}: ${new Date(partner.expiresAt).toLocaleDateString()}</div>` : ''}
        </div>
        <div class="section-title">${fr ? 'Metriques de performance' : 'Performance Metrics'}</div>
        <table><tr><th>${fr ? 'Metrique' : 'Metric'}</th><th style="text-align:right">${fr ? 'Valeur' : 'Value'}</th></tr>
          <tr><td>Impressions</td><td class="val">${partner.impressions.toLocaleString()}</td></tr>
          <tr><td>${fr ? 'Vues profil' : 'Profile Views'}</td><td class="val">${partner.profileViews.toLocaleString()}</td></tr>
          <tr><td>${fr ? 'Clics sociaux' : 'Social Clicks'}</td><td class="val">${partner.socialClicks.toLocaleString()}</td></tr>
          <tr><td>${fr ? 'Taux conversion' : 'Conversion Rate'}</td><td class="val">${partner.impressions > 0 ? ((partner.profileViews / partner.impressions) * 100).toFixed(1) : '0'}%</td></tr>
          <tr><td>${fr ? 'Parrainages' : 'Referrals'}</td><td class="val">${partner.referrals}</td></tr>
        </table>
        <div class="section-title">${fr ? 'Analyse financiere' : 'Financial Analysis'}</div>
        <table><tr><th>${fr ? 'Element' : 'Item'}</th><th style="text-align:right">${fr ? 'Montant' : 'Amount'}</th></tr>
          <tr><td>${fr ? 'Cout mensuel' : 'Monthly Cost'}</td><td class="val">${partner.monthlyCost.toFixed(2)} \u20AC</td></tr>
          <tr><td>${fr ? 'Total investi' : 'Total Invested'}</td><td class="val">${partner.totalInvested.toFixed(2)} \u20AC</td></tr>
          <tr><td>${fr ? 'Cout par impression' : 'Cost per Impression'}</td><td class="val">${costPerImp} \u20AC</td></tr>
          <tr><td>${fr ? 'Cout par vue profil' : 'Cost per Profile View'}</td><td class="val">${costPerView} \u20AC</td></tr>
          <tr class="highlight total-row"><td>${fr ? 'Valeur estimee generee' : 'Estimated Value Generated'}</td><td class="val">${estimatedValue.toFixed(2)} \u20AC</td></tr>
        </table>
        <div class="roi-box"><div class="roi-val">${parseFloat(roi) >= 0 ? '+' : ''}${roi}%</div><div class="roi-label">ROI</div></div>
        <div class="footer"><p><strong>Ultimate Petanque</strong> &middot; ${fr ? 'Rapport automatique' : 'Automated Report'}</p><p>${fr ? 'Genere le' : 'Generated on'} ${now.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p></div>
      </body></html>`;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${invoiceNumber}.pdf` });
      }
    } catch (e: any) {
      console.error('[Invoice] Export error:', e);
    }
    setExportingInvoice(null);
  }, [fr, timeRange]);

  // Mini bar chart
  const chartMaxVal = useMemo(() => Math.max(...dailyData.map(d => d.impressions + d.views + d.clicks), 1), [dailyData]);
  const chartBarWidth = useMemo(() => {
    const available = screenWidth - 72;
    return Math.max(2, Math.floor(available / Math.max(dailyData.length, 1)) - 1);
  }, [screenWidth, dailyData.length]);

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={() => router.back()}><MaterialIcons name="arrow-back" size={22} color={theme.textPrimary} /></Pressable>
          <Text style={st.headerTitle}>{fr ? 'Analytics Partenaires' : 'Partner Analytics'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <AdminGuard language={language} requiredPermission="sponsors">
    <SafeAreaView edges={['top']} style={st.container}>
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>{fr ? 'Analytics Partenaires' : 'Partner Analytics'}</Text>
        <Pressable style={st.manageBtn} onPress={() => router.push('/admin-partners' as any)}>
          <MaterialIcons name="settings" size={18} color={theme.primary} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, paddingTop: 16 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Time Range Selector */}
        <View style={st.timeRow}>
          {(['7d', '30d', '90d', 'all'] as TimeRange[]).map(r => {
            const isActive = timeRange === r;
            const label = r === '7d' ? '7J' : r === '30d' ? '30J' : r === '90d' ? '90J' : (fr ? 'Tout' : 'All');
            return (
              <Pressable
                key={r}
                style={[st.timeChip, isActive && st.timeChipActive]}
                onPress={() => { Haptics.selectionAsync(); setTimeRange(r); }}
              >
                <Text style={[st.timeChipText, isActive && st.timeChipTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Summary Cards */}
        <Animated.View entering={FadeInDown.duration(300)} style={st.summaryGrid}>
          <View style={[st.summaryCard, { borderLeftColor: theme.primary }]}>
            <MaterialIcons name="visibility" size={20} color={theme.primary} />
            <Text style={st.summaryValue}>{totals.impressions.toLocaleString()}</Text>
            <Text style={st.summaryLabel}>{fr ? 'Impressions' : 'Impressions'}</Text>
          </View>
          <View style={[st.summaryCard, { borderLeftColor: '#7C3AED' }]}>
            <MaterialIcons name="person" size={20} color="#7C3AED" />
            <Text style={st.summaryValue}>{totals.views.toLocaleString()}</Text>
            <Text style={st.summaryLabel}>{fr ? 'Vues profil' : 'Profile Views'}</Text>
          </View>
          <View style={[st.summaryCard, { borderLeftColor: theme.success }]}>
            <MaterialIcons name="touch-app" size={20} color={theme.success} />
            <Text style={st.summaryValue}>{totals.clicks.toLocaleString()}</Text>
            <Text style={st.summaryLabel}>{fr ? 'Clics sociaux' : 'Social Clicks'}</Text>
          </View>
          <View style={[st.summaryCard, { borderLeftColor: '#F59E0B' }]}>
            <MaterialIcons name="people" size={20} color="#F59E0B" />
            <Text style={st.summaryValue}>{partners.length}</Text>
            <Text style={st.summaryLabel}>{fr ? 'Partenaires' : 'Partners'}</Text>
          </View>
        </Animated.View>

        {/* Activity Chart */}
        {dailyData.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(100)} style={st.chartCard}>
            <View style={st.chartHeader}>
              <MaterialIcons name="insights" size={18} color="#6366F1" />
              <Text style={st.chartTitle}>{fr ? 'Activite quotidienne' : 'Daily Activity'}</Text>
            </View>
            <View style={st.chartLegend}>
              <View style={st.legendItem}><View style={[st.legendDot, { backgroundColor: theme.primary }]} /><Text style={st.legendText}>Imp.</Text></View>
              <View style={st.legendItem}><View style={[st.legendDot, { backgroundColor: '#7C3AED' }]} /><Text style={st.legendText}>{fr ? 'Vues' : 'Views'}</Text></View>
              <View style={st.legendItem}><View style={[st.legendDot, { backgroundColor: theme.success }]} /><Text style={st.legendText}>{fr ? 'Clics' : 'Clicks'}</Text></View>
            </View>
            <View style={st.chartBars}>
              {dailyData.map((d, i) => {
                const total = d.impressions + d.views + d.clicks;
                const h = Math.max(2, (total / chartMaxVal) * 80);
                const impH = total > 0 ? (d.impressions / total) * h : 0;
                const viewsH = total > 0 ? (d.views / total) * h : 0;
                const clicksH = total > 0 ? (d.clicks / total) * h : 0;
                return (
                  <View key={i} style={{ width: chartBarWidth, height: 80, justifyContent: 'flex-end', alignItems: 'center' }}>
                    <View style={{ width: chartBarWidth, borderRadius: 2, overflow: 'hidden' }}>
                      {clicksH > 0 ? <View style={{ height: clicksH, backgroundColor: theme.success }} /> : null}
                      {viewsH > 0 ? <View style={{ height: viewsH, backgroundColor: '#7C3AED' }} /> : null}
                      {impH > 0 ? <View style={{ height: impH, backgroundColor: theme.primary }} /> : null}
                      {total === 0 ? <View style={{ height: 2, backgroundColor: theme.border }} /> : null}
                    </View>
                  </View>
                );
              })}
            </View>
            <View style={st.chartXAxis}>
              <Text style={st.chartXLabel}>{dailyData[0]?.date.slice(5) || ''}</Text>
              <Text style={st.chartXLabel}>{dailyData[Math.floor(dailyData.length / 2)]?.date.slice(5) || ''}</Text>
              <Text style={st.chartXLabel}>{dailyData[dailyData.length - 1]?.date.slice(5) || ''}</Text>
            </View>
          </Animated.View>
        ) : null}

        {/* Expiration Alerts */}
        {expiringSoon.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(150)} style={st.alertCard}>
            <View style={st.alertHeader}>
              <MaterialIcons name="schedule" size={18} color="#F59E0B" />
              <Text style={st.alertTitle}>{fr ? 'Expirations prochaines' : 'Expiring Soon'} ({expiringSoon.length})</Text>
            </View>
            {expiringSoon.map(p => {
              const daysLeft = Math.ceil((new Date(p.expiresAt!).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
              const cfg = TIER_CONFIG[p.badgeType] || TIER_CONFIG.partner;
              return (
                <View key={p.id} style={st.alertItem}>
                  <View style={[st.alertDot, { backgroundColor: daysLeft < 7 ? theme.error : '#F59E0B' }]} />
                  <Text style={st.alertName} numberOfLines={1}>{p.displayName}</Text>
                  <View style={[st.alertTierBadge, { backgroundColor: cfg.color + '15' }]}>
                    <MaterialIcons name={cfg.icon as any} size={9} color={cfg.color} />
                  </View>
                  <Text style={[st.alertDays, { color: daysLeft < 7 ? theme.error : '#F59E0B' }]}>
                    {daysLeft}j
                  </Text>
                </View>
              );
            })}
          </Animated.View>
        ) : null}

        {expired.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(150)} style={[st.alertCard, { borderColor: theme.error + '30' }]}>
            <View style={st.alertHeader}>
              <MaterialIcons name="error" size={18} color={theme.error} />
              <Text style={[st.alertTitle, { color: theme.error }]}>{fr ? 'Expires' : 'Expired'} ({expired.length})</Text>
            </View>
            {expired.map(p => {
              const cfg = TIER_CONFIG[p.badgeType] || TIER_CONFIG.partner;
              return (
                <View key={p.id} style={st.alertItem}>
                  <View style={[st.alertDot, { backgroundColor: theme.error }]} />
                  <Text style={[st.alertName, { color: theme.textMuted }]} numberOfLines={1}>{p.displayName}</Text>
                  <View style={[st.alertTierBadge, { backgroundColor: cfg.color + '15' }]}>
                    <MaterialIcons name={cfg.icon as any} size={9} color={cfg.color} />
                  </View>
                  <Text style={[st.alertDays, { color: theme.error }]}>
                    {fr ? 'Expire' : 'Expired'}
                  </Text>
                </View>
              );
            })}
          </Animated.View>
        ) : null}

        {/* Tier Breakdown */}
        <Animated.View entering={FadeInDown.duration(300).delay(200)} style={st.sectionCard}>
          <Text style={st.sectionTitle}>{fr ? 'REPARTITION PAR NIVEAU' : 'BREAKDOWN BY TIER'}</Text>
          {tierSummaries.map(ts => {
            const cfg = TIER_CONFIG[ts.tier];
            return (
              <View key={ts.tier} style={st.tierRow}>
                <View style={[st.tierIcon, { backgroundColor: cfg.color + '15' }]}>
                  <MaterialIcons name={cfg.icon as any} size={18} color={cfg.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={[st.tierLabel, { color: cfg.color }]}>{fr ? cfg.label : cfg.labelEn}</Text>
                    <Text style={st.tierCount}>{ts.activeCount}/{ts.count} {fr ? 'actifs' : 'active'}</Text>
                  </View>
                  <View style={st.tierStats}>
                    <View style={st.tierStatItem}>
                      <Text style={st.tierStatVal}>{ts.totalImpressions}</Text>
                      <Text style={st.tierStatLabel}>Imp.</Text>
                    </View>
                    <View style={st.tierStatDivider} />
                    <View style={st.tierStatItem}>
                      <Text style={st.tierStatVal}>{ts.totalViews}</Text>
                      <Text style={st.tierStatLabel}>{fr ? 'Vues' : 'Views'}</Text>
                    </View>
                    <View style={st.tierStatDivider} />
                    <View style={st.tierStatItem}>
                      <Text style={st.tierStatVal}>{ts.totalClicks}</Text>
                      <Text style={st.tierStatLabel}>{fr ? 'Clics' : 'Clicks'}</Text>
                    </View>
                    <View style={st.tierStatDivider} />
                    <View style={st.tierStatItem}>
                      <Text style={[st.tierStatVal, { color: cfg.color }]}>{ts.avgImpressions}</Text>
                      <Text style={st.tierStatLabel}>{fr ? 'Moy/part.' : 'Avg/part.'}</Text>
                    </View>
                  </View>
                </View>
              </View>
            );
          })}
        </Animated.View>

        {/* Top Partners */}
        <Animated.View entering={FadeInDown.duration(300).delay(300)} style={st.sectionCard}>
          <Text style={st.sectionTitle}>{fr ? 'TOP PARTENAIRES' : 'TOP PARTNERS'}</Text>
          {topPartners.map((p, idx) => {
            const cfg = TIER_CONFIG[p.badgeType] || TIER_CONFIG.partner;
            const score = p.impressions + p.profileViews * 3 + p.socialClicks * 5;
            const conversionRate = p.impressions > 0 ? ((p.profileViews / p.impressions) * 100).toFixed(1) : '0.0';
            const isExpired = p.expiresAt && new Date(p.expiresAt).getTime() <= Date.now();
            const isExpiringSoon = p.expiresAt && !isExpired && (new Date(p.expiresAt).getTime() - Date.now()) < 30 * 24 * 60 * 60 * 1000;
            return (
              <Pressable
                key={p.id}
                style={[st.partnerRow, !p.isActive && { opacity: 0.5 }]}
                onPress={() => router.push(`/partner/${p.id}` as any)}
              >
                <View style={st.partnerRank}>
                  <Text style={[st.partnerRankText, idx === 0 && { color: '#D4A017' }, idx === 1 && { color: '#78909C' }, idx === 2 && { color: '#A1887F' }]}>
                    #{idx + 1}
                  </Text>
                </View>
                <View style={[st.partnerAvatar, { backgroundColor: cfg.color + '15' }]}>
                  {p.photo ? (
                    <Image source={{ uri: p.photo }} style={{ width: 40, height: 40, borderRadius: 12 }} contentFit="cover" transition={200} />
                  ) : (
                    <MaterialIcons name={cfg.icon as any} size={20} color={cfg.color} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={st.partnerName} numberOfLines={1}>{p.displayName}</Text>
                    <View style={[st.partnerTierDot, { backgroundColor: cfg.color }]} />
                    {isExpired ? (
                      <View style={[st.expiryBadge, { backgroundColor: theme.error + '12' }]}>
                        <MaterialIcons name="error" size={9} color={theme.error} />
                        <Text style={[st.expiryBadgeText, { color: theme.error }]}>{fr ? 'Expire' : 'Expired'}</Text>
                      </View>
                    ) : isExpiringSoon ? (
                      <View style={[st.expiryBadge, { backgroundColor: '#F59E0B12' }]}>
                        <MaterialIcons name="schedule" size={9} color="#F59E0B" />
                      </View>
                    ) : null}
                  </View>
                  <View style={st.partnerMetrics}>
                    <Text style={st.partnerMetricItem}>{p.impressions} imp.</Text>
                    <Text style={st.partnerMetricDot}>{"•"}</Text>
                    <Text style={st.partnerMetricItem}>{p.profileViews} {fr ? 'vues' : 'views'}</Text>
                    <Text style={st.partnerMetricDot}>{"•"}</Text>
                    <Text style={st.partnerMetricItem}>{conversionRate}% conv.</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={st.partnerScore}>
                    <Text style={st.partnerScoreVal}>{score}</Text>
                    <Text style={st.partnerScoreLabel}>pts</Text>
                  </View>
                  <Pressable
                    style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#6366F112', alignItems: 'center', justifyContent: 'center' }}
                    onPress={() => { Haptics.selectionAsync(); handleExportInvoice(p); }}
                    disabled={exportingInvoice === p.id}
                  >
                    {exportingInvoice === p.id ? (
                      <ActivityIndicator size="small" color="#6366F1" />
                    ) : (
                      <MaterialIcons name="receipt-long" size={16} color="#6366F1" />
                    )}
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
        </Animated.View>

        {/* Goals Progress */}
        {goalsProgress.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(350)} style={st.sectionCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="flag" size={18} color="#F59E0B" />
              </View>
              <Text style={st.sectionTitle}>{fr ? 'OBJECTIFS DE PERFORMANCE' : 'PERFORMANCE GOALS'}</Text>
            </View>
            {goalsProgress.map(pg => (
              <View key={pg.partnerId} style={{ marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 }}>{pg.partnerName}</Text>
                {pg.goals.map((g: any) => {
                  const goalCfg = [
                    { id: 'impressions', label: 'Impressions', color: theme.primary },
                    { id: 'profile_views', label: fr ? 'Vues profil' : 'Profile Views', color: '#7C3AED' },
                    { id: 'social_clicks', label: fr ? 'Clics sociaux' : 'Social Clicks', color: theme.success },
                    { id: 'conversion_rate', label: fr ? 'Taux conv.' : 'Conv. Rate', color: '#F59E0B' },
                  ].find(x => x.id === g.goal_type);
                  const barColor = g.progress >= 100 ? '#10B981' : g.progress >= 60 ? '#F59E0B' : theme.primary;
                  const isRate = g.goal_type === 'conversion_rate';
                  return (
                    <View key={g.id} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: goalCfg?.color || theme.primary }} />
                          <Text style={{ fontSize: 12, color: theme.textSecondary, fontWeight: '600' }}>{goalCfg?.label || g.goal_type}</Text>
                          <View style={{ backgroundColor: theme.backgroundSecondary, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: theme.textMuted }}>{g.period === 'monthly' ? (fr ? 'Mensuel' : 'Monthly') : g.period === 'quarterly' ? (fr ? 'Trim.' : 'Qtr.') : (fr ? 'Annuel' : 'Yearly')}</Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: barColor }}>
                          {isRate ? `${g.current}%` : g.current} / {isRate ? `${g.target}%` : g.target}
                        </Text>
                      </View>
                      <View style={{ height: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 4, overflow: 'hidden' }}>
                        <View style={{ height: '100%', width: `${Math.min(100, g.progress)}%`, backgroundColor: barColor, borderRadius: 4 }} />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 2 }}>
                        {g.progress >= 100 ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <MaterialIcons name="check-circle" size={11} color="#10B981" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981' }}>{fr ? 'Atteint' : 'Achieved'}</Text>
                          </View>
                        ) : (
                          <Text style={{ fontSize: 10, fontWeight: '700', color: barColor }}>{g.progress}%</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            ))}
          </Animated.View>
        ) : null}

        {/* ROI Calculator */}
        {(() => {
          const totalInvested = partners.reduce((s, p) => s + p.totalInvested, 0);
          const totalMonthlyCost = partners.filter(p => p.isActive).reduce((s, p) => s + p.monthlyCost, 0);
          const hasFinancialData = totalInvested > 0 || totalMonthlyCost > 0;
          if (!hasFinancialData) return null;

          const costPerImpression = totals.impressions > 0 ? (totalInvested / totals.impressions) : 0;
          const costPerView = totals.views > 0 ? (totalInvested / totals.views) : 0;
          const costPerClick = totals.clicks > 0 ? (totalInvested / totals.clicks) : 0;
          // Estimated value: impressions * 0.01 + views * 0.10 + clicks * 0.50
          const estimatedValue = totals.impressions * 0.01 + totals.views * 0.10 + totals.clicks * 0.50;
          const roi = totalInvested > 0 ? ((estimatedValue - totalInvested) / totalInvested * 100) : 0;

          // Per-partner ROI
          const partnerROIs = partners
            .filter(p => p.totalInvested > 0)
            .map(p => {
              const pValue = p.impressions * 0.01 + p.profileViews * 0.10 + p.socialClicks * 0.50;
              const pRoi = p.totalInvested > 0 ? ((pValue - p.totalInvested) / p.totalInvested * 100) : 0;
              const pCpi = p.impressions > 0 ? (p.totalInvested / p.impressions) : 0;
              return { ...p, estimatedValue: pValue, roi: pRoi, costPerImpression: pCpi };
            })
            .sort((a, b) => b.roi - a.roi);

          return (
            <Animated.View entering={FadeInDown.duration(300).delay(350)} style={st.sectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#10B98115', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="calculate" size={18} color="#10B981" />
                </View>
                <Text style={st.sectionTitle}>{fr ? 'CALCULATEUR ROI' : 'ROI CALCULATOR'}</Text>
              </View>

              {/* Global metrics */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: theme.textPrimary }}>{totalInvested.toFixed(0)}{"\u20AC"}</Text>
                  <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 2 }}>{fr ? 'Total investi' : 'Total invested'}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: theme.primary }}>{totalMonthlyCost.toFixed(0)}{"\u20AC"}</Text>
                  <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 2 }}>{fr ? 'Cout mensuel' : 'Monthly cost'}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: roi >= 0 ? '#10B98108' : '#EF444408', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: roi >= 0 ? '#10B98125' : '#EF444425' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: roi >= 0 ? '#10B981' : '#EF4444' }}>{roi >= 0 ? '+' : ''}{roi.toFixed(0)}%</Text>
                  <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 2 }}>ROI</Text>
                </View>
              </View>

              {/* Cost metrics */}
              <View style={{ gap: 8, marginBottom: 14 }}>
                {[
                  { label: fr ? 'Cout par impression' : 'Cost per impression', value: costPerImpression, color: theme.primary },
                  { label: fr ? 'Cout par vue profil' : 'Cost per profile view', value: costPerView, color: '#7C3AED' },
                  { label: fr ? 'Cout par clic social' : 'Cost per social click', value: costPerClick, color: theme.success },
                ].map((m, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: '#F1F5F9' }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: m.color }} />
                    <Text style={{ flex: 1, fontSize: 13, color: theme.textSecondary }}>{m.label}</Text>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: m.color }}>{m.value.toFixed(2)}{"\u20AC"}</Text>
                  </View>
                ))}
              </View>

              {/* Estimated value */}
              <View style={{ backgroundColor: '#10B98108', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#10B98120', marginBottom: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View>
                    <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>{fr ? 'Valeur estimee generee' : 'Estimated value generated'}</Text>
                    <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 2 }}>{fr ? 'Imp. x 0.01 + Vues x 0.10 + Clics x 0.50' : 'Imp. x 0.01 + Views x 0.10 + Clicks x 0.50'}</Text>
                  </View>
                  <Text style={{ fontSize: 20, fontWeight: '900', color: '#10B981' }}>{estimatedValue.toFixed(0)}{"\u20AC"}</Text>
                </View>
              </View>

              {/* Per-partner ROI table */}
              {partnerROIs.length > 0 ? (
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.3, marginBottom: 8 }}>{fr ? 'ROI PAR PARTENAIRE' : 'ROI PER PARTNER'}</Text>
                  {partnerROIs.map((p, idx) => {
                    const cfg = TIER_CONFIG[p.badgeType] || TIER_CONFIG.partner;
                    return (
                      <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: idx < partnerROIs.length - 1 ? 1 : 0, borderBottomColor: '#F1F5F9' }}>
                        <View style={[{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: cfg.color + '15' }]}>
                          <MaterialIcons name={cfg.icon as any} size={14} color={cfg.color} />
                        </View>
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: theme.textPrimary }} numberOfLines={1}>{p.displayName}</Text>
                        <Text style={{ fontSize: 11, color: theme.textMuted }}>{p.totalInvested.toFixed(0)}{"\u20AC"}</Text>
                        <View style={{ width: 1, height: 16, backgroundColor: '#E2E8F0' }} />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: p.roi >= 0 ? '#10B981' : '#EF4444', minWidth: 50, textAlign: 'right' }}>
                          {p.roi >= 0 ? '+' : ''}{p.roi.toFixed(0)}%
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </Animated.View>
          );
        })()}

        {/* Conversion Funnel */}
        <Animated.View entering={FadeInDown.duration(300).delay(400)} style={st.sectionCard}>
          <Text style={st.sectionTitle}>{fr ? 'ENTONNOIR DE CONVERSION' : 'CONVERSION FUNNEL'}</Text>
          <View style={st.funnelContainer}>
            {[
              { label: fr ? 'Impressions banniere' : 'Banner Impressions', value: totals.impressions, color: theme.primary, width: 100 },
              { label: fr ? 'Vues de profil' : 'Profile Views', value: totals.views, color: '#7C3AED', width: totals.impressions > 0 ? Math.max(20, (totals.views / totals.impressions) * 100) : 20 },
              { label: fr ? 'Clics sociaux' : 'Social Clicks', value: totals.clicks, color: theme.success, width: totals.impressions > 0 ? Math.max(10, (totals.clicks / totals.impressions) * 100) : 10 },
            ].map((step, i) => (
              <View key={i} style={st.funnelStep}>
                <View style={[st.funnelBar, { backgroundColor: step.color + '20', width: `${step.width}%` }]}>
                  <View style={[st.funnelBarFill, { backgroundColor: step.color, width: `${step.width}%` }]} />
                </View>
                <View style={st.funnelInfo}>
                  <Text style={st.funnelLabel}>{step.label}</Text>
                  <Text style={[st.funnelValue, { color: step.color }]}>{step.value.toLocaleString()}</Text>
                  {i > 0 && totals.impressions > 0 ? (
                    <Text style={st.funnelRate}>{((step.value / totals.impressions) * 100).toFixed(1)}%</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
    </AdminGuard>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  manageBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center' },

  timeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  timeChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  timeChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  timeChipText: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  timeChipTextActive: { color: '#FFF' },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  summaryCard: { width: '48%' as any, backgroundColor: theme.surface, borderRadius: 16, padding: 16, borderLeftWidth: 3, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  summaryValue: { fontSize: 22, fontWeight: '800', color: theme.textPrimary, marginTop: 8 },
  summaryLabel: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },

  chartCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 16, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  chartTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  chartLegend: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: theme.textSecondary, fontWeight: '600' },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 80, gap: 1 },
  chartXAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  chartXLabel: { fontSize: 9, color: theme.textMuted },

  alertCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1.5, borderColor: '#F59E0B30', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  alertTitle: { fontSize: 14, fontWeight: '700', color: '#F59E0B' },
  alertItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  alertDot: { width: 6, height: 6, borderRadius: 3 },
  alertName: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  alertTierBadge: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  alertDays: { fontSize: 12, fontWeight: '800' },

  sectionCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 16, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, marginBottom: 14 },

  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  tierIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tierLabel: { fontSize: 14, fontWeight: '700' },
  tierCount: { fontSize: 11, color: theme.textMuted },
  tierStats: { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
  tierStatItem: { flex: 1, alignItems: 'center' },
  tierStatVal: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  tierStatLabel: { fontSize: 9, color: theme.textMuted, marginTop: 1 },
  tierStatDivider: { width: 1, height: 24, backgroundColor: theme.border },

  partnerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  partnerRank: { width: 28, alignItems: 'center' },
  partnerRankText: { fontSize: 14, fontWeight: '900', color: theme.textMuted },
  partnerAvatar: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  partnerName: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, flex: 1 },
  partnerTierDot: { width: 8, height: 8, borderRadius: 4 },
  partnerMetrics: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  partnerMetricItem: { fontSize: 11, color: theme.textSecondary },
  partnerMetricDot: { fontSize: 11, color: theme.textMuted },
  partnerScore: { alignItems: 'center' },
  partnerScoreVal: { fontSize: 16, fontWeight: '800', color: theme.primary },
  partnerScoreLabel: { fontSize: 9, color: theme.textMuted },

  expiryBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  expiryBadgeText: { fontSize: 9, fontWeight: '700' },

  funnelContainer: { gap: 12 },
  funnelStep: { gap: 6 },
  funnelBar: { height: 24, borderRadius: 12, overflow: 'hidden' },
  funnelBarFill: { height: '100%', borderRadius: 12 },
  funnelInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  funnelLabel: { flex: 1, fontSize: 12, color: theme.textSecondary },
  funnelValue: { fontSize: 14, fontWeight: '800' },
  funnelRate: { fontSize: 11, color: theme.textMuted, fontWeight: '600' },
});
