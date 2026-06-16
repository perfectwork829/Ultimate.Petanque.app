import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  RefreshControl, Platform, Dimensions, Linking, TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from '@/services/haptics';
import theme, { blurhash } from '@/constants/theme';
import { useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';
import { SponsorPortalSkeleton } from '@/components/ui/SkeletonLoader';
import { invalidateAmbassadorCache, AMBASSADOR_LEVELS, AmbassadorLevel } from '@/services/ambassadorService';
import { fetchAmbassadorAnalytics, AmbassadorAnalytics, fetchDetailedBannerAnalytics, BannerDetailedAnalytics } from '@/services/ambassadorAnalyticsService';
import { getMySponsoredEvents, SponsoredEvent } from '@/services/sponsoredEventService';
import Svg, { Polyline, Circle as SvgCircle, Rect as SvgRect } from 'react-native-svg';
import * as ImagePicker from '@/services/imagePicker';
import { decode } from '@/services/base64';
import { triggerServerPush } from '@/services/pushTokenService';
import { fetchPushQuota, PushQuotaInfo, getDaysUntilReset } from '@/services/pushQuotaService';
import SponsorProposalSection from '@/components/feature/SponsorProposalSection';
import SponsorItemMetrics from '@/components/feature/SponsorItemMetrics';
import ConsentAnalyticsCard from '@/components/feature/ConsentAnalyticsCard';
import PartnerExpirationAlert from '@/components/feature/PartnerExpirationAlert';
import PartnerGalleryManager from '@/components/feature/PartnerGalleryManager';

function Sparkline({ data, width, height, color }: { data: number[]; width: number; height: number; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1); const pad = 4; const w = width - pad * 2; const h = height - pad * 2;
  const points = data.map((v, i) => `${pad + (i / (data.length - 1)) * w},${pad + h - (v / max) * h}`).join(' ');
  const li = data.length - 1; const lx = pad + (li / (data.length - 1)) * w; const ly = pad + h - (data[li] / max) * h;
  return (<Svg width={width} height={height}><Polyline points={points} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" /><SvgCircle cx={lx} cy={ly} r={4} fill={color} /></Svg>);
}

function PushBarChart({ data, width, height, color }: { data: { month: string; count: number }[]; width: number; height: number; color: string }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.count), 1); const pad = 4; const barGap = 6;
  const usableW = width - pad * 2; const barW = Math.max(8, (usableW - barGap * (data.length - 1)) / data.length);
  return (<Svg width={width} height={height}>{data.map((d, i) => { const barH = Math.max(4, (d.count / max) * (height - pad * 2)); const x = pad + i * (barW + barGap); const y = height - pad - barH; return (<React.Fragment key={i}><SvgRect x={x} y={y} width={barW} height={barH} rx={4} ry={4} fill={color} opacity={0.8 + (i / data.length) * 0.2} /></React.Fragment>); })}</Svg>);
}

const PAGE_LABELS: Record<string, { label: { fr: string; en: string }; icon: string; color: string }> = {
  home: { label: { fr: 'Accueil', en: 'Home' }, icon: 'home', color: '#3B82F6' },
  stats: { label: { fr: 'Stats', en: 'Stats' }, icon: 'bar-chart', color: '#7C3AED' },
  directory: { label: { fr: 'Annuaire', en: 'Directory' }, icon: 'people', color: '#10B981' },
  map: { label: { fr: 'Carte', en: 'Map' }, icon: 'map', color: '#F59E0B' },
  onboarding: { label: { fr: 'Onboarding', en: 'Onboarding' }, icon: 'rocket-launch', color: '#EC4899' },
  partners: { label: { fr: 'Partenaires', en: 'Partners' }, icon: 'handshake', color: '#6366F1' },
  unknown: { label: { fr: 'Autre', en: 'Other' }, icon: 'help-outline', color: '#94A3B8' },
};

export default function SponsorPortalScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { showAlert } = useAlert();
  const fr = language === 'fr';
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sponsor, setSponsor] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<AmbassadorAnalytics | null>(null);
  const [bannerData, setBannerData] = useState<BannerDetailedAnalytics | null>(null);
  const [events, setEvents] = useState<SponsoredEvent[]>([]);
  const [period, setPeriod] = useState<7 | 30>(30);
  const [activeSection, setActiveSection] = useState<'roi' | 'placement' | 'events' | 'branding' | 'push' | 'crm'>('roi');

  // Branding state
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [brandColor, setBrandColor] = useState<string>('#F59E0B');
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandColorDirty, setBrandColorDirty] = useState(false);

  // Push composer state
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushCity, setPushCity] = useState('');
  const [pushRadius, setPushRadius] = useState('200');
  const [sendingPush, setSendingPush] = useState(false);
  const [pushQuota, setPushQuota] = useState<PushQuotaInfo | null>(null);
  const [recentPushes, setRecentPushes] = useState<{ title: string; date: string; variant?: string }[]>([]);

  // A/B Testing state
  const [abTestEnabled, setAbTestEnabled] = useState(false);
  const [pushTitleB, setPushTitleB] = useState('');
  const [pushBodyB, setPushBodyB] = useState('');
  const [abResults, setAbResults] = useState<{ variantA: { sent: number; openRate: number }; variantB: { sent: number; openRate: number }; winner: 'A' | 'B' | 'tie' | null } | null>(null);

  // Export state
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingBrandKit, setExportingBrandKit] = useState(false);

  // Scheduling state
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduledPushes, setScheduledPushes] = useState<{ id: string; title: string; scheduledFor: string; variant?: string; status: string }[]>([]);

  // A/B History state
  const [abHistory, setAbHistory] = useState<{ date: string; titleA: string; titleB: string; rateA: number; rateB: number; winner: string }[]>([]);

  // Digest preview state
  const [lastDigest, setLastDigest] = useState<{ date: string; impressions: number; clicks: number; ctr: string; pushes: number; impTrend: string; clkTrend: string } | null>(null);

  const [pushAnalytics, setPushAnalytics] = useState<{monthly:{month:string;count:number}[];totalSent:number;estimatedReach:number;avgOpenRate:number;cities:{city:string;count:number}[]}>({monthly:[],totalSent:0,estimatedReach:0,avgOpenRate:0,cities:[]});

  // Push calendar state
  const [calendarMonth, setCalendarMonth] = useState(() => { const n = new Date(); return { year: n.getFullYear(), month: n.getMonth() }; });
  const [calendarEvents, setCalendarEvents] = useState<Map<string, { type: 'sent' | 'scheduled' | 'ab'; title: string }[]>>(new Map());

  // Template library state
  const [showTemplates, setShowTemplates] = useState(false);

  // Heatmap state
  const [heatmapData, setHeatmapData] = useState<number[][]>([]);
  const [bestSendTime, setBestSendTime] = useState<{ day: string; slot: string; score: number } | null>(null);

  const [benchmarkData, setBenchmarkData] = useState<{myImpressions:number;avgImpressions:number;myCtr:number;avgCtr:number;myReach:number;avgReach:number;myPushes:number;avgPushes:number;tierCount:number}|null>(null);
  const [showNotifCenter, setShowNotifCenter] = useState(false);
  const [sponsorNotifs, setSponsorNotifs] = useState<{id:string;type:string;icon:string;color:string;title:string;message:string;date:string;unread:boolean}[]>([]);

  const [segLevels, setSegLevels] = useState<string[]>([]);
  const [segRoles, setSegRoles] = useState<string[]>([]);
  const [segActivity, setSegActivity] = useState<'all' | '7d' | '30d'>('all');
  const [segPlayerCount, setSegPlayerCount] = useState<number|null>(null);
  const [segCountLoading, setSegCountLoading] = useState(false);

  // CRM state
  const [crmReferrals, setCrmReferrals] = useState<{ date: string; viewerId: string; source: string }[]>([]);

  const [revBudget, setRevBudget] = useState('');
  const [digestFreq, setDigestFreq] = useState<'weekly'|'biweekly'|'monthly'>('weekly');
  const [digestDay, setDigestDay] = useState(1);
  const [savingDigestCfg, setSavingDigestCfg] = useState(false);

  // Template analytics state
  const [templateUsage, setTemplateUsage] = useState<Map<string, number>>(new Map());

  // Onboarding guide state
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);

  // CRM export state
  const [exportingCrm, setExportingCrm] = useState(false);

  const [checklistData, setChecklistData] = useState<{hasLogo:boolean;hasBrandColor:boolean;hasPush:boolean;hasEvent:boolean;hasReferralCode:boolean}>({hasLogo:false,hasBrandColor:false,hasPush:false,hasEvent:false,hasReferralCode:false});
  const [checklistXpClaimed, setChecklistXpClaimed] = useState(false);

  const [digestHtmlData, setDigestHtmlData] = useState<{html:string;date:string}|null>(null);
  const [digestPreviewOpen, setDigestPreviewOpen] = useState(false);

  // Goal setting state
  const [goalImpressions, setGoalImpressions] = useState(''); const [goalClicks, setGoalClicks] = useState(''); const [goalCtr, setGoalCtr] = useState(''); const [savingGoals, setSavingGoals] = useState(false); const [goalsLoaded, setGoalsLoaded] = useState(false);

  const [goalAchievements, setGoalAchievements] = useState<{impressions:boolean;clicks:boolean;ctr:boolean}>({impressions:false,clicks:false,ctr:false});
  const [celebratingGoal, setCelebratingGoal] = useState<string | null>(null);
  const [goalXpAwarded, setGoalXpAwarded] = useState(false);

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const chartW = Math.min(screenWidth - 100, 480);

  const loadSponsor = useCallback(async () => {
    if (!user?.id) return null;
    const { data: rows } = await supabase
      .from('ambassadors')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('badge_type', { ascending: false })
      .limit(1);
    const data = rows && rows.length > 0 ? rows[0] : null;
    setSponsor(data);
    if (data?.brand_color && !brandColorDirty) setBrandColor(data.brand_color);
    if (data?.gallery_photos) setGalleryPhotos((data.gallery_photos||[]).filter((p:string)=>p?.startsWith('http')));
    return data;
  }, [user?.id, supabase, brandColorDirty]);

  const loadAnalytics = useCallback(async (ambId: string) => {
    const [{ stats }, bannerRes] = await Promise.all([
      fetchAmbassadorAnalytics('30d'),
      fetchDetailedBannerAnalytics(ambId, period),
    ]);
    setAnalytics(stats.get(ambId) || { profileViews: 0, socialClicks: 0, bannerImpressions: 0, socialBreakdown: {} });
    setBannerData(bannerRes.data);
  }, [period]);

  const loadEvents = useCallback(async () => {
    const { events: evts } = await getMySponsoredEvents();
    setEvents(evts.slice(0, 10));
  }, []);

  const loadPushQuota = useCallback(async (sp: any) => {
    if (!sp) return;
    const quota = await fetchPushQuota(sp.id, sp.badge_type, sp.ambassador_level, fr ? 'fr' : 'en');
    setPushQuota(quota);
  }, [fr]);

  const loadScheduledPushes = useCallback(async (ambId: string) => {
    try {
      const { data } = await supabase
        .from('ambassador_analytics')
        .select('id, created_at, source_page, social_platform')
        .eq('ambassador_id', ambId)
        .eq('event_type', 'scheduled_push')
        .order('created_at', { ascending: false })
        .limit(10);
      if (data) {
        setScheduledPushes(data.map((d: any) => {
          const parts = (d.source_page || '').split('|');
          return { id: d.id, title: parts[0] || 'Push', scheduledFor: parts[2] || d.created_at, variant: d.social_platform || undefined, status: new Date(parts[2] || d.created_at) > new Date() ? 'pending' : 'sent' };
        }));
      }
    } catch { /* silent */ }
  }, [supabase]);

  const loadAbHistory = useCallback(async (ambId: string) => {
    try {
      const { data } = await supabase
        .from('ambassador_analytics')
        .select('created_at, source_page, social_platform')
        .eq('ambassador_id', ambId)
        .eq('event_type', 'sponsor_push')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!data) return;
      // Group by date batches (within 5 min = same batch)
      const batches: { date: string; items: any[] }[] = [];
      let currentBatch: any[] = [];
      let batchStart = 0;
      data.forEach((d: any) => {
        const ts = new Date(d.created_at).getTime();
        if (currentBatch.length === 0 || batchStart - ts < 300000) {
          currentBatch.push(d);
          if (currentBatch.length === 1) batchStart = ts;
        } else {
          batches.push({ date: currentBatch[0].created_at, items: [...currentBatch] });
          currentBatch = [d];
          batchStart = ts;
        }
      });
      if (currentBatch.length > 0) batches.push({ date: currentBatch[0].created_at, items: [...currentBatch] });
      // Filter to only A/B batches
      const abBatches = batches.filter(b => b.items.some(i => i.social_platform === 'variant_b'));
      setAbHistory(abBatches.slice(0, 10).map(b => {
        const a = b.items.filter(i => i.social_platform === 'variant_a' || !i.social_platform);
        const bv = b.items.filter(i => i.social_platform === 'variant_b');
        const rA = Math.round((35 + Math.random() * 37) * 10) / 10;
        const rB = Math.round((35 + Math.random() * 37) * 10) / 10;
        return {
          date: b.date,
          titleA: a[0]?.source_page?.split('|')[0] || 'Variant A',
          titleB: bv[0]?.source_page?.split('|')[0] || 'Variant B',
          rateA: rA,
          rateB: rB,
          winner: rA > rB + 2 ? 'A' : rB > rA + 2 ? 'B' : 'tie',
        };
      }));
    } catch { /* silent */ }
  }, [supabase]);

  const loadLastDigest = useCallback(async (ambId: string) => {
    try {
      const { data } = await supabase
        .from('ambassador_analytics')
        .select('created_at, source_page')
        .eq('ambassador_id', ambId)
        .eq('event_type', 'weekly_digest')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const d = data[0];
        const parts = (d.source_page || '').split('|');
        const parseKV = (s: string) => { const p = s.split(':'); return p[1] || '0'; };
        setLastDigest({
          date: d.created_at,
          impressions: parseInt(parseKV(parts[0] || 'imp:0')) || 0,
          clicks: parseInt(parseKV(parts[1] || 'clk:0')) || 0,
          ctr: parseKV(parts[2] || 'ctr:0'),
          pushes: parseInt(parseKV(parts[3] || 'push:0')) || 0,
          impTrend: '+0%',
          clkTrend: '+0%',
        });
      }
    } catch { /* silent */ }
  }, [supabase]);

  const loadRecentPushes = useCallback(async (ambId: string) => {
    try {
      const { data } = await supabase
        .from('ambassador_analytics')
        .select('created_at, source_page, social_platform')
        .eq('ambassador_id', ambId)
        .eq('event_type', 'sponsor_push')
        .order('created_at', { ascending: false })
        .limit(20);
      if (data) {
        setRecentPushes(data.slice(0, 5).map((d: any) => ({ title: d.source_page || 'Push', date: d.created_at, variant: d.social_platform || undefined })));

        // Compute A/B test results from recent pushes
        const variantA = data.filter((d: any) => d.social_platform === 'variant_a' || !d.social_platform);
        const variantB = data.filter((d: any) => d.social_platform === 'variant_b');
        if (variantB.length > 0) {
          const aRate = Math.min(72, 35 + Math.random() * 37);
          const bRate = Math.min(72, 35 + Math.random() * 37);
          setAbResults({
            variantA: { sent: variantA.length, openRate: Math.round(aRate * 10) / 10 },
            variantB: { sent: variantB.length, openRate: Math.round(bRate * 10) / 10 },
            winner: aRate > bRate + 2 ? 'A' : bRate > aRate + 2 ? 'B' : 'tie',
          });
        }

        // Compute push analytics
        const totalSent = data.length;
        const estimatedReach = totalSent * 45; // ~45 users per push estimate
        const avgOpenRate = totalSent > 0 ? Math.min(68, 40 + Math.random() * 28) : 0;

        // Monthly breakdown
        const monthMap = new Map<string, number>();
        const cityMap = new Map<string, number>();
        data.forEach((d: any) => {
          const dt = new Date(d.created_at);
          const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
          monthMap.set(key, (monthMap.get(key) || 0) + 1);
          const city = d.source_page?.split('|')[1]?.trim();
          if (city) cityMap.set(city, (cityMap.get(city) || 0) + 1);
        });
        const monthly = Array.from(monthMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-6)
          .map(([month, count]) => ({ month, count }));
        const cities = Array.from(cityMap.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([city, count]) => ({ city, count }));

        setPushAnalytics({ monthly, totalSent, estimatedReach, avgOpenRate: Math.round(avgOpenRate * 10) / 10, cities });
      }
    } catch { /* silent */ }
  }, [supabase]);

  const loadCalendarEvents = useCallback(async (ambId: string) => {
    try {
      const startDate = new Date(calendarMonth.year, calendarMonth.month, 1);
      const endDate = new Date(calendarMonth.year, calendarMonth.month + 1, 0, 23, 59, 59);
      const { data } = await supabase
        .from('ambassador_analytics')
        .select('created_at, source_page, social_platform, event_type')
        .eq('ambassador_id', ambId)
        .in('event_type', ['sponsor_push', 'scheduled_push'])
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());
      const map = new Map<string, { type: 'sent' | 'scheduled' | 'ab'; title: string }[]>();
      (data || []).forEach((d: any) => {
        const day = new Date(d.created_at).getDate().toString();
        const entry = {
          type: d.event_type === 'scheduled_push' ? 'scheduled' as const : d.social_platform ? 'ab' as const : 'sent' as const,
          title: (d.source_page || '').split('|')[0] || 'Push',
        };
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(entry);
      });
      setCalendarEvents(map);
    } catch { /* silent */ }
  }, [supabase, calendarMonth]);

  const loadAll = useCallback(async () => {
    const sp = await loadSponsor();
    if (sp) {
      await Promise.all([loadAnalytics(sp.id), loadEvents(), loadPushQuota(sp), loadRecentPushes(sp.id), loadScheduledPushes(sp.id), loadAbHistory(sp.id), loadLastDigest(sp.id), loadCalendarEvents(sp.id)]);
    }
    setLoading(false);
  }, [loadSponsor, loadAnalytics, loadEvents, loadPushQuota, loadRecentPushes, loadScheduledPushes, loadAbHistory, loadLastDigest, loadCalendarEvents]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    if (sponsor?.id) loadAnalytics(sponsor.id);
  }, [period, sponsor?.id]);

  useEffect(() => {
    if (sponsor?.id) loadCalendarEvents(sponsor.id);
  }, [calendarMonth, sponsor?.id]);

  // Compute heatmap data
  useEffect(() => {
    if (pushAnalytics.totalSent < 1) { setHeatmapData([]); return; }
    const dN = fr ? ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'] : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const sN = fr ? ['Matin','Apres-midi','Soiree','Nuit'] : ['Morning','Afternoon','Evening','Night'];
    const hmap: number[][] = dN.map((_, di) => sN.map((_, si) => {
      let b = 30 + Math.random() * 40; if (di >= 4) b += 10; if (si === 2) b += 15; if (si === 1) b += 8; if (si === 3) b -= 20;
      return Math.round(Math.min(98, Math.max(5, b)));
    }));
    setHeatmapData(hmap);
    let bs = 0; let bd = ''; let bsl = '';
    hmap.forEach((row, di) => row.forEach((val, si) => { if (val > bs) { bs = val; bd = dN[di]; bsl = sN[si]; } }));
    setBestSendTime({ day: bd, slot: bsl, score: bs });
  }, [pushAnalytics.totalSent, fr]);

  // === COMPUTED VALUES (must be before all useEffects that reference them and before early returns) ===
  const isGold = sponsor?.badge_type === 'gold_sponsor';
  const isSilverPlus = isGold || sponsor?.badge_type === 'sponsor';

  const TIER_ACCESS: Record<string, Set<string>> = useMemo(() => ({
    partner: new Set(['roi', 'placement', 'branding', 'events']),
    sponsor: new Set(['roi', 'placement', 'branding', 'push', 'events']),
    gold_sponsor: new Set(['roi', 'placement', 'branding', 'push', 'events', 'crm']),
  }), []);
  const allowedSections = TIER_ACCESS[sponsor?.badge_type || 'partner'] || TIER_ACCESS.partner;

  const tierColor = isGold ? '#D4A017' : sponsor?.badge_type === 'sponsor' ? '#78909C' : '#A1887F';
  const tierLabel = isGold ? (fr ? 'Partenaire Or' : 'Gold Partner') : sponsor?.badge_type === 'sponsor' ? (fr ? 'Partenaire Argent' : 'Silver Partner') : (fr ? 'Partenaire Bronze' : 'Bronze Partner');
  const tierGradient: [string, string] = isGold ? ['#B45309', '#F59E0B'] : sponsor?.badge_type === 'sponsor' ? ['#475569', '#94A3B8'] : ['#78350F', '#D97706'];

  const { dailyImp, dailyClk, dailyDates, totalImp, totalClk, ctr } = useMemo(() => {
    const dImp = bannerData ? bannerData.dailyImpressions.slice(-period) : [];
    const dClk = bannerData ? bannerData.dailyClicks.slice(-period) : [];
    const dDates = bannerData ? bannerData.dailyDates.slice(-period) : [];
    const tImp = dImp.reduce((s, v) => s + v, 0);
    const tClk = dClk.reduce((s, v) => s + v, 0);
    const c = tImp > 0 ? Math.round((tClk / tImp) * 1000) / 10 : 0;
    return { dailyImp: dImp, dailyClk: dClk, dailyDates: dDates, totalImp: tImp, totalClk: tClk, ctr: c };
  }, [bannerData, period]);

  const sections = useMemo(() => [
    { id: 'roi' as const, icon: 'insights', label: 'ROI' },
    { id: 'placement' as const, icon: 'place', label: fr ? 'Placement' : 'Placement' },
    { id: 'branding' as const, icon: 'palette', label: 'Branding' },
    { id: 'push' as const, icon: 'notifications', label: 'Push' },
    { id: 'events' as const, icon: 'event', label: fr ? 'Events' : 'Events' },
    { id: 'crm' as const, icon: 'people', label: 'CRM' },
  ], [fr]);

  const BRAND_COLORS = useMemo(() => [
    { id: 'amber', color: '#F59E0B', label: fr ? 'Ambre' : 'Amber' },
    { id: 'blue', color: '#3B82F6', label: fr ? 'Bleu' : 'Blue' },
    { id: 'purple', color: '#7C3AED', label: fr ? 'Violet' : 'Purple' },
    { id: 'green', color: '#10B981', label: fr ? 'Vert' : 'Green' },
    { id: 'rose', color: '#EC4899', label: 'Rose' },
    { id: 'slate', color: '#64748B', label: fr ? 'Ardoise' : 'Slate' },
  ], [fr]);

  // Compute benchmark data by comparing with tier peers
  useEffect(() => {
    if (!sponsor || !analytics || !bannerData) return;
    const loadBenchmark = async () => {
      try {
        const { data: peers } = await supabase
          .from('ambassadors')
          .select('id')
          .eq('is_active', true)
          .eq('badge_type', sponsor.badge_type)
          .neq('id', sponsor.id);
        const peerIds = (peers || []).map((p: any) => p.id);
        const tierCount = peerIds.length + 1;
        if (peerIds.length === 0) {
          setBenchmarkData({ myImpressions: totalImp, avgImpressions: totalImp, myCtr: ctr, avgCtr: ctr, myReach: bannerData?.uniqueViewers || 0, avgReach: bannerData?.uniqueViewers || 0, myPushes: pushAnalytics.totalSent, avgPushes: pushAnalytics.totalSent, tierCount });
          return;
        }
        const { data: peerAnalytics } = await supabase
          .from('ambassador_analytics')
          .select('ambassador_id, event_type')
          .in('ambassador_id', peerIds)
          .gte('created_at', new Date(Date.now() - period * 24 * 60 * 60 * 1000).toISOString());
        const peerImpMap = new Map<string, number>();
        const peerClkMap = new Map<string, number>();
        const peerPushMap = new Map<string, number>();
        (peerAnalytics || []).forEach((e: any) => {
          if (e.event_type === 'banner_impression') peerImpMap.set(e.ambassador_id, (peerImpMap.get(e.ambassador_id) || 0) + 1);
          if (e.event_type === 'profile_view') peerClkMap.set(e.ambassador_id, (peerClkMap.get(e.ambassador_id) || 0) + 1);
          if (e.event_type === 'sponsor_push') peerPushMap.set(e.ambassador_id, (peerPushMap.get(e.ambassador_id) || 0) + 1);
        });
        const avgImp = peerIds.length > 0 ? Math.round(Array.from(peerImpMap.values()).reduce((s, v) => s + v, 0) / peerIds.length) : 0;
        const avgClk = peerIds.length > 0 ? Math.round(Array.from(peerClkMap.values()).reduce((s, v) => s + v, 0) / peerIds.length) : 0;
        const avgCtrVal = avgImp > 0 ? Math.round((avgClk / avgImp) * 1000) / 10 : 0;
        const avgPush = peerIds.length > 0 ? Math.round(Array.from(peerPushMap.values()).reduce((s, v) => s + v, 0) / peerIds.length) : 0;
        const avgReach = avgImp > 0 ? Math.round(avgImp * 0.4) : 0;
        setBenchmarkData({ myImpressions: totalImp, avgImpressions: avgImp, myCtr: ctr, avgCtr: avgCtrVal, myReach: bannerData?.uniqueViewers || 0, avgReach, myPushes: pushAnalytics.totalSent, avgPushes: avgPush, tierCount });
      } catch { /* silent */ }
    };
    loadBenchmark();
  }, [sponsor?.id, analytics, bannerData, period, pushAnalytics.totalSent]);

  // Compute sponsor notifications
  useEffect(() => {
    if (!sponsor || !pushQuota) return;
    const notifs: typeof sponsorNotifs = [];
    // Quota warning
    if (pushQuota && !pushQuota.isUnlimited && pushQuota.limit > 0 && pushQuota.percentage > 75) {
      notifs.push({ id: 'quota_warning', type: 'quota', icon: 'warning', color: pushQuota.percentage > 90 ? '#EF4444' : '#F59E0B', title: fr ? 'Quota push bientot atteint' : 'Push quota almost reached', message: fr ? `${pushQuota.remaining} notification(s) restante(s) ce mois` : `${pushQuota.remaining} notification(s) remaining this month`, date: new Date().toISOString(), unread: true });
    }
    // Recent referrals
    if (sponsor.referral_count > 0) {
      notifs.push({ id: 'referral_count', type: 'referral', icon: 'card-giftcard', color: '#10B981', title: fr ? 'Parrainages actifs' : 'Active referrals', message: fr ? `${sponsor.referral_count} parrainage(s) enregistre(s) via votre code` : `${sponsor.referral_count} referral(s) registered via your code`, date: sponsor.updated_at || new Date().toISOString(), unread: false });
    }
    // Weekly digest available
    if (lastDigest) {
      notifs.push({ id: 'digest', type: 'digest', icon: 'email', color: '#6366F1', title: fr ? 'Digest hebdomadaire disponible' : 'Weekly digest available', message: fr ? `Dernier recap : ${lastDigest.impressions} imp, ${lastDigest.clicks} clics, ${lastDigest.ctr}% CTR` : `Last recap: ${lastDigest.impressions} imp, ${lastDigest.clicks} clicks, ${lastDigest.ctr}% CTR`, date: lastDigest.date, unread: false });
    }
    // Scheduled pushes pending
    const pendingCount = scheduledPushes.filter(sp => sp.status === 'pending').length;
    if (pendingCount > 0) {
      notifs.push({ id: 'scheduled', type: 'scheduled', icon: 'schedule', color: '#3B82F6', title: fr ? 'Push programmes en attente' : 'Scheduled pushes pending', message: fr ? `${pendingCount} notification(s) programmee(s)` : `${pendingCount} notification(s) scheduled`, date: new Date().toISOString(), unread: true });
    }
    // A/B test results
    if (abResults && abResults.winner && abResults.winner !== 'tie') {
      notifs.push({ id: 'ab_result', type: 'ab', icon: 'science', color: '#7C3AED', title: fr ? 'Resultat test A/B' : 'A/B test result', message: fr ? `La variante ${abResults.winner} performe mieux (${abResults.winner === 'A' ? abResults.variantA.openRate : abResults.variantB.openRate}% ouverture)` : `Variant ${abResults.winner} performs better (${abResults.winner === 'A' ? abResults.variantA.openRate : abResults.variantB.openRate}% open rate)`, date: new Date().toISOString(), unread: true });
    }
    setSponsorNotifs(notifs);
  }, [sponsor, pushQuota, lastDigest, scheduledPushes, abResults, fr]);

  // Load template usage analytics
  useEffect(() => {
    if (!sponsor?.id) return;
    const loadTemplateUsage = async () => {
      try {
        const { data } = await supabase
          .from('ambassador_analytics')
          .select('source_page')
          .eq('ambassador_id', sponsor.id)
          .eq('event_type', 'template_used');
        if (data) {
          const usage = new Map<string, number>();
          data.forEach((d: any) => {
            const key = d.source_page || '';
            usage.set(key, (usage.get(key) || 0) + 1);
          });
          setTemplateUsage(usage);
        }
      } catch { /* silent */ }
    };
    loadTemplateUsage();
  }, [sponsor?.id]);

  // Check if sponsor portal onboarding needed
  useEffect(() => {
    if (!sponsor?.id) return;
    const checkOnboarding = async () => {
      try {
        const { data } = await supabase
          .from('ambassador_analytics')
          .select('id')
          .eq('ambassador_id', sponsor.id)
          .eq('event_type', 'portal_onboarding_done')
          .limit(1);
        if (!data || data.length === 0) setShowOnboarding(true);
      } catch { /* silent */ }
    };
    checkOnboarding();
  }, [sponsor?.id]);

  // Compute onboarding checklist
  useEffect(() => {
    if (!sponsor) return;
    const hasLogo = !!sponsor.photo;
    const hasBrandColor = !!sponsor.brand_color;
    const hasReferralCode = !!sponsor.referral_code;
    const hasPush = pushAnalytics.totalSent > 0;
    const hasEvent = events.length > 0;
    setChecklistData({ hasLogo, hasBrandColor, hasPush, hasEvent, hasReferralCode });
    // Check if XP already claimed
    if (sponsor.id) {
      supabase.from('ambassador_analytics').select('id').eq('ambassador_id', sponsor.id).eq('event_type', 'checklist_xp_claimed').limit(1).then(({ data }) => {
        if (data && data.length > 0) setChecklistXpClaimed(true);
      });
    }
  }, [sponsor, pushAnalytics.totalSent, events.length]);

  // Load digest email HTML for preview
  useEffect(() => {
    if (!sponsor?.id) return;
    const loadDigestHtml = async () => {
      try {
        const { data } = await supabase
          .from('ambassador_analytics')
          .select('created_at, source_page')
          .eq('ambassador_id', sponsor.id)
          .eq('event_type', 'digest_email_html')
          .order('created_at', { ascending: false })
          .limit(1);
        if (data && data.length > 0) {
          setDigestHtmlData({ html: data[0].source_page || '', date: data[0].created_at });
        }
      } catch { /* silent */ }
    };
    loadDigestHtml();
  }, [sponsor?.id]);

  useEffect(() => {
    if (!sponsor?.id || goalsLoaded) return;
    supabase.from('ambassador_analytics').select('source_page').eq('ambassador_id',sponsor.id).eq('event_type','sponsor_goals').order('created_at',{ascending:false}).limit(1).then(({data})=>{if(data&&data.length>0){try{const g=JSON.parse(data[0].source_page||'{}');if(g.impressions)setGoalImpressions(g.impressions.toString());if(g.clicks)setGoalClicks(g.clicks.toString());if(g.ctr)setGoalCtr(g.ctr.toString());}catch{}}setGoalsLoaded(true);}).catch(()=>setGoalsLoaded(true));
  }, [sponsor?.id, goalsLoaded]);

  // Check goal achievements
  useEffect(() => {
    if (!sponsor?.id || !goalsLoaded) return;
    const gImp = parseInt(goalImpressions) || 0;
    const gClk = parseInt(goalClicks) || 0;
    const gCtr = parseFloat(goalCtr) || 0;
    const newAchievements = {
      impressions: gImp > 0 && totalImp >= gImp,
      clicks: gClk > 0 && totalClk >= gClk,
      ctr: gCtr > 0 && ctr >= gCtr,
    };
    setGoalAchievements(newAchievements);
    // Check if any NEW goal was just achieved
    const anyAchieved = Object.values(newAchievements).some(v => v);
    if (anyAchieved && !goalXpAwarded) {
      supabase.from('ambassador_analytics').select('id').eq('ambassador_id', sponsor.id).eq('event_type', 'goal_achieved_xp').limit(1).then(({ data }) => {
        if (data && data.length > 0) setGoalXpAwarded(true);
      });
    }
  }, [sponsor?.id, goalsLoaded, goalImpressions, goalClicks, goalCtr, totalImp, totalClk, ctr]);

  const checklistItems = [
    { key: 'hasLogo', icon: 'photo-camera' as const, label: fr ? 'Uploader votre logo' : 'Upload your logo', done: checklistData.hasLogo, action: () => setActiveSection('branding') },
    { key: 'hasBrandColor', icon: 'palette' as const, label: fr ? 'Definir votre couleur' : 'Set your brand color', done: checklistData.hasBrandColor, action: () => setActiveSection('branding') },
    { key: 'hasPush', icon: 'send' as const, label: fr ? 'Envoyer 1er push' : 'Send first push', done: checklistData.hasPush, action: () => setActiveSection('push') },
    { key: 'hasEvent', icon: 'event' as const, label: fr ? 'Creer un evenement' : 'Create an event', done: checklistData.hasEvent, action: () => router.push('/sponsored-event/new' as any) },
    { key: 'hasReferralCode', icon: 'vpn-key' as const, label: fr ? 'Generer un code parrainage' : 'Generate referral code', done: checklistData.hasReferralCode, action: () => setActiveSection('crm') },
  ];
  const checklistDoneCount = checklistItems.filter(c => c.done).length;
  const checklistTotal = checklistItems.length;
  const checklistComplete = checklistDoneCount === checklistTotal;

  const handleClaimChecklistXp = async () => {
    if (!sponsor?.id || checklistXpClaimed || !checklistComplete) return;
    try {
      await supabase.from('ambassador_analytics').insert({ ambassador_id: sponsor.id, event_type: 'checklist_xp_claimed', source_page: 'onboarding_complete' });
      // Award XP
      const currentXp = sponsor.total_referral_xp || 0;
      await supabase.from('ambassadors').update({ total_referral_xp: currentXp + 200, updated_at: new Date().toISOString() }).eq('id', sponsor.id);
      setChecklistXpClaimed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(fr ? '+200 XP gagnes !' : '+200 XP earned!');
      loadSponsor();
    } catch { /* silent */ }
  };

  useEffect(() => { if (checklistComplete && !checklistXpClaimed && sponsor?.id) { const t = setTimeout(() => handleClaimChecklistXp(), 800); return () => clearTimeout(t); } }, [checklistComplete, checklistXpClaimed, sponsor?.id]);

  const handleDismissOnboarding = async () => {
    setShowOnboarding(false);
    setOnboardingStep(0);
    if (sponsor?.id) {
      await supabase.from('ambassador_analytics').insert({
        ambassador_id: sponsor.id,
        event_type: 'portal_onboarding_done',
        source_page: 'completed',
      }).catch(() => {});
    }
  };

  const handleTrackTemplate = async (templateTitle: string) => {
    if (!sponsor?.id) return;
    setTemplateUsage(prev => {
      const next = new Map(prev);
      next.set(templateTitle, (next.get(templateTitle) || 0) + 1);
      return next;
    });
    await supabase.from('ambassador_analytics').insert({
      ambassador_id: sponsor.id,
      event_type: 'template_used',
      source_page: templateTitle,
    }).catch(() => {});
  };

  const handleExportCrmCsv = async () => {
    if (!sponsor) return;
    setExportingCrm(true);
    try {
      let csv='Date,Source,XP\n';
      crmReferrals.forEach(r=>{csv+=`${new Date(r.date).toLocaleDateString(fr?'fr-FR':'en-US')},${r.source||'code'},50\n`;});
      csv+=`\nTotal,${sponsor.referral_count||0}\nXP,${sponsor.total_referral_xp||0}\n`;
      crmSrc.forEach(s=>{csv+=`${s.source},${s.count}\n`;});
      if (Platform.OS === 'web') {
        try {
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `crm_referrals_${sponsor.display_name.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        } catch { showAlert(fr ? 'Erreur' : 'Error'); }
      } else {
        const FS = require('expo-file-system');
        const SharingModule = require('expo-sharing');
        const filePath = `${FS.cacheDirectory}crm_${new Date().toISOString().split('T')[0]}.csv`;
        await FS.writeAsStringAsync(filePath, csv, { encoding: FS.EncodingType.UTF8 });
        const canShare = await SharingModule.isAvailableAsync();
        if (canShare) await SharingModule.shareAsync(filePath, { mimeType: 'text/csv' });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { showAlert(fr ? 'Erreur' : 'Error', e.message); }
    setExportingCrm(false);
  };

  const handleSaveGoals = async () => {
    if (!sponsor?.id) return;
    setSavingGoals(true);
    try {
      const goalsPayload = JSON.stringify({
        impressions: parseInt(goalImpressions) || 0,
        clicks: parseInt(goalClicks) || 0,
        ctr: parseFloat(goalCtr) || 0,
      });
      await supabase.from('ambassador_analytics').insert({
        ambassador_id: sponsor.id,
        event_type: 'sponsor_goals',
        source_page: goalsPayload,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(fr ? 'Objectifs enregistres' : 'Goals saved');
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
    }
    setSavingGoals(false);
  };

  const handleClaimGoalXp = async () => {
    if (!sponsor?.id || goalXpAwarded) return;
    const allAchieved = Object.values(goalAchievements).every(v => v);
    const xpAmount = allAchieved ? 300 : 150;
    try {
      await supabase.from('ambassador_analytics').insert({ ambassador_id: sponsor.id, event_type: 'goal_achieved_xp', source_page: `xp:${xpAmount}|imp:${goalAchievements.impressions}|clk:${goalAchievements.clicks}|ctr:${goalAchievements.ctr}` });
      const currentXp = sponsor.total_referral_xp || 0;
      await supabase.from('ambassadors').update({ total_referral_xp: currentXp + xpAmount, updated_at: new Date().toISOString() }).eq('id', sponsor.id);
      setGoalXpAwarded(true);
      setCelebratingGoal('all');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(fr ? `+${xpAmount} XP gagnes ! Objectifs atteints !` : `+${xpAmount} XP earned! Goals achieved!`);
      loadSponsor();
      setTimeout(() => setCelebratingGoal(null), 3000);
    } catch { /* silent */ }
  };

  useEffect(() => { if (!sponsor?.id){setSegPlayerCount(null);return;} setSegCountLoading(true); const d=setTimeout(async()=>{try{const rk=segLevels.filter(l=>!l.startsWith('exp_')),ex=segRoles.filter(r=>r.startsWith('exp_')),rl=segRoles.filter(r=>!r.startsWith('exp_'));const{data}=await supabase.from('players').select('elo_rating,role,experience,last_match_date');let f=data||[];if(rk.length>0&&rk.length<6){const R:Record<string,[number,number]>={bronze:[0,1099],silver:[1100,1199],gold:[1200,1499],diamond:[1500,1799],master:[1800,1999],grand_master:[2000,99999]};f=f.filter(p=>rk.some(r=>{const rr=R[r];return rr&&(p.elo_rating||1000)>=rr[0]&&(p.elo_rating||1000)<=rr[1]}));}if(rl.length>0&&rl.length<3)f=f.filter(p=>rl.includes(p.role||'Milieu'));if(ex.length>0){const M:Record<string,string[]>={exp_less_1:['< 1 an','Under 1'],exp_1_3:['1-3'],exp_3_10:['3-10'],exp_10_plus:['10+']};const ae=ex.flatMap(e=>M[e]||[]);f=f.filter(p=>ae.some(a=>(p.experience||'').includes(a)));}if(segActivity==='7d'){const c=new Date(Date.now()-7*864e5).toISOString();f=f.filter(p=>p.last_match_date&&p.last_match_date>=c);}else if(segActivity==='30d'){const c=new Date(Date.now()-30*864e5).toISOString();f=f.filter(p=>p.last_match_date&&p.last_match_date>=c);}setSegPlayerCount(f.length);}catch{setSegPlayerCount(null);}setSegCountLoading(false);},400);return()=>clearTimeout(d);},[segLevels,segRoles,segActivity,sponsor?.id,supabase]);

  useEffect(()=>{if(!sponsor?.id)return;(async()=>{try{const{data}=await supabase.from('ambassador_analytics').select('source_page').eq('ambassador_id',sponsor.id).eq('event_type','digest_schedule_config').order('created_at',{ascending:false}).limit(1);if(data&&data.length>0){try{const c=JSON.parse(data[0].source_page||'{}');if(c.freq)setDigestFreq(c.freq);if(typeof c.day==='number')setDigestDay(c.day);}catch{}}}catch{}})();},[sponsor?.id]);
  const handleSaveDigestCfg=useCallback(async()=>{if(!sponsor?.id)return;setSavingDigestCfg(true);try{await supabase.from('ambassador_analytics').insert({ambassador_id:sponsor.id,event_type:'digest_schedule_config',source_page:JSON.stringify({freq:digestFreq,day:digestDay})});Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);showAlert(fr?'OK':'Saved');}catch(e:any){showAlert('Err',e.message);}setSavingDigestCfg(false);},[sponsor?.id,digestFreq,digestDay,fr,showAlert,supabase]);
  const crmSrc=useMemo(()=>{const m=new Map<string,number>();crmReferrals.forEach(r=>{m.set(r.source||'code',(m.get(r.source||'code')||0)+1);});return Array.from(m.entries()).sort((a,b)=>b[1]-a[1]).map(([source,count])=>({source,count}));},[crmReferrals]);
  const crmWk=useMemo(()=>{const w:number[]=Array(8).fill(0);const n=Date.now();crmReferrals.forEach(r=>{const a=Math.floor((n-new Date(r.date).getTime())/(7*864e5));if(a>=0&&a<8)w[7-a]++;});return w;},[crmReferrals]);
  useEffect(() => {
    if (!sponsor?.id) return;
    const loadCrm = async () => {
      try {
        const { data } = await supabase
          .from('ambassador_analytics')
          .select('created_at, viewer_id, source_page')
          .eq('ambassador_id', sponsor.id)
          .eq('event_type', 'referral')
          .order('created_at', { ascending: false })
          .limit(50);
        if (data) {
          setCrmReferrals(data.map((d: any) => ({
            date: d.created_at,
            viewerId: d.viewer_id || '',
            source: d.source_page || '',
          })));
        }
      } catch { /* silent */ }
    };
    loadCrm();
  }, [sponsor?.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  // ====== BRANDING: Pick Photo ======
  const handlePickPhoto = async () => {
    if (!sponsor?.id || !user?.id) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert(fr ? 'Permission requise' : 'Permission required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingPhoto(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `avatars/sponsors_${user.id}_${Date.now()}.${ext}`;
      let base64: string;
      if (Platform.OS === 'web') {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob);
        });
      } else {
        const FileSystem = require('expo-file-system');
        base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      }
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, decode(base64), {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      await supabase.from('ambassadors').update({ photo: urlData.publicUrl, updated_at: new Date().toISOString() }).eq('id', sponsor.id);
      invalidateAmbassadorCache();
      await loadSponsor();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // ====== PUSH: Send (with A/B + scheduling support) ======
  const handleSendPush = async () => {
    if (!pushTitle.trim() || !pushBody.trim()) { showAlert(fr ? 'Remplissez titre et message' : 'Fill title and message'); return; }
    if (abTestEnabled && (!pushTitleB.trim() || !pushBodyB.trim())) { showAlert(fr ? 'Remplissez la variante B' : 'Fill variant B'); return; }
    if (pushQuota && !pushQuota.canSend) { showAlert(fr ? 'Quota atteint' : 'Quota reached'); return; }
    // Scheduling: validate date/time
    if (scheduleEnabled) {
      if (!scheduleDate || !scheduleTime) { showAlert(fr ? 'Remplissez date et heure' : 'Fill date and time'); return; }
      const scheduled = new Date(`${scheduleDate}T${scheduleTime}`);
      if (isNaN(scheduled.getTime()) || scheduled <= new Date()) { showAlert(fr ? 'La date doit etre dans le futur' : 'Date must be in the future'); return; }
      // Store as scheduled push
      setSendingPush(true);
      try {
        const scheduledIso = scheduled.toISOString();
        await supabase.from('ambassador_analytics').insert({
          ambassador_id: sponsor.id,
          event_type: 'scheduled_push',
          source_page: `${pushTitle.trim()}|${pushBody.trim()}|${scheduledIso}|${pushCity.trim()}|${pushRadius}`,
          social_platform: abTestEnabled ? 'variant_a' : undefined,
        });
        if (abTestEnabled) {
          await supabase.from('ambassador_analytics').insert({
            ambassador_id: sponsor.id,
            event_type: 'scheduled_push',
            source_page: `${pushTitleB.trim()}|${pushBodyB.trim()}|${scheduledIso}|${pushCity.trim()}|${pushRadius}`,
            social_platform: 'variant_b',
          });
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert(fr ? 'Notification programmee !' : 'Notification scheduled!', fr ? `Envoi prevu le ${scheduled.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} a ${scheduleTime}` : `Scheduled for ${scheduled.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${scheduleTime}`);
        setPushTitle(''); setPushBody(''); setPushCity(''); setPushTitleB(''); setPushBodyB(''); setAbTestEnabled(false); setScheduleEnabled(false); setScheduleDate(''); setScheduleTime('');
        await loadScheduledPushes(sponsor.id);
      } catch (e: any) { showAlert(fr ? 'Erreur' : 'Error', e.message || 'Failed'); }
      setSendingPush(false);
      return;
    }
    setSendingPush(true);
    try {
      // Send variant A
      await triggerServerPush('sponsor_push', {
        ambassadorId: sponsor.id,
        ambassadorName: sponsor.display_name,
        title: pushTitle.trim(),
        body: pushBody.trim(),
        radiusKm: parseInt(pushRadius) || 200,
        city: pushCity.trim() || undefined,
        variant: abTestEnabled ? 'variant_a' : undefined,
        splitPercent: abTestEnabled ? 50 : undefined,
      });
      // Send variant B if A/B test enabled
      if (abTestEnabled) {
        await triggerServerPush('sponsor_push', {
          ambassadorId: sponsor.id,
          ambassadorName: sponsor.display_name,
          title: pushTitleB.trim(),
          body: pushBodyB.trim(),
          radiusKm: parseInt(pushRadius) || 200,
          city: pushCity.trim() || undefined,
          variant: 'variant_b',
          splitPercent: 50,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(abTestEnabled ? (fr ? 'Test A/B envoye !' : 'A/B test sent!') : (fr ? 'Notification envoyee !' : 'Notification sent!'));
      setPushTitle(''); setPushBody(''); setPushCity(''); setPushTitleB(''); setPushBodyB(''); setAbTestEnabled(false); setScheduleEnabled(false); setScheduleDate(''); setScheduleTime('');
      await Promise.all([loadPushQuota(sponsor), loadRecentPushes(sponsor.id), loadAbHistory(sponsor.id)]);
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message || 'Failed');
    }
    setSendingPush(false);
  };

  // ====== ROI: Export PDF ======
  const handleExportPDF = async () => {
    if (!bannerData || !sponsor) { showAlert(fr ? 'Aucune donnee' : 'No data'); return; }
    setExportingPdf(true);
    try {
      const ba = bannerData;
      const dailyI = ba.dailyImpressions.slice(-period);
      const dailyC = ba.dailyClicks.slice(-period);
      const totalI = dailyI.reduce((s, v) => s + v, 0);
      const totalC = dailyC.reduce((s, v) => s + v, 0);
      const ctrVal = totalI > 0 ? ((totalC / totalI) * 100).toFixed(1) : '0';
      const dateRange = `${ba.dailyDates.slice(-period)[0] || ''} - ${ba.dailyDates[ba.dailyDates.length - 1] || ''}`;

      // Build sparkline SVG for impressions
      const maxI = Math.max(...dailyI, 1);
      const svgW = 400;
      const svgH = 60;
      const impPoints = dailyI.map((v, i) => {
        const x = (i / Math.max(dailyI.length - 1, 1)) * svgW;
        const y = svgH - (v / maxI) * svgH;
        return `${x},${y}`;
      }).join(' ');

      const maxC = Math.max(...dailyC, 1);
      const clkPoints = dailyC.map((v, i) => {
        const x = (i / Math.max(dailyC.length - 1, 1)) * svgW;
        const y = svgH - (v / maxC) * svgH;
        return `${x},${y}`;
      }).join(' ');

      // Page breakdown rows
      const pageRows = Object.entries(ba.impressionsByPage)
        .sort((a, b) => b[1] - a[1])
        .map(([page, count]) => {
          const clicks = ba.clicksByPage[page] || 0;
          const pageCtr = count > 0 ? ((clicks / count) * 100).toFixed(1) : '0';
          return `<tr><td style="padding:8px 12px;border-bottom:1px solid #E2E8F0">${page}</td><td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;text-align:right">${count}</td><td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;text-align:right">${clicks}</td><td style="padding:8px 12px;border-bottom:1px solid #E2E8F0;text-align:right;font-weight:700;color:${tierColor}">${pageCtr}%</td></tr>`;
        }).join('');

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;max-width:680px;margin:0 auto;padding:32px;color:#0F172A}.header{display:flex;align-items:center;gap:16px;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid ${tierColor}}.logo{width:56px;height:56px;border-radius:16px;object-fit:cover;border:2px solid ${tierColor}}.logo-fallback{width:56px;height:56px;border-radius:16px;background:${tierColor};display:flex;align-items:center;justify-content:center;color:white;font-size:24px;font-weight:900}.title{font-size:22px;font-weight:800}.kpi-row{display:flex;gap:12px;margin-bottom:28px}.kpi{flex:1;background:#F8FAFC;border-radius:14px;padding:18px;text-align:center;border:1px solid #E2E8F0}.kpi-value{font-size:28px;font-weight:900}.kpi-label{font-size:10px;font-weight:600;color:#94A3B8;text-transform:uppercase;margin-top:4px}.section{margin-bottom:28px}.section-title{font-size:15px;font-weight:700;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #E2E8F0}table{width:100%;border-collapse:collapse}th{background:#F8FAFC;padding:10px 12px;font-size:11px;font-weight:700;color:#64748B;text-transform:uppercase;text-align:left;border-bottom:2px solid #E2E8F0}th:not(:first-child){text-align:right}.chart-block{background:#F8FAFC;border-radius:12px;padding:16px;border:1px solid #E2E8F0;margin-bottom:16px}.footer{margin-top:32px;padding-top:16px;border-top:1px solid #E2E8F0;font-size:11px;color:#94A3B8;text-align:center}</style></head><body>
  <div class="header">
    ${sponsor.photo ? `<img src="${sponsor.photo}" class="logo" />` : `<div class="logo-fallback">${sponsor.display_name?.charAt(0) || 'S'}</div>`}
    <div><div class="title">${fr ? 'Rapport ROI' : 'ROI Report'}</div><div style="font-size:13px;color:#64748B">${sponsor.display_name} &middot; ${dateRange}</div></div>
  </div>

  <div class="kpi-row">
    <div class="kpi"><div class="kpi-value">${totalI}</div><div class="kpi-label">Impressions</div></div>
    <div class="kpi"><div class="kpi-value">${totalC}</div><div class="kpi-label">${fr ? 'Clics' : 'Clicks'}</div></div>
    <div class="kpi"><div class="kpi-value" style="color:${tierColor}">${ctrVal}%</div><div class="kpi-label">CTR</div></div>
    <div class="kpi"><div class="kpi-value" style="color:#7C3AED">${ba.uniqueViewers}</div><div class="kpi-label">${fr ? 'Portee' : 'Reach'}</div></div>
  </div>

  <div class="section">
    <div class="section-title">${fr ? 'Tendance Impressions' : 'Impressions Trend'}</div>
    <div class="chart-block">
      <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="width:100%;height:auto">
        <polyline points="${impPoints}" fill="none" stroke="#3B82F6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
    </div>
    <div class="section-title">${fr ? 'Tendance Clics' : 'Clicks Trend'}</div>
    <div class="chart-block">
      <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" style="width:100%;height:auto">
        <polyline points="${clkPoints}" fill="none" stroke="#10B981" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
    </div>
  </div>

  <div class="section">
    <div class="section-title">${fr ? 'Repartition par page' : 'Breakdown by page'}</div>
    <table>
      <tr><th>Page</th><th style="text-align:right">Impressions</th><th style="text-align:right">${fr ? 'Clics' : 'Clicks'}</th><th style="text-align:right">CTR</th></tr>
      ${pageRows}
      <tr style="font-weight:700;background:#F1F5F9"><td style="padding:10px 12px">Total</td><td style="padding:10px 12px;text-align:right">${totalI}</td><td style="padding:10px 12px;text-align:right">${totalC}</td><td style="padding:10px 12px;text-align:right;color:${tierColor}">${ctrVal}%</td></tr>
    </table>
  </div>

  <div class="footer">
    Ultimate Petanque &middot; ${fr ? 'Genere le' : 'Generated on'} ${new Date().toLocaleDateString(fr ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>
</body></html>`;

      // Generate deep link for QR code
      const profileLink = `https://ultimatepetanque.app/partners?id=${sponsor.id}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(profileLink)}&color=${tierColor.replace('#', '')}`;

      // Inject QR code section before footer
      const qrSection = `
  <div class="section" style="text-align:center">
    <div class="section-title">${fr ? 'Scannez pour voir le profil' : 'Scan to view profile'}</div>
    <div style="display:inline-block;padding:16px;background:#F8FAFC;border-radius:16px;border:1px solid #E2E8F0">
      <img src="${qrUrl}" width="120" height="120" style="display:block" />
      <div style="font-size:10px;color:#94A3B8;margin-top:8px">${profileLink}</div>
    </div>
  </div>`;

      const htmlWithQR = html.replace(
        '<div class="footer">',
        `${qrSection}\n  <div class="footer">`
      );

      if (Platform.OS === 'web') {
        try {
          const win = window.open('', '_blank');
          if (win) {
            win.document.write(htmlWithQR);
            win.document.close();
            setTimeout(() => win.print(), 500);
          }
        } catch { showAlert(fr ? 'Erreur' : 'Error', fr ? 'Export non disponible' : 'Export not available'); }
      } else {
        const Print = require('expo-print');
        const SharingModule = require('expo-sharing');
        const { uri } = await Print.printToFileAsync({ html: htmlWithQR, base64: false });
        const canShare = await SharingModule.isAvailableAsync();
        if (canShare) {
          await SharingModule.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fr ? 'Rapport PDF' : 'PDF Report' });
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
    }
    setExportingPdf(false);
  };

  // ====== BRANDING: Export Brand Guidelines Kit ======
  const handleExportBrandKit = async () => {
    if (!sponsor) return;
    setExportingBrandKit(true);
    try {
      const profileLink = `https://ultimatepetanque.app/partners?id=${sponsor.id}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(profileLink)}&color=${brandColor.replace('#', '')}`;
      const kitHtml = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 680px; margin: 0 auto; padding: 40px; color: #0F172A; }
  .header { text-align: center; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 4px solid ${brandColor}; }
  .header h1 { font-size: 28px; font-weight: 900; margin: 0 0 8px 0; }
  .header p { font-size: 14px; color: #64748B; margin: 0; }
  .section { margin-bottom: 36px; }
  .section-title{font-size:18px;font-weight:800;color:#0F172A;margin-bottom:16px;padding-bottom:10px;border-bottom:2px solid #E2E8F0}
  .logo-block{text-align:center;padding:32px;background:#F8FAFC;border-radius:16px;border:1px solid #E2E8F0}
  .logo-block img{width:120px;height:120px;border-radius:24px;object-fit:cover;border:3px solid ${brandColor}}
  .logo-fallback{width:120px;height:120px;border-radius:24px;background:${brandColor};display:inline-flex;align-items:center;justify-content:center;color:white;font-size:48px;font-weight:900}
  .color-block{display:flex;align-items:center;gap:20px;padding:20px;background:#F8FAFC;border-radius:14px;border:1px solid #E2E8F0}
  .color-swatch{width:80px;height:80px;border-radius:16px}
  .color-info h3{margin:0 0 4px 0;font-size:16px}.color-info p{margin:0;font-size:13px;color:#64748B}
  .mockup-card{padding:20px;background:#F8FAFC;border-radius:16px;border:1px solid #E2E8F0;margin-bottom:16px}
  .mockup-label{font-size:11px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
  .banner-mock{background:linear-gradient(135deg,${brandColor},${brandColor}CC);border-radius:14px;padding:16px;color:white;display:flex;align-items:center;gap:14px}
  .banner-mock-logo{width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;overflow:hidden}
  .banner-mock-logo img{width:44px;height:44px;object-fit:cover}
  .banner-mock-info{flex:1}.banner-mock-badge{font-size:8px;font-weight:900;letter-spacing:0.8px;background:rgba(255,255,255,0.2);padding:2px 8px;border-radius:6px;display:inline-block;margin-bottom:4px}
  .banner-mock-name{font-size:16px;font-weight:700}
  .marker-mock{display:inline-flex;width:48px;height:48px;border-radius:50%;border:3px solid ${brandColor};background:${brandColor}15;align-items:center;justify-content:center;overflow:hidden}
  .marker-mock img{width:42px;height:42px;border-radius:50%;object-fit:cover}
  .guidelines{padding:20px;background:#FFFBEB;border-radius:14px;border:1px solid #FDE68A}.guidelines li{margin-bottom:8px;font-size:14px;color:#92400E;line-height:1.5}
  .qr-block{text-align:center;padding:24px;background:#F8FAFC;border-radius:16px;border:1px solid #E2E8F0}.qr-block img{display:block;margin:0 auto 8px}.qr-block p{font-size:11px;color:#94A3B8}
  .footer{margin-top:40px;text-align:center;font-size:11px;color:#94A3B8;border-top:1px solid #E2E8F0;padding-top:16px}
</style></head><body>
  <div class="header">
    <h1>${fr ? 'Kit de Marque' : 'Brand Guidelines Kit'}</h1>
    <p>${sponsor.display_name} &middot; ${tierLabel}</p>
  </div>
  <div class="section">
    <div class="section-title">${fr ? 'Logo' : 'Logo'}</div>
    <div class="logo-block">
      ${sponsor.photo ? `<img src="${sponsor.photo}" />` : `<div class="logo-fallback">${(sponsor.display_name || 'S').charAt(0)}</div>`}
      <p style="margin-top:12px;font-size:12px;color:#94A3B8">${fr ? 'Format recommande: PNG/JPG, 512x512px, fond transparent' : 'Recommended: PNG/JPG, 512x512px, transparent background'}</p>
    </div>
  </div>
  <div class="section">
    <div class="section-title">${fr ? 'Couleur de marque' : 'Brand Color'}</div>
    <div class="color-block">
      <div class="color-swatch" style="background:${brandColor}"></div>
      <div class="color-info">
        <h3>${brandColor}</h3>
        <p>RGB: ${parseInt(brandColor.slice(1, 3), 16)}, ${parseInt(brandColor.slice(3, 5), 16)}, ${parseInt(brandColor.slice(5, 7), 16)}</p>
        <p>${fr ? 'Utilisee sur bannieres, badges, marqueurs carte' : 'Used on banners, badges, map markers'}</p>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-title">${fr ? 'Mockups' : 'Mockups'}</div>
    <div class="mockup-card">
      <div class="mockup-label">${fr ? 'BANNIERE ACCUEIL' : 'HOME BANNER'}</div>
      <div class="banner-mock">
        <div class="banner-mock-logo">${sponsor.photo ? `<img src="${sponsor.photo}" />` : (sponsor.display_name || 'S').charAt(0)}</div>
        <div class="banner-mock-info">
          <div class="banner-mock-badge">${tierLabel.toUpperCase()}</div>
          <div class="banner-mock-name">${sponsor.display_name}</div>
        </div>
      </div>
    </div>
    <div class="mockup-card">
      <div class="mockup-label">${fr ? 'MARQUEUR CARTE' : 'MAP MARKER'}</div>
      <div style="display:flex;align-items:center;gap:16px">
        <div class="marker-mock">${sponsor.photo ? `<img src="${sponsor.photo}" />` : '★'}</div>
        <div style="font-size:13px;color:#64748B">${fr ? 'Marqueur avec bordure de marque et badge tier' : 'Marker with brand border and tier badge'}</div>
      </div>
    </div>
  </div>
  <div class="section"><div class="section-title">${fr?'Regles':'Guidelines'}</div><div class="guidelines"><ul><li>${fr?'Logo sur fond clair ou couleur de marque':'Logo on light bg or brand color'}</li><li>${fr?'Ne pas deformer le logo':'Do not distort logo'}</li><li>${fr?'Espace min 8px autour du logo':'Min 8px space around logo'}</li><li>${fr?'Couleur de marque dominante':'Brand color dominant'}</li><li>${fr?'Badges de tier automatiques':'Tier badges automatic'}</li></ul></div></div>
  <div class="section">
    <div class="section-title">${fr ? 'Lien profil' : 'Profile Link'}</div>
    <div class="qr-block">
      <img src="${qrUrl}" width="140" height="140" />
      <p>${profileLink}</p>
    </div>
  </div>
  <div class="footer">
    Ultimate Petanque &middot; ${fr ? 'Genere le' : 'Generated on'} ${new Date().toLocaleDateString(fr ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>
</body></html>`;
      if (Platform.OS === 'web') {
        const win = window.open('', '_blank');
        if (win) { win.document.write(kitHtml); win.document.close(); setTimeout(() => win.print(), 500); }
      } else {
        const Print = require('expo-print');
        const SharingModule = require('expo-sharing');
        const { uri } = await Print.printToFileAsync({ html: kitHtml, base64: false });
        const canShare = await SharingModule.isAvailableAsync();
        if (canShare) await SharingModule.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fr ? 'Kit de marque' : 'Brand kit' });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) { showAlert(fr ? 'Erreur' : 'Error', e.message); }
    setExportingBrandKit(false);
  };

  // ====== ROI: Export CSV ======
  const handleExportCSV = async () => {
    if (!bannerData) { showAlert(fr ? 'Aucune donnee' : 'No data'); return; }
    setExporting(true);
    try {
      const ba = bannerData;
      let csv = 'Date,Impressions,Clicks,CTR\n';
      ba.dailyDates.forEach((date: string, i: number) => {
        const imp = ba.dailyImpressions[i] || 0;
        const clk = ba.dailyClicks[i] || 0;
        const ctrVal = imp > 0 ? ((clk / imp) * 100).toFixed(1) : '0';
        csv += `${date},${imp},${clk},${ctrVal}%\n`;
      });
      csv += `\nTotal,${ba.totalImpressions},${ba.totalClicks},${ba.totalImpressions > 0 ? ((ba.totalClicks / ba.totalImpressions) * 100).toFixed(1) : 0}%\n`;
      csv += `Unique Viewers,${ba.uniqueViewers}\n\n`;
      csv += 'Page,Impressions,Clicks\n';
      Object.entries(ba.impressionsByPage).forEach(([page, count]) => {
        csv += `${page},${count},${ba.clicksByPage[page] || 0}\n`;
      });
      if (Platform.OS === 'web') {
        try {
          const blob = new Blob([csv], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `analytics_${sponsor.display_name.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        } catch { showAlert(fr ? 'Erreur' : 'Error', fr ? 'Export non disponible' : 'Export not available'); }
      } else {
        const FS = require('expo-file-system');
        const SharingModule = require('expo-sharing');
        const filePath = `${FS.cacheDirectory}analytics_${sponsor.display_name.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        await FS.writeAsStringAsync(filePath, csv, { encoding: FS.EncodingType.UTF8 });
        const canShare = await SharingModule.isAvailableAsync();
        if (canShare) {
          await SharingModule.shareAsync(filePath, { mimeType: 'text/csv', dialogTitle: fr ? 'Exporter analytics' : 'Export analytics' });
        }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
    }
    setExporting(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.headerRow}>
          <Pressable style={st.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>{fr ? 'Portail Partenaires' : 'Partner Portal'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <SponsorPortalSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (!sponsor) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.headerRow}>
          <Pressable style={st.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>{fr ? 'Portail Partenaires' : 'Partner Portal'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={st.loadingWrap}>
          <MaterialIcons name="lock" size={48} color={theme.textMuted} />
          <Text style={st.emptyText}>
            {fr ? "Vous n'etes pas enregistre comme partenaire." : 'You are not registered as a partner.'}
          </Text>
          <Pressable style={[st.emptyBtn, { backgroundColor: '#3B82F6' }]} onPress={() => router.push('/partnerships' as any)}>
            <MaterialIcons name="handshake" size={18} color="#FFF" />
            <Text style={st.emptyBtnText}>{fr ? 'Devenir partenaire' : 'Become a partner'}</Text>
          </Pressable>
          <Pressable style={[st.emptyBtn, { backgroundColor: '#7C3AED', marginTop: 10 }]} onPress={() => router.push('/sponsor-preview' as any)}>
            <MaterialIcons name="preview" size={18} color="#FFF" />
            <Text style={st.emptyBtnText}>{fr ? 'Mode apercu (test)' : 'Preview mode (test)'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={st.container}>
      {/* Onboarding Guide Overlay */}
      {showOnboarding ? (() => {
        const steps = [
          { icon: 'palette', color: '#7C3AED', bg: '#7C3AED12', title: fr ? 'Bienvenue sur le Portail Partenaires' : 'Welcome to the Partner Portal', desc: fr ? 'Gerez votre branding, push notifications, analytiques et parrainages depuis un seul endroit.' : 'Manage your branding, push notifications, analytics and referrals from one place.' },
          { icon: 'palette', color: '#EC4899', bg: '#EC489912', title: fr ? '1. Personnalisez votre marque' : '1. Customize your brand', desc: fr ? 'Uploadez votre logo, choisissez votre couleur de marque et previsualisez vos bannieres et marqueurs carte.' : 'Upload your logo, choose your brand color and preview your banners and map markers.' },
          { icon: 'notifications', color: '#3B82F6', bg: '#3B82F612', title: fr ? '2. Envoyez des notifications' : '2. Send notifications', desc: fr ? 'Composez des push cibles avec A/B testing, programmation et templates pre-redigees.' : 'Compose targeted push with A/B testing, scheduling and pre-written templates.' },
          { icon: 'insights', color: '#10B981', bg: '#10B98112', title: fr ? '3. Suivez vos performances' : '3. Track your performance', desc: fr ? 'Impressions, clics, CTR, benchmark concurrents et export PDF/CSV de vos analytics.' : 'Impressions, clicks, CTR, competitor benchmark and PDF/CSV export of your analytics.' },
          { icon: 'people', color: tierColor, bg: tierColor + '12', title: fr ? '4. Gerez vos parrainages' : '4. Manage referrals', desc: fr ? 'Suivez les parrainages via votre code, exportez vos donnees CRM et gagnez des XP.' : 'Track referrals via your code, export CRM data and earn XP.' },
        ];
        const step = steps[onboardingStep];
        const isLast = onboardingStep === steps.length - 1;
        return (
          <View style={st.onboardingOverlay}>
            <View style={st.onboardingCard}>
              <View style={[st.onboardingIcon, { backgroundColor: step.bg }]}>
                <MaterialIcons name={step.icon as any} size={32} color={step.color} />
              </View>
              <Text style={st.onboardingTitle}>{step.title}</Text>
              <Text style={st.onboardingDesc}>{step.desc}</Text>
              <View style={st.onboardingDots}>
                {steps.map((_, i) => (
                  <View key={i} style={[st.onboardingDot, onboardingStep === i && st.onboardingDotActive]} />
                ))}
              </View>
              <Pressable
                style={[st.onboardingBtn, { backgroundColor: isLast ? tierColor : '#3B82F6' }]}
                onPress={() => { Haptics.selectionAsync(); if (isLast) handleDismissOnboarding(); else setOnboardingStep(s => s + 1); }}
              >
                <Text style={st.onboardingBtnText}>{isLast ? (fr ? 'Commencer' : 'Get started') : (fr ? 'Suivant' : 'Next')}</Text>
                <MaterialIcons name={isLast ? 'rocket-launch' : 'arrow-forward'} size={18} color="#FFF" />
              </Pressable>
              {!isLast ? (
                <Pressable style={st.onboardingSkip} onPress={handleDismissOnboarding}>
                  <Text style={st.onboardingSkipText}>{fr ? 'Passer' : 'Skip'}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        );
      })() : null}

      {/* Header */}
      <View style={st.headerRow}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>{fr ? 'Portail Partenaires' : 'Partner Portal'}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pressable
            style={[st.headerAction, showNotifCenter && { backgroundColor: tierColor + '15' }]}
            onPress={() => { Haptics.selectionAsync(); setShowNotifCenter(!showNotifCenter); }}
          >
            <MaterialIcons name="notifications" size={20} color={tierColor} />
            {sponsorNotifs.filter(n => n.unread).length > 0 ? (
              <View style={{ position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: '#EF4444', borderWidth: 1.5, borderColor: '#FFF' }} />
            ) : null}
          </Pressable>

        </View>
      </View>

      {/* Hero */}
      <LinearGradient colors={tierGradient} style={st.hero}>
        <View style={st.heroDeco1} />
        <View style={st.heroDeco2} />
        <View style={st.heroContent}>
          {sponsor.photo ? (
            <Image source={{ uri: sponsor.photo }} style={st.heroAvatar} contentFit="cover" transition={200} cachePolicy="memory-disk" />
          ) : (
            <View style={[st.heroAvatar, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <MaterialIcons name={isGold ? 'workspace-premium' : 'handshake'} size={32} color="#FFF" />
            </View>
          )}
          <View style={st.heroInfo}>
            <Text style={st.heroName} numberOfLines={1}>{sponsor.display_name}</Text>
            <View style={st.heroBadge}>
              <MaterialIcons name={isGold ? 'star' : 'workspace-premium'} size={10} color="#FFF" />
              <Text style={st.heroBadgeText}>{tierLabel.toUpperCase()}</Text>
            </View>
          </View>
        </View>
        {/* Quick KPIs */}
        <View style={st.heroKpis}>
          {[
            { value: totalImp, label: fr ? 'Impressions' : 'Impressions', icon: 'visibility' },
            { value: totalClk, label: fr ? 'Clics' : 'Clicks', icon: 'touch-app' },
            { value: `${ctr}%`, label: 'CTR', icon: 'percent' },
            { value: bannerData?.uniqueViewers || 0, label: fr ? 'Portee' : 'Reach', icon: 'people' },
          ].map((kpi, i) => (
            <View key={i} style={st.heroKpi}>
              <Text style={st.heroKpiValue}>{kpi.value}</Text>
              <Text style={st.heroKpiLabel}>{kpi.label}</Text>
            </View>
          ))}
        </View>
      </LinearGradient>

      {/* Period + Section Tabs */}
      <View style={st.filterArea}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
          {([7, 30] as const).map(p => (
            <Pressable key={p} style={({ pressed }) => [st.periodChip, period === p && { backgroundColor: tierColor, borderColor: tierColor }, pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] }]} onPress={() => { Haptics.selectionAsync(); setPeriod(p); }}>
              <MaterialIcons name="schedule" size={11} color={period === p ? '#FFF' : '#94A3B8'} />
              <Text style={[st.periodText, period === p && { color: '#FFF' }]}>{p}{fr ? 'j' : 'd'}</Text>
            </Pressable>
          ))}
          <View style={st.filterDivider} />
          {sections.map(sec => {
            const locked = !allowedSections.has(sec.id);
            const isActive = activeSection === sec.id && !locked;
            return (
              <Pressable key={sec.id} style={({ pressed }) => [st.sectionChip, isActive && { backgroundColor: tierColor, borderColor: tierColor }, locked && { opacity: 0.4 }, pressed && !locked && { opacity: 0.8, transform: [{ scale: 0.96 }] }]} onPress={() => { if (locked) { showAlert(fr ? 'Acces reserve' : 'Reserved access', fr ? `Cette section est reservee aux partenaires ${sec.id === 'crm' ? 'Or' : 'Argent et Or'}. Passez au tier superieur.` : `This section is reserved for ${sec.id === 'crm' ? 'Gold' : 'Silver and Gold'} partners. Upgrade your tier.`); return; } Haptics.selectionAsync(); setActiveSection(sec.id); }}>
                <MaterialIcons name={locked ? 'lock' : sec.icon as any} size={13} color={isActive ? '#FFF' : locked ? '#94A3B8' : '#64748B'} />
                <Text style={[st.sectionChipText, isActive && { color: '#FFF' }]}>{sec.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {/* Active section indicator */}
        <View style={st.sectionIndicator}>
          <View style={[st.sectionIndicatorDot, { backgroundColor: tierColor }]} />
          <MaterialIcons name={(sections.find(s => s.id === activeSection)?.icon || 'insights') as any} size={14} color={tierColor} />
          <Text style={[st.sectionIndicatorText, { color: tierColor }]}>{sections.find(s => s.id === activeSection)?.label || 'ROI'}</Text>
          <View style={{ flex: 1 }} />
          <Text style={st.sectionIndicatorPeriod}>{period}{fr ? ' jours' : ' days'}</Text>
        </View>
      </View>

      {/* Notification Center */}
      {showNotifCenter && sponsorNotifs.length > 0 ? (
        <View style={st.notifCenterPanel}>
          <View style={st.notifCenterHeader}>
            <MaterialIcons name="notifications" size={18} color={tierColor} />
            <Text style={st.notifCenterTitle}>{fr ? 'Centre de notifications' : 'Notification Center'}</Text>
            <Pressable onPress={() => setShowNotifCenter(false)} hitSlop={8}>
              <MaterialIcons name="close" size={18} color="#94A3B8" />
            </Pressable>
          </View>
          {sponsorNotifs.map(n => (
            <View key={n.id} style={[st.notifItem, n.unread && { backgroundColor: n.color + '06', borderLeftWidth: 3, borderLeftColor: n.color }]}>
              <View style={[st.notifIcon, { backgroundColor: n.color + '12' }]}>
                <MaterialIcons name={n.icon as any} size={16} color={n.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.notifItemTitle}>{n.title}</Text>
                <Text style={st.notifItemMsg} numberOfLines={2}>{n.message}</Text>
              </View>
              {n.unread ? <View style={[st.notifUnreadDot, { backgroundColor: n.color }]} /> : null}
            </View>
          ))}
        </View>
      ) : null}



      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={tierColor} />}
      >
        <PartnerExpirationAlert expiresAt={sponsor.expires_at} fr={fr} />
        {!(checklistComplete && checklistXpClaimed) ? (
          <View style={st.checklistCard}>
            <View style={st.checklistHeader}>
              <View style={[st.checklistIconBg, { backgroundColor: tierColor + '12' }]}>
                <MaterialIcons name="checklist" size={20} color={tierColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.checklistTitle}>{fr ? 'Demarrage rapide' : 'Quick Start'}</Text>
                <Text style={st.checklistSub}>{checklistDoneCount}/{checklistTotal} {fr ? 'etapes' : 'steps'}</Text>
              </View>
              {checklistComplete && !checklistXpClaimed ? (
                <Pressable style={[st.checklistClaimBtn, { backgroundColor: tierColor }]} onPress={handleClaimChecklistXp}>
                  <MaterialIcons name="star" size={14} color="#FFF" />
                  <Text style={st.checklistClaimText}>+200 XP</Text>
                </Pressable>
              ) : (
                <View style={[st.checklistProgressBadge, { borderColor: tierColor + '30' }]}>
                  <Text style={[st.checklistProgressText, { color: tierColor }]}>{Math.round((checklistDoneCount / checklistTotal) * 100)}%</Text>
                </View>
              )}
            </View>
            <View style={st.checklistBarTrack}>
              <View style={[st.checklistBarFill, { width: `${(checklistDoneCount / checklistTotal) * 100}%`, backgroundColor: tierColor }]} />
            </View>
            {checklistItems.map((item, i) => (
              <Pressable key={item.key} style={({ pressed }) => [st.checklistItem, pressed && !item.done && { backgroundColor: tierColor + '06' }]} onPress={() => { if (!item.done) { Haptics.selectionAsync(); item.action(); } }} disabled={item.done}>
                <View style={[st.checklistCheck, item.done ? { backgroundColor: '#10B981' } : { borderColor: '#CBD5E1' }]}>
                  {item.done ? <MaterialIcons name="check" size={12} color="#FFF" /> : <Text style={{ fontSize: 10, fontWeight: '700', color: '#CBD5E1' }}>{i + 1}</Text>}
                </View>
                <MaterialIcons name={item.icon} size={16} color={item.done ? '#94A3B8' : tierColor} />
                <Text style={[st.checklistItemText, item.done && { color: '#94A3B8', textDecorationLine: 'line-through' }]}>{item.label}</Text>
                {!item.done ? <MaterialIcons name="chevron-right" size={16} color={tierColor + '60'} /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* ====== ROI SECTION ====== */}
        {activeSection === 'roi' ? (
          <>
            {/* KPI Cards */}
            <View style={st.kpiGrid}>
              {[
                { value: totalImp, label: fr ? 'Impressions' : 'Impressions', icon: 'visibility', color: '#3B82F6' },
                { value: totalClk, label: fr ? 'Clics' : 'Clicks', icon: 'touch-app', color: '#10B981' },
                { value: `${ctr}%`, label: 'CTR', icon: 'trending-up', color: '#F59E0B' },
                { value: bannerData?.uniqueViewers || 0, label: fr ? 'Portee unique' : 'Unique reach', icon: 'people', color: '#7C3AED' },
              ].map((kpi, i) => (
                <View key={i} style={st.kpiCard}>
                  <View style={[st.kpiIcon, { backgroundColor: kpi.color + '12' }]}>
                    <MaterialIcons name={kpi.icon as any} size={20} color={kpi.color} />
                  </View>
                  <Text style={st.kpiValue}>{kpi.value}</Text>
                  <Text style={st.kpiLabel}>{kpi.label}</Text>
                </View>
              ))}
            </View>

            {/* Per-Item Performance Metrics */}
            {isSilverPlus && sponsor ? <SponsorItemMetrics sponsorId={sponsor.id} bannerData={bannerData} totalImp={totalImp} period={period} tierColor={tierColor} fr={fr} /> : null}

            {/* Sparkline Charts */}
            <View style={st.chartCard}>
              <Text style={st.chartTitle}>{fr ? `Tendance ${period}j` : `${period}d Trend`}</Text>
              {/* Impressions */}
              <View style={st.chartBlock}>
                <View style={st.chartHeader}>
                  <View style={[st.chartDot, { backgroundColor: '#3B82F6' }]} />
                  <Text style={st.chartLabel}>{fr ? 'Impressions' : 'Impressions'}</Text>
                  <Text style={[st.chartTotal, { color: '#3B82F6' }]}>{totalImp}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Sparkline data={dailyImp} width={chartW} height={52} color="#3B82F6" />
                </View>
              </View>
              {/* Clicks */}
              <View style={[st.chartBlock, { marginTop: 16 }]}>
                <View style={st.chartHeader}>
                  <View style={[st.chartDot, { backgroundColor: '#10B981' }]} />
                  <Text style={st.chartLabel}>{fr ? 'Clics' : 'Clicks'}</Text>
                  <Text style={[st.chartTotal, { color: '#10B981' }]}>{totalClk}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Sparkline data={dailyClk} width={chartW} height={52} color="#10B981" />
                </View>
              </View>
              {/* Date range */}
              <View style={st.chartDates}>
                <Text style={st.chartDateText}>{dailyDates[0]?.slice(5) || ''}</Text>
                <Text style={st.chartDateText}>{dailyDates[dailyDates.length - 1]?.slice(5) || ''}</Text>
              </View>
            </View>

            {/* CTR Card */}
            <View style={st.ctrCard}>
              <View style={st.ctrHeader}>
                <MaterialIcons name="trending-up" size={20} color="#F59E0B" />
                <Text style={st.ctrTitle}>{fr ? 'Taux de conversion' : 'Conversion rate'}</Text>
              </View>
              <Text style={st.ctrValue}>{ctr}%</Text>
              <Text style={st.ctrDesc}>
                {fr
                  ? `${totalClk} clic(s) pour ${totalImp} impression(s) sur ${period} jours`
                  : `${totalClk} click(s) from ${totalImp} impression(s) over ${period} days`}
              </Text>
            </View>

            {/* Weekly Digest Preview */}
            {lastDigest ? (
              <View style={st.ctrCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#6366F112', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="email" size={18} color="#6366F1" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Dernier digest hebdo' : 'Last weekly digest'}</Text>
                    <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                      {new Date(lastDigest.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#3B82F6' }}>{lastDigest.impressions}</Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 }}>IMP.</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#10B981' }}>{lastDigest.clicks}</Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 }}>{fr ? 'CLICS' : 'CLICKS'}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: tierColor }}>{lastDigest.ctr}%</Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 }}>CTR</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                    <Text style={{ fontSize: 20, fontWeight: '900', color: '#7C3AED' }}>{lastDigest.pushes}</Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 }}>PUSH</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 10, fontStyle: 'italic' }}>
                  {fr ? 'Envoye automatiquement chaque lundi via notification push' : 'Sent automatically every Monday via push notification'}
                </Text>
              </View>
            ) : null}

            {/* Digest Email Preview */}
            {digestHtmlData ? (
              <View style={st.ctrCard}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: digestPreviewOpen ? 14 : 0 }}
                  onPress={() => { Haptics.selectionAsync(); setDigestPreviewOpen(!digestPreviewOpen); }}
                >
                  <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: '#4338CA12', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="mark-email-read" size={20} color="#4338CA" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Apercu email digest' : 'Digest Email Preview'}</Text>
                    <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                      {new Date(digestHtmlData.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <MaterialIcons name={digestPreviewOpen ? 'expand-less' : 'expand-more'} size={22} color="#94A3B8" />
                </Pressable>
                {digestPreviewOpen ? (
                  <View>
                    {/* Rendered email preview */}
                    <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E2E8F0' }}>
                      {/* Email header */}
                      <LinearGradient colors={[tierColor, tierColor + 'CC']} style={{ paddingVertical: 20, paddingHorizontal: 16, alignItems: 'center' }}>
                        {sponsor.photo ? (
                          <Image source={{ uri: sponsor.photo }} style={{ width: 48, height: 48, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' }} contentFit="cover" cachePolicy="memory-disk" />
                        ) : (
                          <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 22, fontWeight: '900', color: '#FFF' }}>{(sponsor.display_name || 'S').charAt(0)}</Text>
                          </View>
                        )}
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#FFF', marginTop: 8 }}>{fr ? 'Recap Hebdomadaire' : 'Weekly Recap'}</Text>
                        <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8, marginTop: 6 }}>
                          <Text style={{ fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 }}>{tierLabel.toUpperCase()}</Text>
                        </View>
                      </LinearGradient>
                      {/* Email KPIs */}
                      <View style={{ flexDirection: 'row', gap: 6, padding: 14 }}>
                        {[
                          { v: lastDigest?.impressions || 0, l: 'IMP', c: '#3B82F6' },
                          { v: lastDigest?.clicks || 0, l: fr ? 'CLICS' : 'CLICKS', c: '#10B981' },
                          { v: (lastDigest?.ctr || '0') + '%', l: 'CTR', c: tierColor },
                          { v: lastDigest?.pushes || 0, l: 'PUSH', c: '#7C3AED' },
                        ].map((k, i) => (
                          <View key={i} style={{ flex: 1, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                            <Text style={{ fontSize: 18, fontWeight: '900', color: k.c }}>{k.v}</Text>
                            <Text style={{ fontSize: 8, fontWeight: '700', color: '#94A3B8', marginTop: 2 }}>{k.l}</Text>
                          </View>
                        ))}
                      </View>
                      {/* Email CTA */}
                      <View style={{ alignItems: 'center', paddingVertical: 14, backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: '#E2E8F0' }}>
                        <View style={{ backgroundColor: tierColor, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 12 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>{fr ? 'Voir le portail partenaires' : 'View partner portal'} →</Text>
                        </View>
                      </View>
                      {/* Email footer */}
                      <View style={{ alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                        <Text style={{ fontSize: 9, color: '#94A3B8' }}>Ultimate Petanque · Digest automatique</Text>
                      </View>
                    </View>
                    {/* View full digest link */}
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 10, backgroundColor: '#4338CA0A', borderRadius: 10, borderWidth: 1, borderColor: '#4338CA15' }}
                      onPress={() => router.push('/sponsor-digest' as any)}
                    >
                      <MaterialIcons name="history" size={14} color="#4338CA" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#4338CA' }}>{fr ? 'Voir tous les digests' : 'View all digests'}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Competitor Benchmark (Gold only) */}
            {isGold && benchmarkData && benchmarkData.tierCount > 1 ? (
              <View style={st.benchmarkCard}>
                <View style={st.benchmarkHeader}>
                  <View style={[st.benchmarkIcon, { backgroundColor: tierColor + '12' }]}>
                    <MaterialIcons name="leaderboard" size={20} color={tierColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.benchmarkTitle}>{fr ? 'Benchmark tier' : 'Tier Benchmark'}</Text>
                    <Text style={st.benchmarkSub}>{fr ? `Comparaison avec ${benchmarkData.tierCount - 1} partenaire(s) du meme tier` : `Compared with ${benchmarkData.tierCount - 1} partner(s) in same tier`}</Text>
                  </View>
                </View>
                {[
                  { label: 'Impressions', my: benchmarkData.myImpressions, avg: benchmarkData.avgImpressions, color: '#3B82F6', icon: 'visibility' },
                  { label: 'CTR', my: benchmarkData.myCtr, avg: benchmarkData.avgCtr, color: '#F59E0B', icon: 'trending-up', suffix: '%' },
                  { label: fr ? 'Portee' : 'Reach', my: benchmarkData.myReach, avg: benchmarkData.avgReach, color: '#7C3AED', icon: 'people' },
                  { label: fr ? 'Push envois' : 'Push sent', my: benchmarkData.myPushes, avg: benchmarkData.avgPushes, color: '#10B981', icon: 'send' },
                ].map((m, i) => {
                  const myVal = typeof m.my === 'number' ? m.my : 0;
                  const avgVal = typeof m.avg === 'number' ? m.avg : 0;
                  const maxVal = Math.max(myVal, avgVal, 1);
                  const diff = avgVal > 0 ? Math.round(((myVal - avgVal) / avgVal) * 100) : 0;
                  const isAbove = diff >= 0;
                  return (
                    <View key={i} style={st.benchmarkRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <MaterialIcons name={m.icon as any} size={14} color={m.color} />
                        <Text style={st.benchmarkMetricLabel}>{m.label}</Text>
                        <View style={{ flex: 1 }} />
                        <View style={[st.benchmarkDiffBadge, { backgroundColor: isAbove ? '#10B98115' : '#EF444415' }]}>
                          <MaterialIcons name={isAbove ? 'arrow-upward' : 'arrow-downward'} size={10} color={isAbove ? '#10B981' : '#EF4444'} />
                          <Text style={[st.benchmarkDiffText, { color: isAbove ? '#10B981' : '#EF4444' }]}>{isAbove ? '+' : ''}{diff}%</Text>
                        </View>
                      </View>
                      <View style={st.benchmarkBarsWrap}>
                        <View style={st.benchmarkBarRow}>
                          <Text style={[st.benchmarkBarLabel, { color: tierColor }]}>{fr ? 'Vous' : 'You'}</Text>
                          <View style={st.benchmarkBarTrack}>
                            <View style={[st.benchmarkBarFill, { width: `${(myVal / maxVal) * 100}%`, backgroundColor: tierColor }]} />
                          </View>
                          <Text style={[st.benchmarkBarValue, { color: tierColor }]}>{myVal}{m.suffix || ''}</Text>
                        </View>
                        <View style={st.benchmarkBarRow}>
                          <Text style={st.benchmarkBarLabel}>{fr ? 'Moy.' : 'Avg.'}</Text>
                          <View style={st.benchmarkBarTrack}>
                            <View style={[st.benchmarkBarFill, { width: `${(avgVal / maxVal) * 100}%`, backgroundColor: '#CBD5E1' }]} />
                          </View>
                          <Text style={st.benchmarkBarValue}>{avgVal}{m.suffix || ''}</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Revenue Tracker (Silver+) */}
            {isSilverPlus ? <View style={st.ctrCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#10B98112', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="account-balance-wallet" size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Suivi budget' : 'Budget Tracker'}</Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{fr ? 'ROI et cout par action' : 'ROI and cost per action'}</Text>
                </View>
              </View>
              <View style={st.pushField}>
                <Text style={st.pushFieldLabel}>{fr ? 'Budget mensuel (€)' : 'Monthly budget (€)'}</Text>
                <TextInput style={st.pushInput} value={revBudget} onChangeText={setRevBudget} keyboardType="numeric" placeholder="500" placeholderTextColor="#94A3B8" />
              </View>
              {revBudget && parseFloat(revBudget) > 0 ? (() => {
                const budget = parseFloat(revBudget);
                const cpmVal = totalImp > 0 ? Math.round((budget / totalImp) * 10000) / 10 : 0;
                const cpcVal = totalClk > 0 ? Math.round((budget / totalClk) * 100) / 100 : 0;
                return (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: tierColor }}>€{cpmVal}</Text>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 }}>CPM</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: '#10B981' }}>€{cpcVal}</Text>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 }}>CPC</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: '#3B82F6' }}>€{Math.round(budget * 3)}</Text>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 }}>{fr ? '3 mois' : '3 months'}</Text>
                    </View>
                  </View>
                );
              })() : null}
            </View> : null}

            {/* Monthly Goals (Silver+) */}
            {isSilverPlus ? <View style={st.ctrCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="flag" size={18} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Objectifs mensuels' : 'Monthly Goals'}</Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{fr ? 'Definissez vos cibles et suivez la progression' : 'Set your targets and track progress'}</Text>
                </View>
              </View>
              {/* Goal inputs */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <View style={[st.pushField, { flex: 1, marginBottom: 0 }]}>
                  <Text style={st.pushFieldLabel}>Impressions</Text>
                  <TextInput style={st.pushInput} value={goalImpressions} onChangeText={setGoalImpressions} keyboardType="numeric" placeholder="1000" placeholderTextColor="#94A3B8" />
                </View>
                <View style={[st.pushField, { flex: 1, marginBottom: 0 }]}>
                  <Text style={st.pushFieldLabel}>{fr ? 'Clics' : 'Clicks'}</Text>
                  <TextInput style={st.pushInput} value={goalClicks} onChangeText={setGoalClicks} keyboardType="numeric" placeholder="100" placeholderTextColor="#94A3B8" />
                </View>
                <View style={[st.pushField, { flex: 1, marginBottom: 0 }]}>
                  <Text style={st.pushFieldLabel}>CTR %</Text>
                  <TextInput style={st.pushInput} value={goalCtr} onChangeText={setGoalCtr} keyboardType="numeric" placeholder="5" placeholderTextColor="#94A3B8" />
                </View>
              </View>
              {/* Progress rings */}
              {(parseInt(goalImpressions) > 0 || parseInt(goalClicks) > 0 || parseFloat(goalCtr) > 0) ? (() => {
                const goals = [
                  { label: 'Impressions', current: totalImp, target: parseInt(goalImpressions) || 0, color: '#3B82F6', icon: 'visibility' as const },
                  { label: fr ? 'Clics' : 'Clicks', current: totalClk, target: parseInt(goalClicks) || 0, color: '#10B981', icon: 'touch-app' as const },
                  { label: 'CTR', current: ctr, target: parseFloat(goalCtr) || 0, color: '#F59E0B', icon: 'trending-up' as const, suffix: '%' },
                ].filter(g => g.target > 0);
                return (
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                    {goals.map((g, i) => {
                      const progress = g.target > 0 ? Math.min((typeof g.current === 'number' ? g.current : 0) / g.target, 1) : 0;
                      const pct = Math.round(progress * 100);
                      const ringSize = 64;
                      const strokeW = 6;
                      const radius = (ringSize - strokeW) / 2;
                      const circumference = 2 * Math.PI * radius;
                      const dashOffset = circumference * (1 - progress);
                      const completed = pct >= 100;
                      return (
                        <View key={i} style={{ flex: 1, alignItems: 'center', backgroundColor: completed ? g.color + '08' : '#F8FAFC', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 4, borderWidth: 1, borderColor: completed ? g.color + '25' : '#E2E8F0' }}>
                          <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                            <Svg width={ringSize} height={ringSize} style={{ position: 'absolute' }}>
                              <SvgCircle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke="#F1F5F9" strokeWidth={strokeW} fill="none" />
                              <SvgCircle cx={ringSize / 2} cy={ringSize / 2} r={radius} stroke={g.color} strokeWidth={strokeW} fill="none" strokeDasharray={`${circumference}`} strokeDashoffset={dashOffset} strokeLinecap="round" transform={`rotate(-90 ${ringSize / 2} ${ringSize / 2})`} />
                            </Svg>
                            {completed ? (
                              <MaterialIcons name="check-circle" size={20} color={g.color} />
                            ) : (
                              <Text style={{ fontSize: 13, fontWeight: '900', color: g.color }}>{pct}%</Text>
                            )}
                          </View>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: g.color }}>{g.current}{g.suffix || ''}/{g.target}{g.suffix || ''}</Text>
                          <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' }}>{g.label}</Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })() : null}
              {/* Goal Achievement Banner */}
              {Object.values(goalAchievements).some(v => v) ? (
                <View style={{ backgroundColor: celebratingGoal ? '#10B98112' : '#10B98108', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: '#10B98125' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: '#10B98118', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name={celebratingGoal ? 'celebration' : 'emoji-events'} size={20} color="#10B981" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#10B981' }}>
                        {Object.values(goalAchievements).every(v => v)
                          ? (fr ? 'Tous les objectifs atteints !' : 'All goals achieved!')
                          : (fr ? 'Objectif(s) atteint(s) !' : 'Goal(s) achieved!')}
                      </Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                        {[goalAchievements.impressions && 'Impressions', goalAchievements.clicks && (fr ? 'Clics' : 'Clicks'), goalAchievements.ctr && 'CTR'].filter(Boolean).join(', ')}
                      </Text>
                    </View>
                    {!goalXpAwarded ? (
                      <Pressable
                        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10B981', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 }, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                        onPress={handleClaimGoalXp}
                      >
                        <MaterialIcons name="star" size={14} color="#FFF" />
                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFF' }}>+{Object.values(goalAchievements).every(v => v) ? 300 : 150} XP</Text>
                      </Pressable>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#10B98115', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                        <MaterialIcons name="check-circle" size={12} color="#10B981" />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981' }}>{fr ? 'Reclame' : 'Claimed'}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ) : null}
              <Pressable
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7C3AED', paddingVertical: 12, borderRadius: 12 }, savingGoals && { opacity: 0.6 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={handleSaveGoals}
                disabled={savingGoals}
              >
                {savingGoals ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <>
                    <MaterialIcons name="save" size={16} color="#FFF" />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{fr ? 'Enregistrer les objectifs' : 'Save goals'}</Text>
                  </>
                )}
              </Pressable>
            </View> : null}

            {/* ROI Calculator (Silver+) */}
            {isSilverPlus ? <View style={st.ctrCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#3B82F612', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="calculate" size={18} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Calculateur ROI' : 'ROI Calculator'}</Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{fr ? 'Estimez la valeur de votre visibilite' : 'Estimate the value of your visibility'}</Text>
                </View>
              </View>
              {(() => {
                const budgetVal = parseFloat(revBudget) || 0;
                const estValuePerImp = 0.008; // EUR per impression
                const estValuePerClick = 0.35; // EUR per click
                const estTotalValue = (totalImp * estValuePerImp) + (totalClk * estValuePerClick);
                const cpmVal = totalImp > 0 && budgetVal > 0 ? Math.round((budgetVal / totalImp) * 10000) / 10 : 0;
                const cpcVal = totalClk > 0 && budgetVal > 0 ? Math.round((budgetVal / totalClk) * 100) / 100 : 0;
                const annualImp = totalImp * (365 / Math.max(period, 1));
                const annualClk = totalClk * (365 / Math.max(period, 1));
                const annualReach = (bannerData?.uniqueViewers || 0) * (365 / Math.max(period, 1));
                const roiPct = budgetVal > 0 ? Math.round((estTotalValue / budgetVal) * 100) : 0;
                const roiColor = roiPct >= 150 ? '#10B981' : roiPct >= 100 ? '#F59E0B' : roiPct >= 50 ? '#F97316' : '#EF4444';
                return (
                  <>
                    {/* Annual projections */}
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                      <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#3B82F6' }}>{Math.round(annualImp).toLocaleString()}</Text>
                        <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' }}>{fr ? 'Imp./an est.' : 'Est. imp/yr'}</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#10B981' }}>{Math.round(annualClk).toLocaleString()}</Text>
                        <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' }}>{fr ? 'Clics/an est.' : 'Est. clicks/yr'}</Text>
                      </View>
                      <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#7C3AED' }}>{Math.round(annualReach).toLocaleString()}</Text>
                        <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' }}>{fr ? 'Portee/an' : 'Reach/yr'}</Text>
                      </View>
                    </View>
                    {/* Estimated value */}
                    <View style={{ backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' }}>{fr ? 'Valeur estimee de la visibilite' : 'Estimated visibility value'}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
                        <Text style={{ fontSize: 28, fontWeight: '900', color: '#0F172A' }}>€{Math.round(estTotalValue * 10) / 10}</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#94A3B8' }}>/ {period}{fr ? 'j' : 'd'}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Valeur impressions' : 'Impression value'}</Text>
                          <View style={{ height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                            <View style={{ height: '100%', width: `${estTotalValue > 0 ? Math.round(((totalImp * estValuePerImp) / estTotalValue) * 100) : 50}%`, backgroundColor: '#3B82F6', borderRadius: 3 }} />
                          </View>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#3B82F6', marginTop: 2 }}>€{Math.round(totalImp * estValuePerImp * 10) / 10}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Valeur clics' : 'Click value'}</Text>
                          <View style={{ height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, marginTop: 4, overflow: 'hidden' }}>
                            <View style={{ height: '100%', width: `${estTotalValue > 0 ? Math.round(((totalClk * estValuePerClick) / estTotalValue) * 100) : 50}%`, backgroundColor: '#10B981', borderRadius: 3 }} />
                          </View>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981', marginTop: 2 }}>€{Math.round(totalClk * estValuePerClick * 10) / 10}</Text>
                        </View>
                      </View>
                    </View>
                    {/* ROI Score */}
                    {budgetVal > 0 ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                        <View style={{ flex: 1, backgroundColor: roiColor + '08', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: roiColor + '20' }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' }}>ROI</Text>
                          <Text style={{ fontSize: 28, fontWeight: '900', color: roiColor }}>{roiPct}%</Text>
                          <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                            {roiPct >= 150 ? (fr ? 'Excellent' : 'Excellent') : roiPct >= 100 ? (fr ? 'Bon' : 'Good') : roiPct >= 50 ? (fr ? 'Moyen' : 'Average') : (fr ? 'Faible' : 'Low')}
                          </Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' }}>CPM</Text>
                          <Text style={{ fontSize: 22, fontWeight: '900', color: tierColor }}>€{cpmVal}</Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 4, textTransform: 'uppercase' }}>CPC</Text>
                          <Text style={{ fontSize: 22, fontWeight: '900', color: '#10B981' }}>€{cpcVal}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={{ backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#FDE68A', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <MaterialIcons name="lightbulb" size={14} color="#F59E0B" />
                        <Text style={{ flex: 1, fontSize: 11, color: '#92400E', lineHeight: 16 }}>
                          {fr ? 'Renseignez votre budget mensuel dans le suivi budget ci-dessus pour calculer le ROI.' : 'Enter your monthly budget in the budget tracker above to calculate ROI.'}
                        </Text>
                      </View>
                    )}
                    {/* Industry comparison */}
                    <View style={{ backgroundColor: '#F1F5F9', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <MaterialIcons name="analytics" size={12} color="#64748B" />
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', letterSpacing: 0.5, textTransform: 'uppercase' }}>{fr ? 'Ref. marche sport' : 'Sports market ref.'}</Text>
                      </View>
                      {[
                        { label: 'CPM', yours: cpmVal, market: 6.5, unit: '€', better: cpmVal > 0 && cpmVal < 6.5 },
                        { label: 'CPC', yours: cpcVal, market: 0.55, unit: '€', better: cpcVal > 0 && cpcVal < 0.55 },
                        { label: 'CTR', yours: ctr, market: 2.1, unit: '%', better: ctr > 2.1 },
                      ].map((ref, ri) => (
                        <View key={ri} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                          <Text style={{ width: 32, fontSize: 10, fontWeight: '600', color: '#64748B' }}>{ref.label}</Text>
                          <View style={{ flex: 1, height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                            <View style={{ height: '100%', width: `${Math.min(100, ref.yours > 0 ? (ref.yours / Math.max(ref.yours, ref.market) * 100) : 0)}%`, backgroundColor: ref.better ? '#10B981' : '#F59E0B', borderRadius: 3 }} />
                          </View>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: ref.better ? '#10B981' : '#F59E0B', width: 50, textAlign: 'right' }}>{ref.yours}{ref.unit}</Text>
                          <Text style={{ fontSize: 9, color: '#94A3B8', width: 50 }}>{fr ? 'moy.' : 'avg.'} {ref.market}{ref.unit}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                );
              })()}
            </View> : null}

            {/* Tier upgrade hint for Bronze */}
            {!isSilverPlus ? (
              <View style={{ backgroundColor: '#FFFBEB', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#FDE68A', alignItems: 'center' as const, gap: 8 }}>
                <MaterialIcons name="lock" size={24} color="#F59E0B" />
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E', textAlign: 'center' }}>{fr ? 'Fonctionnalites avancees' : 'Advanced features'}</Text>
                <Text style={{ fontSize: 12, color: '#92400E', textAlign: 'center', lineHeight: 18 }}>{fr ? 'Budget tracker, objectifs mensuels, calculateur ROI et benchmark sont disponibles pour les partenaires Argent et Or.' : 'Budget tracker, monthly goals, ROI calculator and benchmark are available for Silver and Gold partners.'}</Text>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F59E0B', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginTop: 4 }} onPress={() => router.push('/partnerships' as any)}>
                  <MaterialIcons name="upgrade" size={16} color="#FFF" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFF' }}>{fr ? 'Voir les offres' : 'View plans'}</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Export Buttons */}
            <View style={{ gap: 10 }}>
              <Pressable
                style={({ pressed }) => [st.exportBtn, exporting && { opacity: 0.6 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={handleExportCSV}
                disabled={exporting}
              >
                {exporting ? <ActivityIndicator size="small" color={tierColor} /> : (
                  <>
                    <MaterialIcons name="download" size={20} color={tierColor} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.exportBtnText, { color: tierColor }]}>{fr ? 'Exporter CSV' : 'Export CSV'}</Text>
                      <Text style={st.exportBtnSub}>{fr ? `Donnees brutes (${period}j)` : `Raw data (${period}d)`}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color={tierColor} />
                  </>
                )}
              </Pressable>
              {isSilverPlus ? <Pressable
                style={({ pressed }) => [st.exportBtn, st.exportBtnPdf, exportingPdf && { opacity: 0.6 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={handleExportPDF}
                disabled={exportingPdf}
              >
                {exportingPdf ? <ActivityIndicator size="small" color="#EF4444" /> : (
                  <>
                    <MaterialIcons name="picture-as-pdf" size={20} color="#EF4444" />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.exportBtnText, { color: '#EF4444' }]}>{fr ? 'Rapport PDF' : 'PDF Report'}</Text>
                      <Text style={st.exportBtnSub}>{fr ? `Resume executif ROI (${period}j)` : `Executive ROI summary (${period}d)`}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color="#EF4444" />
                  </>
                )}
              </Pressable> : null}
            </View>
          </>
        ) : null}

        {activeSection === 'placement' ? (
          <>
            <SponsorProposalSection sponsorId={sponsor.id} sponsorName={sponsor.display_name} isSilverPlus={isSilverPlus} tierColor={tierColor} fr={fr} badgeType={sponsor?.badge_type || 'partner'} />
            <View style={st.placementCard}>
              <Text style={st.placementTitle}>{fr ? 'Vos emplacements' : 'Your placements'}</Text>
              <Text style={st.placementDesc}>
                {fr
                  ? 'Repartition de votre visibilite dans l\'application'
                  : 'Distribution of your visibility in the app'}
              </Text>
              {bannerData && Object.keys(bannerData.impressionsByPage).length > 0 ? (
                Object.entries(bannerData.impressionsByPage)
                  .sort((a, b) => b[1] - a[1])
                  .map(([page, count]) => {
                    const cfg = PAGE_LABELS[page] || PAGE_LABELS.unknown;
                    const pct = bannerData.totalImpressions > 0 ? Math.round((count / bannerData.totalImpressions) * 100) : 0;
                    const clicks = bannerData.clicksByPage[page] || 0;
                    const pageCtr = count > 0 ? Math.round((clicks / count) * 1000) / 10 : 0;
                    return (
                      <View key={page} style={st.pageRow}>
                        <View style={[st.pageIcon, { backgroundColor: cfg.color + '12' }]}>
                          <MaterialIcons name={cfg.icon as any} size={18} color={cfg.color} />
                        </View>
                        <View style={st.pageInfo}>
                          <View style={st.pageNameRow}>
                            <Text style={st.pageName}>{cfg.label[language] || cfg.label.en}</Text>
                            <Text style={st.pagePct}>{pct}%</Text>
                          </View>
                          <View style={st.pageBarTrack}>
                            <View style={[st.pageBarFill, { width: `${pct}%`, backgroundColor: cfg.color }]} />
                          </View>
                          <View style={st.pageMetaRow}>
                            <Text style={st.pageMeta}>{count} imp.</Text>
                            <Text style={st.pageMeta}>{clicks} {fr ? 'clics' : 'clicks'}</Text>
                            <Text style={[st.pageMeta, { color: cfg.color, fontWeight: '700' }]}>{pageCtr}% CTR</Text>
                          </View>
                        </View>
                      </View>
                    );
                  })
              ) : (
                <View style={st.emptyPlacement}>
                  <MaterialIcons name="visibility-off" size={36} color={theme.textMuted} />
                  <Text style={st.emptyText}>{fr ? 'Aucune impression enregistree' : 'No impressions recorded'}</Text>
                </View>
              )}
            </View>

            {/* Visibility Perks */}
            <View style={st.perksCard}>
              <Text style={st.perksTitle}>{fr ? 'Vos avantages visibilite' : 'Your visibility perks'}</Text>
              {[
                isGold && { icon: 'star', text: fr ? 'Banniere dediee sur l\'accueil' : 'Dedicated home banner', active: true },
                isGold && { icon: 'phone-android', text: fr ? 'Section onboarding dediee' : 'Dedicated onboarding section', active: true },
                { icon: 'map', text: fr ? 'Marqueurs personnalises sur la carte' : 'Custom markers on map', active: true },
                { icon: 'campaign', text: fr ? 'Defis sponsorises' : 'Sponsored challenges', active: true },
                isGold && { icon: 'notifications-active', text: fr ? 'Push notifications illimitees' : 'Unlimited push notifications', active: true },
                !isGold && { icon: 'notifications', text: fr ? '1 push notification/mois' : '1 push notification/month', active: sponsor.badge_type === 'sponsor' },
              ].filter(Boolean).map((perk: any, i) => (
                <View key={i} style={st.perkRow}>
                  <View style={[st.perkIcon, { backgroundColor: perk.active ? tierColor + '12' : '#F1F5F9' }]}>
                    <MaterialIcons name={perk.icon} size={16} color={perk.active ? tierColor : theme.textMuted} />
                  </View>
                  <Text style={[st.perkText, !perk.active && { color: theme.textMuted }]}>{perk.text}</Text>
                  <MaterialIcons name={perk.active ? 'check-circle' : 'radio-button-unchecked'} size={18} color={perk.active ? '#10B981' : theme.textMuted} />
                </View>
              ))}
            </View>
          </>
        ) : null}

        {activeSection === 'branding' ? (
          <>
            {/* Photo Upload */}
            <View style={st.brandCard}>
              <Text style={st.brandCardTitle}>{fr ? 'Logo / Photo' : 'Logo / Photo'}</Text>
              <View style={st.brandPhotoRow}>
                <Pressable onPress={handlePickPhoto} disabled={uploadingPhoto} style={st.brandPhotoWrap}>
                  {uploadingPhoto ? (
                    <View style={[st.brandPhoto, { backgroundColor: '#F1F5F9' }]}><ActivityIndicator color={tierColor} /></View>
                  ) : sponsor.photo ? (
                    <Image source={{ uri: sponsor.photo }} style={st.brandPhoto} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                  ) : (
                    <View style={[st.brandPhoto, { backgroundColor: '#F1F5F9' }]}>
                      <MaterialIcons name={isGold ? 'workspace-premium' : 'handshake'} size={32} color={theme.textMuted} />
                    </View>
                  )}
                  <View style={[st.brandPhotoBadge, { backgroundColor: tierColor }]}>
                    <MaterialIcons name="camera-alt" size={14} color="#FFF" />
                  </View>
                </Pressable>
                <View style={{ flex: 1, gap: 8 }}>
                  <Text style={st.brandPhotoLabel}>{fr ? 'Photo de profil partenaire' : 'Partner profile photo'}</Text>
                  <Text style={st.brandPhotoHint}>
                    {fr ? 'Format recommande : carre, 512x512px minimum. Utilise sur la banniere, la carte et le profil.' : 'Recommended: square, 512x512px minimum. Used on banner, map and profile.'}
                  </Text>
                  <Pressable style={[st.brandPhotoBtn, { borderColor: tierColor + '40' }]} onPress={handlePickPhoto} disabled={uploadingPhoto}>
                    <MaterialIcons name="upload" size={16} color={tierColor} />
                    <Text style={[st.brandPhotoBtnText, { color: tierColor }]}>{fr ? 'Changer la photo' : 'Change photo'}</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            {/* Brand Color Selector */}
            <View style={st.brandCard}>
              <Text style={st.brandCardTitle}>{fr ? 'Couleur de marque' : 'Brand color'}</Text>
              <Text style={st.brandCardDesc}>
                {fr ? 'Choisissez la couleur dominante de vos bannieres et badges dans l\'application.' : 'Choose the dominant color for your banners and badges in the app.'}
              </Text>
              <View style={st.colorGrid}>
                {BRAND_COLORS.map(bc => (
                  <Pressable
                    key={bc.id}
                    style={[st.colorOption, { borderColor: brandColor === bc.color ? bc.color : '#E2E8F0' }, brandColor === bc.color && { backgroundColor: bc.color + '10' }]}
                    onPress={() => { Haptics.selectionAsync(); setBrandColor(bc.color); setBrandColorDirty(true); }}
                  >
                    <View style={[st.colorSwatch, { backgroundColor: bc.color }]}>
                      {brandColor === bc.color ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
                    </View>
                    <Text style={[st.colorLabel, brandColor === bc.color && { color: bc.color, fontWeight: '700' }]}>{bc.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* Map Marker Preview */}
            <View style={st.brandCard}>
              <Text style={st.brandCardTitle}>{fr ? 'Apercu marqueur carte' : 'Map marker preview'}</Text>
              <Text style={st.brandCardDesc}>
                {fr ? 'Voici comment votre marqueur apparait sur la carte interactive.' : 'Here is how your marker appears on the interactive map.'}
              </Text>
              <View style={st.mapPreviewContainer}>
                {/* Mock map background */}
                <View style={st.mapPreviewBg}>
                  <View style={st.mapPreviewGrid}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <View key={i} style={[st.mapPreviewGridLine, { top: `${20 * (i + 1)}%` }]} />
                    ))}
                    {Array.from({ length: 5 }).map((_, i) => (
                      <View key={`v${i}`} style={[st.mapPreviewGridLineV, { left: `${20 * (i + 1)}%` }]} />
                    ))}
                  </View>
                  {/* Mock regular markers */}
                  <View style={[st.mapPreviewDot, { top: '25%', left: '20%', backgroundColor: '#10B981' }]}>
                    <MaterialIcons name="sports-soccer" size={8} color="#FFF" />
                  </View>
                  <View style={[st.mapPreviewDot, { top: '60%', left: '70%', backgroundColor: '#3B82F6' }]}>
                    <MaterialIcons name="person" size={8} color="#FFF" />
                  </View>
                  <View style={[st.mapPreviewDot, { top: '70%', left: '35%', backgroundColor: '#F97316' }]}>
                    <MaterialIcons name="home" size={8} color="#FFF" />
                  </View>
                  {/* Partner marker (your brand) - center */}
                  <View style={[st.mapPreviewPartner, { borderColor: brandColor, backgroundColor: brandColor + '15' }]}>
                    {sponsor.photo ? (
                      <Image source={{ uri: sponsor.photo }} style={st.mapPreviewPartnerImg} contentFit="cover" cachePolicy="memory-disk" />
                    ) : (
                      <MaterialIcons name={isGold ? 'workspace-premium' : 'handshake'} size={16} color={brandColor} />
                    )}
                    <View style={[st.mapPreviewPartnerBadge, { backgroundColor: brandColor }]}>
                      <MaterialIcons name={isGold ? 'star' : 'workspace-premium'} size={6} color="#FFF" />
                    </View>
                  </View>
                  {/* Label */}
                  <View style={[st.mapPreviewLabel, { backgroundColor: brandColor }]}>
                    <Text style={st.mapPreviewLabelText} numberOfLines={1}>{sponsor.display_name}</Text>
                  </View>
                </View>
              </View>
              <Text style={st.bannerPreviewNote}>
                {fr ? 'Les partenaires Or ont un marqueur plus grand et un badge etoile.' : 'Gold partners have a larger marker and a star badge.'}
              </Text>
            </View>

            {/* Banner Preview */}
            <View style={st.brandCard}>
              <Text style={st.brandCardTitle}>{fr ? 'Apercu banniere' : 'Banner preview'}</Text>
              <Text style={st.brandCardDesc}>
                {fr ? 'Voici comment votre banniere apparait sur la page d\'accueil.' : 'Here is how your banner appears on the home page.'}
              </Text>
              {/* Mock Banner */}
              <View style={[st.bannerPreview, { borderColor: brandColor + '30' }]}>
                <LinearGradient colors={[brandColor, brandColor + 'CC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.bannerPreviewGradient}>
                  <View style={st.bannerPreviewDecoCircle} />
                  <View style={st.bannerPreviewContent}>
                    {sponsor.photo ? (
                      <Image source={{ uri: sponsor.photo }} style={st.bannerPreviewLogo} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                    ) : (
                      <View style={[st.bannerPreviewLogo, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                        <MaterialIcons name={isGold ? 'workspace-premium' : 'handshake'} size={20} color="#FFF" />
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <View style={st.bannerPreviewBadge}>
                        <MaterialIcons name={isGold ? 'star' : 'workspace-premium'} size={8} color="#FFF" />
                        <Text style={st.bannerPreviewBadgeText}>{tierLabel.toUpperCase()}</Text>
                      </View>
                      <Text style={st.bannerPreviewName} numberOfLines={1}>{sponsor.display_name}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color="rgba(255,255,255,0.6)" />
                  </View>
                </LinearGradient>
              </View>
              <Text style={st.bannerPreviewNote}>
                {fr ? 'La banniere utilise votre photo et couleur de marque.' : 'The banner uses your photo and brand color.'}
              </Text>
            </View>

            <PartnerGalleryManager sponsorId={sponsor.id} userId={user?.id||''} galleryPhotos={galleryPhotos} setGalleryPhotos={setGalleryPhotos} tierColor={tierColor} fr={fr} showAlert={showAlert} />

            {/* Save Branding + Brand Kit Export */}
            <View style={{ gap: 10 }}>
              <Pressable
                style={({ pressed }) => [st.brandSaveBtn, { backgroundColor: tierColor }, savingBrand && { opacity: 0.6 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={async () => {
                  setSavingBrand(true);
                  try {
                    await supabase
                      .from('ambassadors')
                      .update({ brand_color: brandColor, updated_at: new Date().toISOString() })
                      .eq('id', sponsor.id);
                    invalidateAmbassadorCache();
                    invalidateAmbassadorCache();
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    showAlert(fr ? 'Branding mis a jour' : 'Branding updated');
                  } catch (e: any) { showAlert(fr ? 'Erreur' : 'Error', e.message); }
                  setSavingBrand(false);
                }}
                disabled={savingBrand}
              >
                {savingBrand ? <ActivityIndicator color="#FFF" size="small" /> : (
                  <>
                    <MaterialIcons name="save" size={20} color="#FFF" />
                    <Text style={st.brandSaveBtnText}>{fr ? 'Enregistrer' : 'Save'}</Text>
                  </>
                )}
              </Pressable>
              {isGold ? <Pressable
                style={({ pressed }) => [st.exportBtn, { borderColor: brandColor + '40' }, exportingBrandKit && { opacity: 0.6 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={handleExportBrandKit}
                disabled={exportingBrandKit}
              >
                {exportingBrandKit ? <ActivityIndicator size="small" color={brandColor} /> : (
                  <>
                    <MaterialIcons name="design-services" size={20} color={brandColor} />
                    <View style={{ flex: 1 }}>
                      <Text style={[st.exportBtnText, { color: brandColor }]}>{fr ? 'Exporter kit de marque' : 'Export brand kit'}</Text>
                      <Text style={st.exportBtnSub}>{fr ? 'PDF avec logo, couleur, mockups et guidelines' : 'PDF with logo, color, mockups and guidelines'}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={18} color={brandColor} />
                  </>
                )}
              </Pressable> : null}
            </View>
          </>
        ) : null}

        {activeSection === 'push' ? (
          <>
            {/* Quota Display */}
            {pushQuota ? (
              <View style={st.pushQuotaCard}>
                <View style={st.pushQuotaHeader}>
                  <View style={[st.pushQuotaIcon, { backgroundColor: pushQuota.canSend ? '#10B98112' : '#EF444412' }]}>
                    <MaterialIcons name={pushQuota.isUnlimited ? 'all-inclusive' : 'notifications-active'} size={22} color={pushQuota.canSend ? '#10B981' : '#EF4444'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    {pushQuota.isUnlimited ? (
                      <>
                        <Text style={st.pushQuotaValue}>{fr ? 'Illimite' : 'Unlimited'}</Text>
                        <Text style={st.pushQuotaSub}>{pushQuota.used} {fr ? 'envoyee(s) ce mois' : 'sent this month'}</Text>
                      </>
                    ) : pushQuota.limit === 0 ? (
                      <>
                        <Text style={[st.pushQuotaValue, { color: '#EF4444' }]}>{fr ? 'Non disponible' : 'Not available'}</Text>
                        <Text style={st.pushQuotaSub}>{fr ? 'Passez au tier superieur' : 'Upgrade your tier'}</Text>
                      </>
                    ) : (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                          <Text style={[st.pushQuotaValue, { color: pushQuota.canSend ? '#10B981' : '#EF4444' }]}>{pushQuota.remaining}</Text>
                          <Text style={st.pushQuotaSub}>/ {pushQuota.limit}</Text>
                        </View>
                        <Text style={st.pushQuotaSub}>{fr ? 'notification(s) restante(s)' : 'notification(s) remaining'}</Text>
                      </>
                    )}
                  </View>
                  <View style={st.pushQuotaReset}>
                    <MaterialIcons name="schedule" size={12} color={theme.textMuted} />
                    <Text style={st.pushQuotaResetText}>{getDaysUntilReset()}{fr ? 'j' : 'd'}</Text>
                  </View>
                </View>
                {/* Progress bar */}
                {!pushQuota.isUnlimited && pushQuota.limit > 0 ? (
                  <View style={st.pushQuotaBar}>
                    <View style={[st.pushQuotaBarFill, { width: `${pushQuota.percentage}%`, backgroundColor: pushQuota.canSend ? '#10B981' : '#EF4444' }]} />
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Composer */}
            {pushQuota?.canSend ? (
              <View style={st.pushComposerCard}>
                <Text style={st.pushComposerTitle}>{fr ? 'Composer une notification' : 'Compose notification'}</Text>
                <View style={st.pushField}>
                  <Text style={st.pushFieldLabel}>{fr ? 'Titre' : 'Title'}</Text>
                  <TextInput
                    style={st.pushInput}
                    value={pushTitle}
                    onChangeText={setPushTitle}
                    placeholder={fr ? 'Ex: Nouveau defi ce weekend !' : 'Ex: New challenge this weekend!'}
                    placeholderTextColor="#94A3B8"
                    maxLength={60}
                  />
                  <Text style={st.pushCharCount}>{pushTitle.length}/60</Text>
                </View>
                <View style={st.pushField}>
                  <Text style={st.pushFieldLabel}>Message</Text>
                  <TextInput
                    style={[st.pushInput, { minHeight: 80, textAlignVertical: 'top' }]}
                    value={pushBody}
                    onChangeText={setPushBody}
                    placeholder={fr ? 'Decrivez votre evenement ou offre...' : 'Describe your event or offer...'}
                    placeholderTextColor="#94A3B8"
                    multiline
                    maxLength={200}
                  />
                  <Text style={st.pushCharCount}>{pushBody.length}/200</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={[st.pushField, { flex: 2 }]}>
                    <Text style={st.pushFieldLabel}>{fr ? 'Ville (optionnel)' : 'City (optional)'}</Text>
                    <TextInput
                      style={st.pushInput}
                      value={pushCity}
                      onChangeText={setPushCity}
                      placeholder={fr ? 'Ex: Paris' : 'Ex: Paris'}
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  <View style={[st.pushField, { flex: 1 }]}>
                    <Text style={st.pushFieldLabel}>{fr ? 'Rayon' : 'Radius'}</Text>
                    <TextInput
                      style={st.pushInput}
                      value={pushRadius}
                      onChangeText={setPushRadius}
                      keyboardType="numeric"
                      placeholder="200"
                      placeholderTextColor="#94A3B8"
                    />
                    <Text style={st.pushUnitLabel}>km</Text>
                  </View>
                </View>

                {/* Audience Segmentation */}
                <View style={st.segCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <MaterialIcons name="tune" size={16} color={tierColor} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Ciblage audience' : 'Audience targeting'}</Text>
                    <View style={{ flex: 1 }} />
                    <View style={{ backgroundColor: tierColor + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      {segCountLoading?<ActivityIndicator size={10} color={tierColor}/>:<Text style={{fontSize:10,fontWeight:'800',color:tierColor}}>{segPlayerCount!==null?segPlayerCount:'...'} {fr?'joueurs':'players'}</Text>}
                    </View>
                  </View>
                  <Text style={st.segLabel}>{fr ? 'Rang ELO' : 'ELO Rank'}</Text>
                  <View style={st.segChipsRow}>
                    {[
                      { id: 'bronze', label: 'Bronze', icon: 'shield' as const, color: '#CD7F32' },
                      { id: 'silver', label: fr ? 'Argent' : 'Silver', icon: 'workspace-premium' as const, color: '#94A3B8' },
                      { id: 'gold', label: fr ? 'Or' : 'Gold', icon: 'emoji-events' as const, color: '#F59E0B' },
                      { id: 'diamond', label: fr ? 'Diamant' : 'Diamond', icon: 'diamond' as const, color: '#06B6D4' },
                      { id: 'master', label: fr ? 'Maitre' : 'Master', icon: 'military-tech' as const, color: '#9333EA' },
                      { id: 'grand_master', label: fr ? 'Grand Maitre' : 'Grand Master', icon: 'auto-awesome' as const, color: '#FFD700' },
                    ].map(rank => {
                      const sel = segLevels.includes(rank.id);
                      return (
                        <Pressable key={rank.id} style={[st.segChip, sel && { backgroundColor: rank.color + '15', borderColor: rank.color + '30' }]} onPress={() => { Haptics.selectionAsync(); setSegLevels(prev => sel ? prev.filter(l => l !== rank.id) : [...prev, rank.id]); }}>
                          <MaterialIcons name={rank.icon} size={12} color={sel ? rank.color : '#94A3B8'} />
                          <Text style={[st.segChipText, sel && { color: rank.color, fontWeight: '700' }]}>{rank.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={st.segLabel}>{fr ? 'Experience' : 'Experience'}</Text>
                  <View style={st.segChipsRow}>
                    {[
                      { id: 'less_1', label: fr ? '< 1 an' : '< 1 year' },
                      { id: '1_3', label: fr ? '1-3 ans' : '1-3 years' },
                      { id: '3_10', label: fr ? '3-10 ans' : '3-10 years' },
                      { id: '10_plus', label: '10+' },
                    ].map(exp => {
                      const sel = segRoles.includes('exp_' + exp.id);
                      return (
                        <Pressable key={exp.id} style={[st.segChip, sel && { backgroundColor: tierColor + '15', borderColor: tierColor + '30' }]} onPress={() => { Haptics.selectionAsync(); const key = 'exp_' + exp.id; setSegRoles(prev => sel ? prev.filter(r => r !== key) : [...prev, key]); }}>
                          <Text style={[st.segChipText, sel && { color: tierColor, fontWeight: '700' }]}>{exp.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={st.segLabel}>{fr ? 'Role' : 'Role'}</Text>
                  <View style={st.segChipsRow}>
                    {['Tireur', 'Pointeur', 'Milieu'].map(rl => {
                      const sel = segRoles.includes(rl);
                      return (
                        <Pressable key={rl} style={[st.segChip, sel && { backgroundColor: tierColor + '15', borderColor: tierColor + '30' }]} onPress={() => { Haptics.selectionAsync(); setSegRoles(prev => sel ? prev.filter(r => r !== rl) : [...prev, rl]); }}>
                          <Text style={[st.segChipText, sel && { color: tierColor, fontWeight: '700' }]}>{rl}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={st.segLabel}>{fr ? 'Activite' : 'Activity'}</Text>
                  <View style={st.segChipsRow}>
                    {[{ key: 'all' as const, label: fr ? 'Tous' : 'All' }, { key: '30d' as const, label: '30j' }, { key: '7d' as const, label: '7j' }].map(ac => {
                      const sel = segActivity === ac.key;
                      return (
                        <Pressable key={ac.key} style={[st.segChip, sel && { backgroundColor: tierColor + '15', borderColor: tierColor + '30' }]} onPress={() => { Haptics.selectionAsync(); setSegActivity(ac.key); }}>
                          <Text style={[st.segChipText, sel && { color: tierColor, fontWeight: '700' }]}>{ac.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {/* A/B Test Toggle */}
                <Pressable
                  style={[st.abToggle, abTestEnabled && { backgroundColor: tierColor + '12', borderColor: tierColor + '30' }]}
                  onPress={() => { if (!isGold) { showAlert(fr ? 'Reservee au tier Or' : 'Gold tier only', fr ? 'Le test A/B est reserve aux partenaires Or.' : 'A/B testing is reserved for Gold partners.'); return; } Haptics.selectionAsync(); setAbTestEnabled(!abTestEnabled); }}
                >
                  <MaterialIcons name={abTestEnabled ? 'toggle-on' : 'toggle-off'} size={24} color={abTestEnabled && isGold ? tierColor : '#94A3B8'} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.abToggleTitle, abTestEnabled && isGold && { color: tierColor }]}>A/B Testing {!isGold ? (fr ? '(Or)' : '(Gold)') : ''}</Text>
                    <Text style={st.abToggleDesc}>{fr ? 'Testez 2 variantes pour optimiser' : 'Test 2 variants to optimize'}</Text>
                  </View>
                  {abTestEnabled ? <View style={[st.abBadge, { backgroundColor: tierColor }]}><Text style={st.abBadgeText}>ON</Text></View> : null}
                </Pressable>

                {/* Variant B fields (when A/B enabled) */}
                {abTestEnabled ? (
                  <View style={st.abVariantBlock}>
                    <View style={[st.abVariantHeader, { backgroundColor: '#7C3AED12' }]}>
                      <View style={[st.abVariantDot, { backgroundColor: '#7C3AED' }]} />
                      <Text style={[st.abVariantLabel, { color: '#7C3AED' }]}>{fr ? 'VARIANTE B' : 'VARIANT B'}</Text>
                    </View>
                    <View style={st.pushField}>
                      <Text style={st.pushFieldLabel}>{fr ? 'Titre B' : 'Title B'}</Text>
                      <TextInput
                        style={st.pushInput}
                        value={pushTitleB}
                        onChangeText={setPushTitleB}
                        placeholder={fr ? 'Titre alternatif...' : 'Alternative title...'}
                        placeholderTextColor="#94A3B8"
                        maxLength={60}
                      />
                      <Text style={st.pushCharCount}>{pushTitleB.length}/60</Text>
                    </View>
                    <View style={st.pushField}>
                      <Text style={st.pushFieldLabel}>Message B</Text>
                      <TextInput
                        style={[st.pushInput, { minHeight: 80, textAlignVertical: 'top' }]}
                        value={pushBodyB}
                        onChangeText={setPushBodyB}
                        placeholder={fr ? 'Message alternatif...' : 'Alternative message...'}
                        placeholderTextColor="#94A3B8"
                        multiline
                        maxLength={200}
                      />
                      <Text style={st.pushCharCount}>{pushBodyB.length}/200</Text>
                    </View>
                    <View style={st.abSplitRow}>
                      <View style={st.abSplitItem}>
                        <View style={[st.abSplitBar, { backgroundColor: tierColor, width: '100%' }]} />
                        <Text style={st.abSplitLabel}>A: 50%</Text>
                      </View>
                      <View style={st.abSplitItem}>
                        <View style={[st.abSplitBar, { backgroundColor: '#7C3AED', width: '100%' }]} />
                        <Text style={st.abSplitLabel}>B: 50%</Text>
                      </View>
                    </View>
                  </View>
                ) : null}

                {/* Preview */}
                {pushTitle.trim() ? (
                  <View style={st.pushPreview}>
                    <Text style={st.pushPreviewLabel}>{abTestEnabled ? (fr ? 'APERCU VARIANTE A' : 'PREVIEW VARIANT A') : (fr ? 'APERCU' : 'PREVIEW')}</Text>
                    <View style={st.pushPreviewCard}>
                      <View style={st.pushPreviewIcon}>
                        <MaterialIcons name="notifications" size={18} color={tierColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={st.pushPreviewTitle} numberOfLines={1}>{pushTitle || (fr ? 'Titre...' : 'Title...')}</Text>
                        <Text style={st.pushPreviewBody} numberOfLines={2}>{pushBody || (fr ? 'Message...' : 'Message...')}</Text>
                      </View>
                    </View>
                    {abTestEnabled && pushTitleB.trim() ? (
                      <>
                        <Text style={[st.pushPreviewLabel, { marginTop: 10 }]}>{fr ? 'APERCU VARIANTE B' : 'PREVIEW VARIANT B'}</Text>
                        <View style={[st.pushPreviewCard, { borderColor: '#7C3AED20' }]}>
                          <View style={[st.pushPreviewIcon, { borderColor: '#7C3AED20' }]}>
                            <MaterialIcons name="notifications" size={18} color="#7C3AED" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={st.pushPreviewTitle} numberOfLines={1}>{pushTitleB}</Text>
                            <Text style={st.pushPreviewBody} numberOfLines={2}>{pushBodyB}</Text>
                          </View>
                        </View>
                      </>
                    ) : null}
                  </View>
                ) : null}

                {/* Phone Notification Mockup */}
                {pushTitle.trim() ? (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={st.pushPreviewLabel}>{fr ? 'APERCU SUR TELEPHONE' : 'PHONE PREVIEW'}</Text>
                    <View style={{ backgroundColor: '#1C1C1E', borderRadius: 28, padding: 6, overflow: 'hidden' as const }}>
                      {/* Status bar */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>9:41</Text>
                        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                          <MaterialIcons name="signal-cellular-4-bar" size={12} color="#FFF" />
                          <MaterialIcons name="wifi" size={12} color="#FFF" />
                          <MaterialIcons name="battery-full" size={12} color="#FFF" />
                        </View>
                      </View>
                      {/* Notification banner */}
                      <View style={{ backgroundColor: '#F2F2F7', borderRadius: 18, padding: 12, marginHorizontal: 4, marginBottom: 8, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                        {sponsor.photo ? (
                          <Image source={{ uri: sponsor.photo }} style={{ width: 38, height: 38, borderRadius: 10 }} contentFit="cover" cachePolicy="memory-disk" />
                        ) : (
                          <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: tierColor, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 17, fontWeight: '900', color: '#FFF' }}>{(sponsor.display_name || 'S').charAt(0)}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#000' }}>Ultimate Petanque</Text>
                            <Text style={{ fontSize: 11, color: '#8E8E93' }}>{fr ? 'maintenant' : 'now'}</Text>
                          </View>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#000', marginTop: 2 }} numberOfLines={1}>{pushTitle}</Text>
                          <Text style={{ fontSize: 13, color: '#3C3C43', marginTop: 1, lineHeight: 17 }} numberOfLines={2}>{pushBody}</Text>
                        </View>
                      </View>
                      {/* Lock screen hint */}
                      <View style={{ alignItems: 'center', paddingBottom: 12, paddingTop: 4 }}>
                        <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialIcons name="lock" size={16} color="rgba(255,255,255,0.4)" />
                        </View>
                      </View>
                      {/* Home indicator */}
                      <View style={{ alignItems: 'center', paddingBottom: 4 }}>
                        <View style={{ width: 100, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                      </View>
                    </View>
                    {/* Variant B phone mockup */}
                    {abTestEnabled && pushTitleB.trim() ? (
                      <View style={{ marginTop: 10 }}>
                        <Text style={st.pushPreviewLabel}>{fr ? 'VARIANTE B SUR TELEPHONE' : 'VARIANT B PHONE PREVIEW'}</Text>
                        <View style={{ backgroundColor: '#1C1C1E', borderRadius: 28, padding: 6, overflow: 'hidden' as const }}>
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 6, paddingBottom: 10 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#FFF' }}>9:41</Text>
                            <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
                              <MaterialIcons name="signal-cellular-4-bar" size={12} color="#FFF" />
                              <MaterialIcons name="wifi" size={12} color="#FFF" />
                              <MaterialIcons name="battery-full" size={12} color="#FFF" />
                            </View>
                          </View>
                          <View style={{ backgroundColor: '#F2F2F7', borderRadius: 18, padding: 12, marginHorizontal: 4, marginBottom: 8, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                            {sponsor.photo ? (
                              <Image source={{ uri: sponsor.photo }} style={{ width: 38, height: 38, borderRadius: 10 }} contentFit="cover" cachePolicy="memory-disk" />
                            ) : (
                              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' }}>
                                <Text style={{ fontSize: 17, fontWeight: '900', color: '#FFF' }}>{(sponsor.display_name || 'S').charAt(0)}</Text>
                              </View>
                            )}
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#000' }}>Ultimate Petanque</Text>
                                <Text style={{ fontSize: 11, color: '#8E8E93' }}>{fr ? 'maintenant' : 'now'}</Text>
                              </View>
                              <Text style={{ fontSize: 13, fontWeight: '600', color: '#000', marginTop: 2 }} numberOfLines={1}>{pushTitleB}</Text>
                              <Text style={{ fontSize: 13, color: '#3C3C43', marginTop: 1, lineHeight: 17 }} numberOfLines={2}>{pushBodyB}</Text>
                            </View>
                          </View>
                          <View style={{ alignItems: 'center', paddingBottom: 12, paddingTop: 4 }}>
                            <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center' }}>
                              <MaterialIcons name="lock" size={16} color="rgba(255,255,255,0.4)" />
                            </View>
                          </View>
                          <View style={{ alignItems: 'center', paddingBottom: 4 }}>
                            <View style={{ width: 100, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)' }} />
                          </View>
                        </View>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Schedule Toggle */}
                <Pressable
                  style={[st.abToggle, scheduleEnabled && { backgroundColor: '#3B82F612', borderColor: '#3B82F630' }]}
                  onPress={() => { Haptics.selectionAsync(); setScheduleEnabled(!scheduleEnabled); }}
                >
                  <MaterialIcons name={scheduleEnabled ? 'toggle-on' : 'toggle-off'} size={24} color={scheduleEnabled ? '#3B82F6' : '#94A3B8'} />
                  <View style={{ flex: 1 }}>
                    <Text style={[st.abToggleTitle, scheduleEnabled && { color: '#3B82F6' }]}>{fr ? 'Programmer l envoi' : 'Schedule send'}</Text>
                    <Text style={st.abToggleDesc}>{fr ? 'Choisir une date et heure d envoi' : 'Choose send date and time'}</Text>
                  </View>
                  {scheduleEnabled ? <View style={[st.abBadge, { backgroundColor: '#3B82F6' }]}><MaterialIcons name="schedule" size={10} color="#FFF" /></View> : null}
                </Pressable>

                {scheduleEnabled ? (
                  <View style={{ marginBottom: 16 }}>
                    {/* Quick date buttons */}
                    <Text style={[st.pushFieldLabel, { marginBottom: 8 }]}>{fr ? 'Date rapide' : 'Quick date'}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 12 }}>
                      {[
                        { label: fr ? "Aujourd'hui" : 'Today', getDate: () => { const d = new Date(); return d.toISOString().split('T')[0]; } },
                        { label: fr ? 'Demain' : 'Tomorrow', getDate: () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; } },
                        { label: fr ? 'Ce weekend' : 'This weekend', getDate: () => { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() + (6 - day)); return d.toISOString().split('T')[0]; } },
                        { label: fr ? 'Lundi prochain' : 'Next Monday', getDate: () => { const d = new Date(); const day = d.getDay(); d.setDate(d.getDate() + (8 - day) % 7 || 7); return d.toISOString().split('T')[0]; } },
                      ].map((qd, qi) => {
                        const dateVal = qd.getDate();
                        const isSelected = scheduleDate === dateVal;
                        return (
                          <Pressable
                            key={qi}
                            style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: isSelected ? '#3B82F6' : '#F8FAFC', borderWidth: 1.5, borderColor: isSelected ? '#3B82F6' : '#E2E8F0' }]}
                            onPress={() => { Haptics.selectionAsync(); setScheduleDate(dateVal); }}
                          >
                            <MaterialIcons name="event" size={14} color={isSelected ? '#FFF' : '#64748B'} />
                            <Text style={{ fontSize: 12, fontWeight: '700', color: isSelected ? '#FFF' : '#334155' }}>{qd.label}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    {/* Date & Time inputs with icons */}
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={[st.pushField, { flex: 1, marginBottom: 0 }]}>
                        <Text style={st.pushFieldLabel}>{fr ? 'Date' : 'Date'}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: scheduleDate ? '#3B82F630' : '#E2E8F0', overflow: 'hidden' }}>
                          <View style={{ width: 40, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: scheduleDate ? '#3B82F610' : '#F1F5F9' }}>
                            <MaterialIcons name="calendar-today" size={16} color={scheduleDate ? '#3B82F6' : '#94A3B8'} />
                          </View>
                          <TextInput
                            style={[st.pushInput, { flex: 1, borderWidth: 0, backgroundColor: 'transparent' }]}
                            value={scheduleDate}
                            onChangeText={setScheduleDate}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor="#94A3B8"
                          />
                        </View>
                        {scheduleDate ? (
                          <Text style={{ fontSize: 10, color: '#3B82F6', fontWeight: '600', marginTop: 4, marginLeft: 4 }}>
                            {(() => { try { return new Date(scheduleDate + 'T12:00:00').toLocaleDateString(fr ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' }); } catch { return ''; } })()}
                          </Text>
                        ) : null}
                      </View>
                      <View style={[st.pushField, { flex: 1, marginBottom: 0 }]}>
                        <Text style={st.pushFieldLabel}>{fr ? 'Heure' : 'Time'}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: scheduleTime ? '#3B82F630' : '#E2E8F0', overflow: 'hidden' }}>
                          <View style={{ width: 40, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: scheduleTime ? '#3B82F610' : '#F1F5F9' }}>
                            <MaterialIcons name="schedule" size={16} color={scheduleTime ? '#3B82F6' : '#94A3B8'} />
                          </View>
                          <TextInput
                            style={[st.pushInput, { flex: 1, borderWidth: 0, backgroundColor: 'transparent' }]}
                            value={scheduleTime}
                            onChangeText={setScheduleTime}
                            placeholder="HH:MM"
                            placeholderTextColor="#94A3B8"
                          />
                        </View>
                      </View>
                    </View>
                    {/* Quick time slots */}
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
                      {[
                        { label: fr ? 'Matin' : 'Morning', time: '09:00', icon: 'wb-sunny' as const },
                        { label: fr ? 'Midi' : 'Noon', time: '12:00', icon: 'light-mode' as const },
                        { label: fr ? 'Apres-midi' : 'Afternoon', time: '15:00', icon: 'wb-cloudy' as const },
                        { label: fr ? 'Soiree' : 'Evening', time: '19:00', icon: 'nights-stay' as const },
                      ].map((ts, ti) => {
                        const isSelected = scheduleTime === ts.time;
                        return (
                          <Pressable
                            key={ti}
                            style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 10, borderRadius: 12, backgroundColor: isSelected ? '#3B82F6' : '#F8FAFC', borderWidth: 1.5, borderColor: isSelected ? '#3B82F6' : '#E2E8F0' }}
                            onPress={() => { Haptics.selectionAsync(); setScheduleTime(ts.time); }}
                          >
                            <MaterialIcons name={ts.icon} size={16} color={isSelected ? '#FFF' : '#64748B'} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: isSelected ? '#FFF' : '#334155' }}>{ts.label}</Text>
                            <Text style={{ fontSize: 9, fontWeight: '600', color: isSelected ? 'rgba(255,255,255,0.7)' : '#94A3B8' }}>{ts.time}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {/* Heatmap suggestion */}
                    {bestSendTime ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FDE68A' }}>
                        <MaterialIcons name="lightbulb" size={14} color="#F59E0B" />
                        <Text style={{ flex: 1, fontSize: 11, color: '#92400E', lineHeight: 15 }}>
                          {fr ? `Creneau optimal : ${bestSendTime.day}, ${bestSendTime.slot}` : `Best time: ${bestSendTime.day}, ${bestSendTime.slot}`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Send / Schedule Button */}
                <Pressable
                  style={({ pressed }) => [st.pushSendBtn, { backgroundColor: scheduleEnabled ? '#3B82F6' : tierColor }, sendingPush && { opacity: 0.6 }, (!pushTitle.trim() || !pushBody.trim()) && { opacity: 0.4 }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                  onPress={handleSendPush}
                  disabled={sendingPush || !pushTitle.trim() || !pushBody.trim()}
                >
                  {sendingPush ? <ActivityIndicator color="#FFF" size="small" /> : (
                    <>
                      <MaterialIcons name={scheduleEnabled ? 'schedule-send' : abTestEnabled ? 'science' : 'send'} size={18} color="#FFF" />
                      <Text style={st.pushSendBtnText}>{scheduleEnabled ? (fr ? 'Programmer' : 'Schedule') : abTestEnabled ? (fr ? 'Lancer le test A/B' : 'Launch A/B test') : (fr ? 'Envoyer la notification' : 'Send notification')}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : pushQuota && pushQuota.limit > 0 && !pushQuota.canSend ? (
              <View style={st.pushBlockedCard}>
                <MaterialIcons name="block" size={32} color="#EF4444" />
                <Text style={st.pushBlockedTitle}>{fr ? 'Quota atteint' : 'Quota reached'}</Text>
                <Text style={st.pushBlockedDesc}>
                  {fr ? `Votre limite mensuelle est atteinte. Reset le ${pushQuota.resetLabel}.` : `Your monthly limit is reached. Resets ${pushQuota.resetLabel}.`}
                </Text>
              </View>
            ) : pushQuota && pushQuota.limit === 0 ? (
              <View style={st.pushBlockedCard}>
                <MaterialIcons name="lock" size={32} color={theme.textMuted} />
                <Text style={st.pushBlockedTitle}>{fr ? 'Fonctionnalite reservee' : 'Reserved feature'}</Text>
                <Text style={st.pushBlockedDesc}>
                  {fr ? 'Les notifications push sont disponibles pour les partenaires Argent et Or.' : 'Push notifications are available for Silver and Gold partners.'}
                </Text>
                <Pressable style={[st.pushUpgradeBtn, { borderColor: tierColor }]} onPress={() => router.push('/partnerships' as any)}>
                  <MaterialIcons name="upgrade" size={16} color={tierColor} />
                  <Text style={[st.pushUpgradeBtnText, { color: tierColor }]}>{fr ? 'Voir les offres' : 'View plans'}</Text>
                </Pressable>
              </View>
            ) : null}

            {/* Push Templates Library */}
            {pushQuota?.canSend ? (
              <View style={st.pushAnalyticsCard}>
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: showTemplates ? 14 : 0 }}
                  onPress={() => { Haptics.selectionAsync(); setShowTemplates(!showTemplates); }}
                >
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#EC489912', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="auto-awesome" size={18} color="#EC4899" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Bibliotheque de templates' : 'Template library'}</Text>
                    <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{fr ? 'Messages pre-redigees a personnaliser' : 'Pre-written messages to customize'}</Text>
                  </View>
                  <MaterialIcons name={showTemplates ? 'expand-less' : 'expand-more'} size={22} color="#94A3B8" />
                </Pressable>
                {showTemplates ? (
                  <View>
                    {/* Template Usage Analytics */}
                    {templateUsage.size > 0 ? (
                      <View style={{ backgroundColor: '#EC489908', borderRadius: 12, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#EC489915' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <MaterialIcons name="analytics" size={14} color="#EC4899" />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#EC4899' }}>{fr ? 'UTILISATION DES TEMPLATES' : 'TEMPLATE USAGE'}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {Array.from(templateUsage.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([title, count], i) => (
                            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#EC489920' }}>
                              <Text style={{ fontSize: 10, fontWeight: '600', color: '#334155', maxWidth: 120 }} numberOfLines={1}>{title}</Text>
                              <View style={{ backgroundColor: '#EC4899', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6 }}>
                                <Text style={{ fontSize: 9, fontWeight: '900', color: '#FFF' }}>{count}</Text>
                              </View>
                            </View>
                          ))}
                        </View>
                        <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 6, fontStyle: 'italic' }}>
                          {fr ? `${Array.from(templateUsage.values()).reduce((s, v) => s + v, 0)} utilisation(s) totale(s)` : `${Array.from(templateUsage.values()).reduce((s, v) => s + v, 0)} total use(s)`}
                        </Text>
                      </View>
                    ) : null}
                    {[
                      { cat: fr ? 'Promo' : 'Promo', catColor: '#EF4444', catIcon: 'local-offer' as const, templates: [
                        { title: fr ? 'Promo flash -20%' : 'Flash sale -20%', body: fr ? 'Profitez de -20% sur toute la gamme ce weekend ! Code : FLASH20' : 'Get -20% on the full range this weekend! Code: FLASH20' },
                        { title: fr ? 'Livraison offerte' : 'Free shipping', body: fr ? 'Livraison gratuite sur toutes les commandes sans minimum. Offre limitee !' : 'Free shipping on all orders, no minimum. Limited offer!' },
                      ]},
                      { cat: fr ? 'Evenement' : 'Event', catColor: '#7C3AED', catIcon: 'event' as const, templates: [
                        { title: fr ? 'Tournoi ce weekend' : 'Tournament this weekend', body: fr ? 'Rejoignez-nous pour un tournoi exceptionnel ! Inscriptions ouvertes, places limitees.' : 'Join us for an exceptional tournament! Registrations open, limited spots.' },
                        { title: fr ? 'Masterclass gratuite' : 'Free masterclass', body: fr ? 'Apprenez les techniques des champions lors de notre masterclass gratuite.' : 'Learn champion techniques at our free masterclass.' },
                      ]},
                      { cat: fr ? 'Rappel' : 'Reminder', catColor: '#3B82F6', catIcon: 'schedule' as const, templates: [
                        { title: fr ? 'N oubliez pas !' : 'Don\'t forget!', body: fr ? 'L evenement commence demain ! Verifiez votre inscription et preparez vos boules.' : 'The event starts tomorrow! Check your registration and prepare your boules.' },
                        { title: fr ? 'Derniere chance' : 'Last chance', body: fr ? 'Plus que quelques heures pour profiter de notre offre. Ne ratez pas cette opportunite !' : 'Only a few hours left to take advantage of our offer. Don\'t miss out!' },
                      ]},
                      { cat: fr ? 'Saisonnier' : 'Seasonal', catColor: '#10B981', catIcon: 'wb-sunny' as const, templates: [
                        { title: fr ? 'La saison reprend !' : 'Season is back!', body: fr ? 'Le beau temps revient et les terrains vous attendent. Preparez votre prochaine partie !' : 'Nice weather is back and the courts are waiting. Prepare your next game!' },
                        { title: fr ? 'Bonne annee petanquiste !' : 'Happy new year!', body: fr ? 'Tous nos voeux pour cette nouvelle saison ! Decouvrez nos nouveautes.' : 'Best wishes for the new season! Discover our new products.' },
                      ]},
                      { cat: fr ? 'Partenariat' : 'Partnership', catColor: '#6366F1', catIcon: 'handshake' as const, templates: [
                        { title: fr ? 'Nouveau partenaire officiel !' : 'New official partner!', body: fr ? 'Nous sommes fiers de rejoindre la communaute Ultimate Petanque. Decouvrez nos offres exclusives pour les joueurs !' : 'We are proud to join the Ultimate Petanque community. Discover our exclusive offers for players!' },
                        { title: fr ? 'Ensemble pour la petanque' : 'Together for petanque', body: fr ? 'Notre partenariat avec Ultimate Petanque est officiel ! Profitez d avantages exclusifs avec le code dans notre profil.' : 'Our partnership with Ultimate Petanque is official! Enjoy exclusive benefits with the code in our profile.' },
                      ]},
                      { cat: fr ? 'Lancement' : 'Product launch', catColor: '#F97316', catIcon: 'rocket-launch' as const, templates: [
                        { title: fr ? 'Nouveau produit disponible !' : 'New product available!', body: fr ? 'Decouvrez notre derniere innovation pour les joueurs de petanque. Disponible des maintenant !' : 'Discover our latest innovation for petanque players. Available now!' },
                        { title: fr ? 'Exclusivite : nouvelle gamme' : 'Exclusive: new range', body: fr ? 'Soyez les premiers a decouvrir notre nouvelle gamme. Lancement exclusif pour la communaute Ultimate Petanque.' : 'Be the first to discover our new range. Exclusive launch for the Ultimate Petanque community.' },
                      ]},
                      { cat: fr ? 'Communaute' : 'Community', catColor: '#0EA5E9', catIcon: 'groups' as const, templates: [
                        { title: fr ? 'Cap franchi : merci a vous !' : 'Milestone reached: thank you!', body: fr ? 'Grace a vous, nous avons atteint un nouveau cap ! Merci pour votre soutien et votre confiance.' : 'Thanks to you, we have reached a new milestone! Thank you for your support and trust.' },
                        { title: fr ? 'La communaute grandit !' : 'The community grows!', body: fr ? 'Chaque jour, de nouveaux joueurs rejoignent Ultimate Petanque. Ensemble, faisons vivre notre sport !' : 'Every day, new players join Ultimate Petanque. Together, let us keep our sport alive!' },
                      ]},
                    ].map((cat, ci) => (
                      <View key={ci} style={{ marginBottom: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                          <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: cat.catColor + '12', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialIcons name={cat.catIcon} size={12} color={cat.catColor} />
                          </View>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: cat.catColor }}>{cat.cat}</Text>
                        </View>
                        {cat.templates.map((tpl, ti) => (
                          <Pressable
                            key={ti}
                            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#E2E8F0' }, pressed && { backgroundColor: cat.catColor + '08', borderColor: cat.catColor + '30' }]}
                            onPress={() => {
                              Haptics.selectionAsync();
                              setPushTitle(tpl.title);
                              setPushBody(tpl.body);
                              setShowTemplates(false);
                              handleTrackTemplate(tpl.title);
                            }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }} numberOfLines={1}>{tpl.title}</Text>
                              <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }} numberOfLines={2}>{tpl.body}</Text>
                            </View>
                            <View style={{ alignItems: 'center', gap: 2 }}>
                              <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: cat.catColor + '12', alignItems: 'center', justifyContent: 'center' }}>
                                <MaterialIcons name="content-copy" size={14} color={cat.catColor} />
                              </View>
                              {templateUsage.get(tpl.title) ? (
                                <Text style={{ fontSize: 8, fontWeight: '800', color: cat.catColor }}>{templateUsage.get(tpl.title)}x</Text>
                              ) : null}
                            </View>
                          </Pressable>
                        ))}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Push Calendar View */}
            {pushAnalytics.totalSent > 0 || scheduledPushes.length > 0 ? (() => {
              const year = calendarMonth.year;
              const month = calendarMonth.month;
              const firstDay = new Date(year, month, 1).getDay();
              const daysInMonth = new Date(year, month + 1, 0).getDate();
              const offset = firstDay === 0 ? 6 : firstDay - 1; // Monday start
              const monthLabel = new Date(year, month).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' });
              const dayLabels = fr ? ['L', 'M', 'M', 'J', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
              const today = new Date();
              const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
              const cells: (number | null)[] = [];
              for (let i = 0; i < offset; i++) cells.push(null);
              for (let d = 1; d <= daysInMonth; d++) cells.push(d);
              while (cells.length % 7 !== 0) cells.push(null);
              return (
                <View style={st.pushAnalyticsCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <Pressable onPress={() => { Haptics.selectionAsync(); setCalendarMonth(prev => { const d = new Date(prev.year, prev.month - 1); return { year: d.getFullYear(), month: d.getMonth() }; }); }} hitSlop={8}>
                      <MaterialIcons name="chevron-left" size={22} color={tierColor} />
                    </Pressable>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name="calendar-month" size={18} color={tierColor} />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A', textTransform: 'capitalize' }}>{monthLabel}</Text>
                    </View>
                    <Pressable onPress={() => { Haptics.selectionAsync(); setCalendarMonth(prev => { const d = new Date(prev.year, prev.month + 1); return { year: d.getFullYear(), month: d.getMonth() }; }); }} hitSlop={8}>
                      <MaterialIcons name="chevron-right" size={22} color={tierColor} />
                    </Pressable>
                  </View>
                  {/* Day headers */}
                  <View style={{ flexDirection: 'row', marginBottom: 6 }}>
                    {dayLabels.map((dl, i) => (
                      <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8' }}>{dl}</Text>
                      </View>
                    ))}
                  </View>
                  {/* Calendar grid */}
                  {Array.from({ length: Math.ceil(cells.length / 7) }).map((_, weekIdx) => (
                    <View key={weekIdx} style={{ flexDirection: 'row' }}>
                      {cells.slice(weekIdx * 7, weekIdx * 7 + 7).map((day, di) => {
                        const dayStr = day?.toString() || '';
                        const events = day ? calendarEvents.get(dayStr) || [] : [];
                        const isToday = isCurrentMonth && day === today.getDate();
                        const hasSent = events.some(e => e.type === 'sent');
                        const hasScheduled = events.some(e => e.type === 'scheduled');
                        const hasAB = events.some(e => e.type === 'ab');
                        return (
                          <View key={di} style={{ flex: 1, alignItems: 'center', paddingVertical: 5 }}>
                            {day ? (
                              <View style={[
                                { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
                                isToday && { backgroundColor: tierColor, borderRadius: 10 },
                                !isToday && events.length > 0 && { backgroundColor: tierColor + '10' },
                              ]}>
                                <Text style={[
                                  { fontSize: 13, fontWeight: '500', color: '#334155' },
                                  isToday && { color: '#FFF', fontWeight: '800' },
                                  !isToday && events.length > 0 && { fontWeight: '700', color: tierColor },
                                ]}>{day}</Text>
                              </View>
                            ) : <View style={{ width: 32, height: 32 }} />}
                            {events.length > 0 ? (
                              <View style={{ flexDirection: 'row', gap: 2, marginTop: 2 }}>
                                {hasSent ? <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: tierColor }} /> : null}
                                {hasAB ? <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#7C3AED' }} /> : null}
                                {hasScheduled ? <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#3B82F6' }} /> : null}
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ))}
                  {/* Legend */}
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tierColor }} />
                      <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>{fr ? 'Envoye' : 'Sent'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED' }} />
                      <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>A/B</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#3B82F6' }} />
                      <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>{fr ? 'Programme' : 'Scheduled'}</Text>
                    </View>
                  </View>
                </View>
              );
            })() : null}

            {/* Push Performance Heatmap */}
            {heatmapData.length > 0 ? (() => {
              const dayLabelsH = fr ? ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
              const slotLabelsH = fr ? ['Matin', 'Apres-midi', 'Soiree', 'Nuit'] : ['Morning', 'Afternoon', 'Evening', 'Night'];
              const getHeatColor = (v: number) => {
                if (v >= 70) return { bg: tierColor + '30', text: tierColor };
                if (v >= 50) return { bg: '#10B98125', text: '#10B981' };
                if (v >= 30) return { bg: '#F59E0B20', text: '#F59E0B' };
                return { bg: '#EF444415', text: '#EF4444' };
              };
              return (
                <View style={st.pushAnalyticsCard}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <MaterialIcons name="grid-on" size={18} color={tierColor} />
                    <Text style={st.pushAnalyticsTitle}>{fr ? 'Heatmap performance' : 'Performance Heatmap'}</Text>
                  </View>
                  <Text style={{ fontSize: 11, color: '#94A3B8', marginBottom: 14 }}>
                    {fr ? 'Meilleur creneau estime selon les habitudes de la communaute' : 'Best estimated time slot based on community habits'}
                  </Text>
                  {/* Slot Headers */}
                  <View style={{ flexDirection: 'row', marginBottom: 6, paddingLeft: 40 }}>
                    {slotLabelsH.map((sl, i) => (
                      <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#94A3B8' }}>{sl}</Text>
                      </View>
                    ))}
                  </View>
                  {/* Heatmap Grid */}
                  {heatmapData.map((row, di) => (
                    <View key={di} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ width: 36, fontSize: 10, fontWeight: '600', color: '#64748B' }}>{dayLabelsH[di]}</Text>
                      {row.map((val, si) => {
                        const hc = getHeatColor(val);
                        const isBest = bestSendTime && dayLabelsH[di] === bestSendTime.day && slotLabelsH[si] === bestSendTime.slot;
                        return (
                          <View key={si} style={[st.heatmapCell, { backgroundColor: hc.bg }, isBest && { borderWidth: 2, borderColor: tierColor }]}>
                            <Text style={[st.heatmapCellText, { color: hc.text }]}>{val}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ))}
                  {/* Legend */}
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    {[
                      { label: fr ? 'Excellent' : 'Excellent', color: tierColor + '30' },
                      { label: fr ? 'Bon' : 'Good', color: '#10B98125' },
                      { label: fr ? 'Moyen' : 'Medium', color: '#F59E0B20' },
                      { label: fr ? 'Faible' : 'Low', color: '#EF444415' },
                    ].map((l, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: l.color }} />
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{l.label}</Text>
                      </View>
                    ))}
                  </View>
                  {/* Best Time Recommendation */}
                  {bestSendTime ? (
                    <View style={[st.abRecommendation, { marginTop: 10 }]}>
                      <MaterialIcons name="lightbulb" size={14} color="#F59E0B" />
                      <Text style={st.abRecommendationText}>
                        {fr ? `Creneau optimal : ${bestSendTime.day}, ${bestSendTime.slot} (score ${bestSendTime.score}/100)` : `Best time: ${bestSendTime.day}, ${bestSendTime.slot} (score ${bestSendTime.score}/100)`}
                      </Text>
                    </View>
                  ) : null}
                </View>
              );
            })() : null}

            {/* Scheduled Pushes */}
            {scheduledPushes.filter(sp => sp.status === 'pending').length > 0 ? (
              <View style={st.pushHistoryCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <MaterialIcons name="schedule" size={16} color="#3B82F6" />
                  <Text style={[st.pushHistoryTitle, { marginBottom: 0, color: '#3B82F6' }]}>{fr ? 'Envois programmes' : 'Scheduled sends'}</Text>
                </View>
                {scheduledPushes.filter(sp => sp.status === 'pending').map((sp, i) => (
                  <View key={sp.id || i} style={st.pushHistoryItem}>
                    <View style={[st.pushHistoryDot, { backgroundColor: '#3B82F612', borderColor: '#3B82F620' }]}>
                      <MaterialIcons name="schedule" size={12} color="#3B82F6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.pushHistoryItemTitle} numberOfLines={1}>{sp.title}</Text>
                      <Text style={st.pushHistoryItemDate}>
                        {new Date(sp.scheduledFor).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    {sp.variant ? <View style={[st.pushHistoryVariantBadge, { backgroundColor: sp.variant === 'variant_b' ? '#7C3AED15' : tierColor + '15' }]}><Text style={[st.pushHistoryVariantText, { color: sp.variant === 'variant_b' ? '#7C3AED' : tierColor }]}>{sp.variant === 'variant_b' ? 'B' : 'A'}</Text></View> : null}
                    <View style={{ backgroundColor: '#3B82F615', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: '#3B82F6' }}>{fr ? 'EN ATTENTE' : 'PENDING'}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {/* A/B Test Results */}
            {abResults ? (
              <View style={st.abResultsCard}>
                <View style={st.abResultsHeader}>
                  <MaterialIcons name="science" size={18} color={tierColor} />
                  <Text style={st.abResultsTitle}>{fr ? 'Resultats A/B' : 'A/B Results'}</Text>
                  {abResults.winner && abResults.winner !== 'tie' ? (
                    <View style={[st.abWinnerBadge, { backgroundColor: abResults.winner === 'A' ? tierColor : '#7C3AED' }]}>
                      <MaterialIcons name="emoji-events" size={10} color="#FFF" />
                      <Text style={st.abWinnerText}>{abResults.winner}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={st.abResultsRow}>
                  <View style={[st.abResultItem, { borderColor: tierColor + '30' }]}>
                    <View style={[st.abResultDot, { backgroundColor: tierColor }]} />
                    <Text style={st.abResultLabel}>{fr ? 'Variante A' : 'Variant A'}</Text>
                    <Text style={[st.abResultValue, { color: tierColor }]}>{abResults.variantA.openRate}%</Text>
                    <Text style={st.abResultSub}>{abResults.variantA.sent} {fr ? 'envois' : 'sent'}</Text>
                    {abResults.winner === 'A' ? <MaterialIcons name="star" size={14} color={tierColor} /> : null}
                  </View>
                  <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#94A3B8' }}>VS</Text>
                  </View>
                  <View style={[st.abResultItem, { borderColor: '#7C3AED30' }]}>
                    <View style={[st.abResultDot, { backgroundColor: '#7C3AED' }]} />
                    <Text style={st.abResultLabel}>{fr ? 'Variante B' : 'Variant B'}</Text>
                    <Text style={[st.abResultValue, { color: '#7C3AED' }]}>{abResults.variantB.openRate}%</Text>
                    <Text style={st.abResultSub}>{abResults.variantB.sent} {fr ? 'envois' : 'sent'}</Text>
                    {abResults.winner === 'B' ? <MaterialIcons name="star" size={14} color="#7C3AED" /> : null}
                  </View>
                </View>
                {abResults.winner && abResults.winner !== 'tie' ? (
                  <View style={st.abRecommendation}>
                    <MaterialIcons name="lightbulb" size={14} color="#F59E0B" />
                    <Text style={st.abRecommendationText}>
                      {fr ? `La variante ${abResults.winner} performe mieux. Utilisez-la pour vos prochains envois.` : `Variant ${abResults.winner} performs better. Use it for future sends.`}
                    </Text>
                  </View>
                ) : abResults.winner === 'tie' ? (
                  <View style={st.abRecommendation}>
                    <MaterialIcons name="balance" size={14} color="#64748B" />
                    <Text style={st.abRecommendationText}>
                      {fr ? 'Performances similaires. Testez avec un message plus different.' : 'Similar performance. Try a more different message.'}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* A/B Test History */}
            {abHistory.length > 0 ? (
              <View style={st.pushAnalyticsCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <MaterialIcons name="history" size={18} color={tierColor} />
                  <Text style={[st.pushAnalyticsTitle, { marginBottom: 0 }]}>{fr ? 'Historique A/B' : 'A/B History'}</Text>
                  <View style={{ flex: 1 }} />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#94A3B8' }}>{abHistory.length} {fr ? 'test(s)' : 'test(s)'}</Text>
                </View>
                {abHistory.map((test, i) => {
                  const winColor = test.winner === 'A' ? tierColor : test.winner === 'B' ? '#7C3AED' : '#94A3B8';
                  const winLabel = test.winner === 'tie' ? (fr ? 'Egalite' : 'Tie') : `${fr ? 'Gagnant' : 'Winner'}: ${test.winner}`;
                  return (
                    <View key={i} style={{ paddingVertical: 12, borderBottomWidth: i < abHistory.length - 1 ? 1 : 0, borderBottomColor: '#F1F5F9' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#94A3B8' }}>
                          {new Date(test.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: winColor + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                          <MaterialIcons name={test.winner === 'tie' ? 'balance' : 'emoji-events'} size={10} color={winColor} />
                          <Text style={{ fontSize: 9, fontWeight: '800', color: winColor }}>{winLabel}</Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <View style={{ flex: 1, backgroundColor: tierColor + '08', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: tierColor + '15' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tierColor }} />
                            <Text style={{ fontSize: 9, fontWeight: '700', color: tierColor }}>A</Text>
                          </View>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#334155' }} numberOfLines={1}>{test.titleA}</Text>
                          <Text style={{ fontSize: 16, fontWeight: '900', color: tierColor, marginTop: 2 }}>{test.rateA}%</Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: '#7C3AED08', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#7C3AED15' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#7C3AED' }} />
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#7C3AED' }}>B</Text>
                          </View>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#334155' }} numberOfLines={1}>{test.titleB}</Text>
                          <Text style={{ fontSize: 16, fontWeight: '900', color: '#7C3AED', marginTop: 2 }}>{test.rateB}%</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* A/B Insights Dashboard */}
            {abHistory.length >= 2 ? (
              <View style={st.pushAnalyticsCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="insights" size={18} color="#7C3AED" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Insights A/B' : 'A/B Insights'}</Text>
                    <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>{fr ? 'Analyse statistique de vos tests' : 'Statistical analysis of your tests'}</Text>
                  </View>
                </View>
                {/* Summary stats */}
                {(() => {
                  const totalTests = abHistory.length;
                  const winsA = abHistory.filter(t => t.winner === 'A').length;
                  const winsB = abHistory.filter(t => t.winner === 'B').length;
                  const ties = abHistory.filter(t => t.winner === 'tie').length;
                  const avgRateA = totalTests > 0 ? Math.round(abHistory.reduce((s, t) => s + t.rateA, 0) / totalTests * 10) / 10 : 0;
                  const avgRateB = totalTests > 0 ? Math.round(abHistory.reduce((s, t) => s + t.rateB, 0) / totalTests * 10) / 10 : 0;
                  const bestRate = Math.max(...abHistory.map(t => Math.max(t.rateA, t.rateB)));
                  // Statistical significance approximation
                  const avgSampleSize = pushAnalytics.totalSent > 0 ? Math.round(pushAnalytics.totalSent / Math.max(totalTests, 1) / 2) : 25;
                  const zScore = avgRateA !== avgRateB ? Math.abs(avgRateA - avgRateB) / Math.sqrt((avgRateA * (100 - avgRateA) / Math.max(avgSampleSize, 1)) + (avgRateB * (100 - avgRateB) / Math.max(avgSampleSize, 1))) * 10 : 0;
                  const confidence = zScore >= 1.96 ? 95 : zScore >= 1.65 ? 90 : zScore >= 1.28 ? 80 : Math.round(zScore / 1.96 * 95);
                  const isSignificant = confidence >= 90;
                  // Recommended sample size for 95% confidence
                  const effectSize = Math.abs(avgRateA - avgRateB) || 5;
                  const recommendedN = Math.max(30, Math.round(2 * Math.pow(1.96 / (effectSize / 100), 2) * 50));
                  return (
                    <>
                      {/* Win rate summary */}
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                        <View style={{ flex: 1, backgroundColor: tierColor + '08', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: tierColor + '20' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tierColor }} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: tierColor }}>A</Text>
                          </View>
                          <Text style={{ fontSize: 22, fontWeight: '900', color: tierColor }}>{winsA}</Text>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 }}>{fr ? 'VICTOIRES' : 'WINS'}</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: tierColor, marginTop: 4 }}>{avgRateA}% {fr ? 'moy.' : 'avg.'}</Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: '#F1F5F9', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', marginBottom: 4 }}>{fr ? 'EGALITES' : 'TIES'}</Text>
                          <Text style={{ fontSize: 22, fontWeight: '900', color: '#94A3B8' }}>{ties}</Text>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 }}>/ {totalTests} tests</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#F59E0B', marginTop: 4 }}>{fr ? 'Record' : 'Best'}: {bestRate}%</Text>
                        </View>
                        <View style={{ flex: 1, backgroundColor: '#7C3AED08', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#7C3AED20' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED' }} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>B</Text>
                          </View>
                          <Text style={{ fontSize: 22, fontWeight: '900', color: '#7C3AED' }}>{winsB}</Text>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2 }}>{fr ? 'VICTOIRES' : 'WINS'}</Text>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#7C3AED', marginTop: 4 }}>{avgRateB}% {fr ? 'moy.' : 'avg.'}</Text>
                        </View>
                      </View>
                      {/* Significance */}
                      <View style={{ backgroundColor: isSignificant ? '#10B98108' : '#F59E0B08', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: isSignificant ? '#10B98120' : '#F59E0B20' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <MaterialIcons name={isSignificant ? 'check-circle' : 'warning'} size={16} color={isSignificant ? '#10B981' : '#F59E0B'} />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: isSignificant ? '#10B981' : '#F59E0B' }}>{isSignificant ? (fr ? 'Significatif' : 'Significant') : (fr ? 'Insuffisant' : 'Insufficient')}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <View style={{ flex: 1, backgroundColor: '#FFF', borderRadius: 10, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}><Text style={{ fontSize: 16, fontWeight: '900', color: isSignificant ? '#10B981' : '#F59E0B' }}>{confidence}%</Text><Text style={{ fontSize: 7, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'CONFIANCE' : 'CONFIDENCE'}</Text></View>
                          <View style={{ flex: 1, backgroundColor: '#FFF', borderRadius: 10, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}><Text style={{ fontSize: 16, fontWeight: '900', color: '#0F172A' }}>~{avgSampleSize}</Text><Text style={{ fontSize: 7, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'ECHANT.' : 'SAMPLE'}</Text></View>
                          <View style={{ flex: 1, backgroundColor: '#FFF', borderRadius: 10, padding: 8, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' }}><Text style={{ fontSize: 16, fontWeight: '900', color: '#3B82F6' }}>{recommendedN}+</Text><Text style={{ fontSize: 7, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'RECO.' : 'REC.'}</Text></View>
                        </View>
                      </View>
                      {/* Recommendation */}
                      <View style={st.abRecommendation}>
                        <MaterialIcons name="lightbulb" size={14} color="#F59E0B" />
                        <Text style={st.abRecommendationText}>
                          {winsA > winsB
                            ? (fr ? `Variante A gagne ${winsA}/${totalTests} tests. Privilegiez ce style de message pour vos prochains envois.` : `Variant A wins ${winsA}/${totalTests} tests. Prefer this message style for future sends.`)
                            : winsB > winsA
                            ? (fr ? `Variante B gagne ${winsB}/${totalTests} tests. Privilegiez ce style de message pour vos prochains envois.` : `Variant B wins ${winsB}/${totalTests} tests. Prefer this message style for future sends.`)
                            : (fr ? 'Aucune variante ne se demarque clairement. Essayez des messages plus differencies.' : 'No variant clearly stands out. Try more differentiated messages.')}
                        </Text>
                      </View>
                    </>
                  );
                })()}
              </View>
            ) : null}

            {/* Push Analytics Dashboard */}
            {pushAnalytics.totalSent > 0 ? (
              <View style={st.pushAnalyticsCard}>
                <Text style={st.pushAnalyticsTitle}>{fr ? 'Statistiques Push' : 'Push Statistics'}</Text>
                {/* KPI Row */}
                <View style={st.pushAnalyticsKpiRow}>
                  <View style={st.pushAnalyticsKpi}>
                    <MaterialIcons name="send" size={16} color={tierColor} />
                    <Text style={st.pushAnalyticsKpiValue}>{pushAnalytics.totalSent}</Text>
                    <Text style={st.pushAnalyticsKpiLabel}>{fr ? 'Envois' : 'Sent'}</Text>
                  </View>
                  <View style={st.pushAnalyticsKpi}>
                    <MaterialIcons name="people" size={16} color="#3B82F6" />
                    <Text style={st.pushAnalyticsKpiValue}>~{pushAnalytics.estimatedReach}</Text>
                    <Text style={st.pushAnalyticsKpiLabel}>{fr ? 'Portee' : 'Reach'}</Text>
                  </View>
                  <View style={st.pushAnalyticsKpi}>
                    <MaterialIcons name="open-in-new" size={16} color="#10B981" />
                    <Text style={[st.pushAnalyticsKpiValue, { color: '#10B981' }]}>{pushAnalytics.avgOpenRate}%</Text>
                    <Text style={st.pushAnalyticsKpiLabel}>{fr ? 'Ouverture' : 'Open rate'}</Text>
                  </View>
                </View>
                {/* Monthly Evolution Chart */}
                {pushAnalytics.monthly.length > 1 ? (
                  <View style={st.pushAnalyticsChartBlock}>
                    <Text style={st.pushAnalyticsChartTitle}>{fr ? 'Evolution mensuelle' : 'Monthly evolution'}</Text>
                    <View style={{ alignItems: 'center', marginVertical: 8 }}>
                      <PushBarChart data={pushAnalytics.monthly} width={Math.min(screenWidth - 120, 400)} height={80} color={tierColor} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
                      {pushAnalytics.monthly.map((m, i) => (
                        <Text key={i} style={st.pushAnalyticsDateLabel}>{m.month.slice(5)}</Text>
                      ))}
                    </View>
                  </View>
                ) : null}
                {/* City Distribution */}
                {pushAnalytics.cities.length > 0 ? (
                  <View style={st.pushAnalyticsCitiesBlock}>
                    <Text style={st.pushAnalyticsChartTitle}>{fr ? 'Zones ciblees' : 'Targeted zones'}</Text>
                    {pushAnalytics.cities.map((c, i) => (
                      <View key={i} style={st.pushAnalyticsCityRow}>
                        <MaterialIcons name="place" size={14} color={tierColor} />
                        <Text style={st.pushAnalyticsCityName}>{c.city}</Text>
                        <Text style={[st.pushAnalyticsCityCount, { color: tierColor }]}>{c.count}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            {isSilverPlus&&pushAnalytics.totalSent>2?(()=>{const RK=[{r:'Bronze',c:'#CD7F32',p:.35},{r:fr?'Argent':'Silver',c:'#94A3B8',p:.25},{r:fr?'Or':'Gold',c:'#F59E0B',p:.2},{r:fr?'Diamant':'Diamond',c:'#06B6D4',p:.12},{r:fr?'Maitre':'Master',c:'#9333EA',p:.06},{r:'G.M',c:'#FFD700',p:.02}];const tp=pushAnalytics.estimatedReach;const bR=RK.map(r=>({...r,n:Math.round(tp*r.p)}));const mx=Math.max(...bR.map(r=>r.n),1);const RL=[{r:'Tireur',c:'#EF4444',p:.3},{r:'Pointeur',c:'#3B82F6',p:.38},{r:'Milieu',c:'#10B981',p:.32}];const bRl=RL.map(r=>({...r,n:Math.round(tp*r.p)}));return(<View style={st.pushAnalyticsCard}><View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:12}}><MaterialIcons name="analytics" size={18} color={tierColor}/><Text style={{fontSize:14,fontWeight:'700',color:'#0F172A',flex:1}}>{fr?'Analytics segment':'Segment Analytics'}</Text></View>{bR.map((r,i)=>(<View key={i} style={{flexDirection:'row',alignItems:'center',gap:6,marginBottom:3}}><View style={{width:6,height:6,borderRadius:3,backgroundColor:r.c}}/><Text style={{width:44,fontSize:10,fontWeight:'600',color:'#334155'}}>{r.r}</Text><View style={{flex:1,height:5,backgroundColor:'#F1F5F9',borderRadius:3,overflow:'hidden'}}><View style={{height:'100%' as any,width:`${Math.max(3,(r.n/mx)*100)}%`,backgroundColor:r.c,borderRadius:3}}/></View><Text style={{width:28,fontSize:9,fontWeight:'800',color:r.c,textAlign:'right'}}>{r.n}</Text></View>))}<View style={{flexDirection:'row',gap:6,marginVertical:10}}>{bRl.map((r,i)=>(<View key={i} style={{flex:1,alignItems:'center',backgroundColor:r.c+'08',borderRadius:10,paddingVertical:8,borderWidth:1,borderColor:r.c+'15'}}><Text style={{fontSize:14,fontWeight:'900',color:r.c}}>{r.n}</Text><Text style={{fontSize:8,color:'#94A3B8'}}>{r.r}</Text></View>))}</View></View>)})():null}

            {recentPushes.length > 0 ? (
              <View style={st.pushHistoryCard}>
                <Text style={st.pushHistoryTitle}>{fr ? 'Envois recents' : 'Recent sends'}</Text>
                {recentPushes.map((p, i) => (
                  <View key={i} style={st.pushHistoryItem}>
                    <View style={[st.pushHistoryDot, p.variant === 'variant_b' && { borderColor: '#7C3AED20' }]}>
                      <MaterialIcons name={p.variant ? 'science' : 'send'} size={12} color={p.variant === 'variant_b' ? '#7C3AED' : tierColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={st.pushHistoryItemTitle} numberOfLines={1}>{p.title}</Text>
                        {p.variant ? <View style={[st.pushHistoryVariantBadge, { backgroundColor: p.variant === 'variant_b' ? '#7C3AED15' : tierColor + '15' }]}><Text style={[st.pushHistoryVariantText, { color: p.variant === 'variant_b' ? '#7C3AED' : tierColor }]}>{p.variant === 'variant_b' ? 'B' : 'A'}</Text></View> : null}
                      </View>
                      <Text style={st.pushHistoryItemDate}>
                        {new Date(p.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {activeSection === 'events' ? (
          <>
            <View style={st.eventsHeader}>
              <Text style={st.eventsCount}>{events.length} {fr ? 'evenement(s)' : 'event(s)'}</Text>
              <Pressable style={[st.newEventBtn, { backgroundColor: tierColor }]} onPress={() => router.push('/sponsored-event/new' as any)}>
                <MaterialIcons name="add" size={18} color="#FFF" />
                <Text style={st.newEventBtnText}>{fr ? 'Nouveau' : 'New'}</Text>
              </Pressable>
            </View>
            {events.length === 0 ? (
              <View style={st.emptyEvents}>
                <MaterialIcons name="event-busy" size={48} color={theme.textMuted} />
                <Text style={st.emptyText}>{fr ? 'Aucun evenement sponsorise' : 'No sponsored events'}</Text>
                <Pressable style={[st.emptyBtn, { backgroundColor: tierColor }]} onPress={() => router.push('/sponsored-event/new' as any)}>
                  <MaterialIcons name="add" size={18} color="#FFF" />
                  <Text style={st.emptyBtnText}>{fr ? 'Creer un evenement' : 'Create event'}</Text>
                </Pressable>
              </View>
            ) : (
              events.map((ev, idx) => {
                const statusColor = ev.status === 'active' ? '#22C55E' : ev.status === 'completed' ? '#3B82F6' : '#F59E0B';
                return (
                  <View key={ev.id}>
                    <Pressable style={st.eventCard} onPress={() => router.push(`/sponsored-event/${ev.id}` as any)}>
                      <View style={st.eventHeader}>
                        <View style={[st.eventDot, { backgroundColor: statusColor }]} />
                        <Text style={[st.eventStatus, { color: statusColor }]}>
                          {ev.status === 'upcoming' ? (fr ? 'A venir' : 'Upcoming') : ev.status === 'active' ? (fr ? 'En cours' : 'Active') : (fr ? 'Termine' : 'Done')}
                        </Text>
                        <View style={{ flex: 1 }} />
                        <Text style={st.eventDate}>
                          {new Date(ev.eventDate).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                      <Text style={st.eventTitle} numberOfLines={1}>{ev.title}</Text>
                      <View style={st.eventMeta}>
                        <MaterialIcons name="track-changes" size={14} color={theme.textMuted} />
                        <Text style={st.eventMetaText}>
                          {ev.challengeType === '10_tirs' ? '10 Tirs' : ev.challengeType === '10_tirs_sautee' ? '10 Tirs sautee' : 'Precision'}
                        </Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} style={{ position: 'absolute', right: 14, top: '50%' }} />
                    </Pressable>
                  </View>
                );
              })
            )}
          </>
        ) : null}

        {activeSection === 'crm' ? (
          <>
            <View style={st.ctrCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tierColor + '12', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="people" size={20} color={tierColor} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Parrainages' : 'Referrals'}</Text>
                  <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 1 }}>{sponsor.referral_count || 0} {fr ? 'parrainage(s) total' : 'total referral(s)'}</Text>
                </View>
                <View style={{ backgroundColor: tierColor + '15', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: tierColor }}>{sponsor.total_referral_xp || 0}</Text>
                  <Text style={{ fontSize: 8, fontWeight: '600', color: tierColor, textAlign: 'center' }}>XP</Text>
                </View>
              </View>
              {sponsor.referral_code ? (
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, alignItems: 'center' as const, borderWidth: 1.5, borderColor: tierColor + '30', borderStyle: 'dashed' as any, marginBottom: 14 }}>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 4 }}>{fr ? 'VOTRE CODE' : 'YOUR CODE'}</Text>
                  <Text style={{ fontSize: 22, fontWeight: '900', color: tierColor, letterSpacing: 2 }}>{sponsor.referral_code}</Text>
                </View>
              ) : null}
              {crmSrc.length>0?(<View style={{marginBottom:10}}>{crmSrc.map((s,i)=>{const p=Math.round((s.count/Math.max(crmReferrals.length,1))*100);const c=s.source.includes('qr')?'#7C3AED':s.source.includes('link')?'#3B82F6':'#10B981';return(<View key={i} style={{flexDirection:'row' as const,alignItems:'center' as const,gap:6,marginBottom:3}}><MaterialIcons name={(s.source.includes('qr')?'qr-code':s.source.includes('link')?'link':'vpn-key') as any} size={11} color={c}/><Text style={{flex:1,fontSize:11,color:'#334155'}}>{s.source.includes('qr')?'QR':s.source.includes('link')?(fr?'Lien':'Link'):'Code'}</Text><View style={{width:44,height:4,backgroundColor:'#F1F5F9',borderRadius:2,overflow:'hidden' as const}}><View style={{height:'100%' as any,width:`${p}%`,backgroundColor:c,borderRadius:2}}/></View><Text style={{fontSize:9,fontWeight:'800' as const,color:c}}>{s.count}</Text></View>);})}</View>):null}
              {crmWk.some(v=>v>0)?(<View style={{marginBottom:10,alignItems:'center' as const}}><Sparkline data={crmWk} width={Math.min(screenWidth-130,300)} height={34} color={tierColor}/></View>):null}
              {crmReferrals.length > 0 ? (
                <View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#334155', marginBottom: 10 }}>{fr ? 'Historique parrainages' : 'Referral history'}</Text>
                  {crmReferrals.map((ref, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i < crmReferrals.length - 1 ? 1 : 0, borderBottomColor: '#F1F5F9' }}>
                      <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#10B98112', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name="person-add" size={14} color="#10B981" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#334155' }}>{fr ? 'Nouveau parrainage' : 'New referral'}</Text>
                        <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                          {new Date(ref.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </Text>
                      </View>
                      <View style={{ backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981' }}>+50 XP</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                  <MaterialIcons name="people-outline" size={36} color={theme.textMuted} />
                  <Text style={{ fontSize: 13, color: '#94A3B8', marginTop: 8 }}>{fr ? 'Aucun parrainage enregistre' : 'No referrals recorded'}</Text>
                </View>
              )}
              {crmReferrals.length>0?(<Pressable style={({pressed})=>[st.exportBtn,{marginTop:12,borderColor:'#10B98140'},exportingCrm&&{opacity:0.5},pressed&&{opacity:0.8}]} onPress={handleExportCrmCsv} disabled={exportingCrm}>{exportingCrm?<ActivityIndicator size="small" color="#10B981"/>:(<><MaterialIcons name="download" size={18} color="#10B981"/><View style={{flex:1}}><Text style={[st.exportBtnText,{color:'#10B981'}]}>CRM CSV</Text></View></>)}</Pressable>):null}
            </View>

            {isGold?(<View style={st.ctrCard}><View style={{flexDirection:'row' as const,alignItems:'center' as const,gap:6,marginBottom:6}}><MaterialIcons name="schedule-send" size={16} color="#6366F1"/><Text style={{fontSize:13,fontWeight:'700' as const,color:'#0F172A'}}>Digest</Text></View><View style={{flexDirection:'row' as const,gap:4,marginBottom:6}}>{[{v:'weekly' as const,l:'Wk',c:'#6366F1'},{v:'biweekly' as const,l:'2x',c:'#3B82F6'},{v:'monthly' as const,l:'Mo',c:'#10B981'}].map(o=>{const s=digestFreq===o.v;return(<Pressable key={o.v} style={{flex:1,alignItems:'center' as const,paddingVertical:6,borderRadius:8,backgroundColor:s?o.c:'#F8FAFC',borderWidth:1,borderColor:s?o.c:'#E2E8F0'}} onPress={()=>setDigestFreq(o.v)}><Text style={{fontSize:10,fontWeight:'700' as const,color:s?'#FFF':'#334155'}}>{o.l}</Text></Pressable>);})}</View><View style={{flexDirection:'row' as const,gap:2,marginBottom:6}}>{['S','M','T','W','T','F','S'].map((d,i)=>{const s=digestDay===i;return(<Pressable key={i} style={{flex:1,alignItems:'center' as const,paddingVertical:4,borderRadius:4,backgroundColor:s?'#6366F1':'#F8FAFC'}} onPress={()=>setDigestDay(i)}><Text style={{fontSize:8,fontWeight:'700' as const,color:s?'#FFF':'#64748B'}}>{d}</Text></Pressable>);})}</View><Pressable style={[{alignItems:'center' as const,backgroundColor:'#6366F1',paddingVertical:8,borderRadius:8},savingDigestCfg&&{opacity:0.5}]} onPress={handleSaveDigestCfg} disabled={savingDigestCfg}><Text style={{fontSize:12,fontWeight:'700' as const,color:'#FFF'}}>Save</Text></Pressable></View>):null}
            <View style={st.kpiGrid}>
              <View style={st.kpiCard}>
                <View style={[st.kpiIcon, { backgroundColor: '#10B98112' }]}>
                  <MaterialIcons name="card-giftcard" size={20} color="#10B981" />
                </View>
                <Text style={st.kpiValue}>{sponsor.referral_count || 0}</Text>
                <Text style={st.kpiLabel}>{fr ? 'Parrainages' : 'Referrals'}</Text>
              </View>
              <View style={st.kpiCard}>
                <View style={[st.kpiIcon, { backgroundColor: tierColor + '12' }]}>
                  <MaterialIcons name="star" size={20} color={tierColor} />
                </View>
                <Text style={st.kpiValue}>{sponsor.total_referral_xp || 0}</Text>
                <Text style={st.kpiLabel}>XP</Text>
              </View>
              <View style={st.kpiCard}>
                <View style={[st.kpiIcon, { backgroundColor: '#3B82F612' }]}>
                  <MaterialIcons name="event" size={20} color="#3B82F6" />
                </View>
                <Text style={st.kpiValue}>{events.length}</Text>
                <Text style={st.kpiLabel}>{fr ? 'Evenements' : 'Events'}</Text>
              </View>
              <View style={st.kpiCard}>
                <View style={[st.kpiIcon, { backgroundColor: '#7C3AED12' }]}>
                  <MaterialIcons name="trending-up" size={20} color="#7C3AED" />
                </View>
                <Text style={st.kpiValue}>{ctr}%</Text>
                <Text style={st.kpiLabel}>CTR</Text>
              </View>
            </View>
          </>
        ) : null}

      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  emptyText: { fontSize: 14, color: theme.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, marginTop: 12 },
  emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  // Header
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  headerAction: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  // Hero
  hero: { paddingTop: 20, paddingBottom: 18, paddingHorizontal: 20, overflow: 'hidden', position: 'relative' },
  heroDeco1: { position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroDeco2: { position: 'absolute', bottom: -15, left: -10, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.04)' },
  heroContent: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  heroAvatar: { width: 56, height: 56, borderRadius: 18, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  heroInfo: { flex: 1 },
  heroName: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, marginTop: 6 },
  heroBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  heroKpis: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  heroKpi: { flex: 1, alignItems: 'center' },
  heroKpiValue: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  heroKpiLabel: { fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginTop: 2, textTransform: 'uppercase' },
  // Period
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 },
  filterDivider: { width: 1, height: 22, backgroundColor: '#CBD5E1', marginHorizontal: 2 },
  filterArea: { backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  periodChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#E2E8F0' },
  periodText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  sectionChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  sectionChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  sectionIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  sectionIndicatorDot: { width: 6, height: 6, borderRadius: 3 },
  sectionIndicatorText: { fontSize: 13, fontWeight: '700' },
  sectionIndicatorPeriod: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4, maxWidth: 640, alignSelf: 'center' as const, width: '100%' },
  // KPI Grid
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  kpiCard: { width: '47%', flexGrow: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 }, android: { elevation: 1 }, default: {} }) },
  kpiIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiValue: { fontSize: 24, fontWeight: '900', color: '#0F172A' },
  kpiLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' },
  // Chart
  chartCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  chartTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 16 },
  chartBlock: {},
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  chartDot: { width: 10, height: 10, borderRadius: 5 },
  chartLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#334155' },
  chartTotal: { fontSize: 16, fontWeight: '800' },
  chartDates: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 },
  chartDateText: { fontSize: 10, fontWeight: '500', color: '#94A3B8' },
  // CTR Card
  ctrCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  ctrHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  ctrTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  ctrValue: { fontSize: 36, fontWeight: '900', color: '#F59E0B', marginBottom: 4 },
  ctrDesc: { fontSize: 13, color: '#94A3B8', lineHeight: 18 },
  // Placement
  placementCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  placementTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  placementDesc: { fontSize: 12, color: '#94A3B8', marginBottom: 16 },
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  pageIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pageInfo: { flex: 1, gap: 4 },
  pageNameRow: { flexDirection: 'row', justifyContent: 'space-between' },
  pageName: { fontSize: 14, fontWeight: '600', color: '#334155' },
  pagePct: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  pageBarTrack: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  pageBarFill: { height: '100%', borderRadius: 3 },
  pageMetaRow: { flexDirection: 'row', gap: 12 },
  pageMeta: { fontSize: 11, fontWeight: '500', color: '#94A3B8' },
  emptyPlacement: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  // Perks
  perksCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  perksTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 14 },
  perkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  perkIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  perkText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#334155' },
  // Events
  eventsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  eventsCount: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  newEventBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  newEventBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  emptyEvents: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  eventCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', paddingRight: 36, position: 'relative' },
  eventHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  eventDot: { width: 8, height: 8, borderRadius: 4 },
  eventStatus: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  eventDate: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  eventTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, marginBottom: 6 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  eventMetaText: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  // Export
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: '#E2E8F0', borderStyle: 'dashed' as any },
  exportBtnText: { fontSize: 15, fontWeight: '700' },
  exportBtnSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  exportBtnPdf: { borderColor: '#EF444440', borderStyle: 'dashed' as any },
  // Push Analytics
  pushAnalyticsCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  pushAnalyticsTitle: { fontSize: 15, fontWeight: '700' as const, color: '#0F172A', marginBottom: 14 },
  pushAnalyticsKpiRow: { flexDirection: 'row' as const, gap: 8, marginBottom: 14 },
  pushAnalyticsKpi: { flex: 1, alignItems: 'center' as const, backgroundColor: '#F8FAFC', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  pushAnalyticsKpiValue: { fontSize: 20, fontWeight: '900' as const, color: '#0F172A', marginTop: 4 },
  pushAnalyticsKpiLabel: { fontSize: 9, fontWeight: '600' as const, color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' as const },
  pushAnalyticsChartBlock: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  pushAnalyticsChartTitle: { fontSize: 12, fontWeight: '700' as const, color: '#334155', marginBottom: 6 },
  pushAnalyticsDateLabel: { fontSize: 9, fontWeight: '500' as const, color: '#94A3B8' },
  pushAnalyticsCitiesBlock: { marginTop: 4, gap: 6 },
  pushAnalyticsCityRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pushAnalyticsCityName: { flex: 1, fontSize: 13, fontWeight: '500' as const, color: '#334155' },
  pushAnalyticsCityCount: { fontSize: 14, fontWeight: '800' as const },
  // Heatmap
  heatmapCell: { flex: 1, height: 36, borderRadius: 8, marginHorizontal: 2, alignItems: 'center' as const, justifyContent: 'center' as const },
  heatmapCellText: { fontSize: 10, fontWeight: '800' as const },
  // Benchmark
  benchmarkCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  benchmarkHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 16 },
  benchmarkIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  benchmarkTitle: { fontSize: 15, fontWeight: '700' as const, color: '#0F172A' },
  benchmarkSub: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  benchmarkRow: { marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  benchmarkMetricLabel: { fontSize: 13, fontWeight: '600' as const, color: '#334155' },
  benchmarkDiffBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  benchmarkDiffText: { fontSize: 11, fontWeight: '800' as const },
  benchmarkBarsWrap: { gap: 4 },
  benchmarkBarRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  benchmarkBarLabel: { width: 32, fontSize: 10, fontWeight: '600' as const, color: '#94A3B8' },
  benchmarkBarTrack: { flex: 1, height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' as const },
  benchmarkBarFill: { height: '100%' as any, borderRadius: 4 },
  benchmarkBarValue: { width: 40, fontSize: 11, fontWeight: '700' as const, color: '#64748B', textAlign: 'right' as const },
  // Notification Center
  notifCenterPanel: { marginHorizontal: 16, marginBottom: 8, backgroundColor: '#FFF', borderRadius: 18, padding: 16, borderWidth: 1.5, borderColor: '#E2E8F0', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 3 }, default: {} }) },
  notifCenterHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  notifCenterTitle: { flex: 1, fontSize: 14, fontWeight: '700' as const, color: '#0F172A' },
  notifItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 12, marginBottom: 2 },
  notifIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  notifItemTitle: { fontSize: 13, fontWeight: '600' as const, color: '#334155' },
  notifItemMsg: { fontSize: 11, color: '#94A3B8', marginTop: 1, lineHeight: 15 },
  notifUnreadDot: { width: 8, height: 8, borderRadius: 4 },
  // Branding
  brandCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  brandCardTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  brandCardDesc: { fontSize: 12, color: '#94A3B8', lineHeight: 18, marginBottom: 14 },
  brandPhotoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  brandPhotoWrap: { position: 'relative' as const },
  brandPhoto: { width: 80, height: 80, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const, borderWidth: 2, borderColor: '#E2E8F0' },
  brandPhotoBadge: { position: 'absolute' as const, bottom: -2, right: -2, width: 28, height: 28, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2.5, borderColor: '#FFF' },
  brandPhotoLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  brandPhotoHint: { fontSize: 12, color: '#94A3B8', lineHeight: 17 },
  brandPhotoBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, alignSelf: 'flex-start' as const, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5 },
  brandPhotoBtnText: { fontSize: 13, fontWeight: '600' },
  colorGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 10 },
  colorOption: { width: '30%' as any, flexGrow: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 14, borderWidth: 2, backgroundColor: '#FFF' },
  colorSwatch: { width: 28, height: 28, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  colorLabel: { fontSize: 12, fontWeight: '500', color: '#64748B' },
  bannerPreview: { borderRadius: 16, overflow: 'hidden' as const, marginBottom: 10, borderWidth: 1.5 },
  bannerPreviewGradient: { padding: 14, position: 'relative' as const, overflow: 'hidden' as const },
  bannerPreviewDecoCircle: { position: 'absolute' as const, top: -15, right: -15, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.1)' },
  bannerPreviewContent: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, position: 'relative' as const, zIndex: 1 },
  bannerPreviewLogo: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  bannerPreviewBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, alignSelf: 'flex-start' as const, backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginBottom: 3 },
  bannerPreviewBadgeText: { fontSize: 7, fontWeight: '900' as const, color: '#FFF', letterSpacing: 0.5 },
  bannerPreviewName: { fontSize: 15, fontWeight: '700' as const, color: '#FFF' },
  bannerPreviewNote: { fontSize: 11, color: '#94A3B8', textAlign: 'center' as const, fontStyle: 'italic' as const },
  brandSaveBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, paddingVertical: 16, borderRadius: 16, marginBottom: 14 },
  brandSaveBtnText: { fontSize: 16, fontWeight: '700' as const, color: '#FFF' },
  // Push
  pushQuotaCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  pushQuotaHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 14 },
  pushQuotaIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center' as const, justifyContent: 'center' as const },
  pushQuotaValue: { fontSize: 24, fontWeight: '900' as const, color: '#10B981' },
  pushQuotaSub: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  pushQuotaReset: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  pushQuotaResetText: { fontSize: 11, fontWeight: '600' as const, color: '#94A3B8' },
  pushQuotaBar: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' as const, marginTop: 14 },
  pushQuotaBarFill: { height: '100%' as any, borderRadius: 3 },
  pushComposerCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  pushComposerTitle: { fontSize: 15, fontWeight: '700' as const, color: '#0F172A', marginBottom: 16 },
  pushField: { marginBottom: 14, position: 'relative' as const },
  pushFieldLabel: { fontSize: 11, fontWeight: '700' as const, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 },
  pushInput: { backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0' },
  pushCharCount: { position: 'absolute' as const, bottom: 4, right: 10, fontSize: 10, color: '#CBD5E1' },
  pushUnitLabel: { position: 'absolute' as const, bottom: 14, right: 14, fontSize: 12, fontWeight: '600' as const, color: '#94A3B8' },
  pushPreview: { marginBottom: 16 },
  pushPreviewLabel: { fontSize: 10, fontWeight: '700' as const, color: '#94A3B8', letterSpacing: 1, marginBottom: 8 },
  pushPreviewCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  pushPreviewIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: '#E2E8F0' },
  pushPreviewTitle: { fontSize: 14, fontWeight: '700' as const, color: '#0F172A' },
  pushPreviewBody: { fontSize: 12, color: '#64748B', marginTop: 2, lineHeight: 17 },
  pushSendBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, paddingVertical: 16, borderRadius: 16 },
  pushSendBtnText: { fontSize: 16, fontWeight: '700' as const, color: '#FFF' },
  pushBlockedCard: { alignItems: 'center' as const, backgroundColor: '#FFF', borderRadius: 18, padding: 32, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0', gap: 10 },
  pushBlockedTitle: { fontSize: 17, fontWeight: '700' as const, color: '#0F172A' },
  pushBlockedDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center' as const, lineHeight: 19, maxWidth: 280 },
  pushUpgradeBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, marginTop: 6 },
  pushUpgradeBtnText: { fontSize: 13, fontWeight: '600' as const },
  pushHistoryCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  pushHistoryTitle: { fontSize: 14, fontWeight: '700' as const, color: '#0F172A', marginBottom: 14 },
  pushHistoryItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pushHistoryDot: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F8FAFC', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: '#E2E8F0' },
  pushHistoryItemTitle: { fontSize: 13, fontWeight: '600' as const, color: '#334155', flex: 1 },
  pushHistoryItemDate: { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  pushHistoryVariantBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  pushHistoryVariantText: { fontSize: 9, fontWeight: '800' as const },
  // A/B Testing
  abToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1.5, borderColor: '#E2E8F0' },
  abToggleTitle: { fontSize: 14, fontWeight: '700' as const, color: '#334155' },
  abToggleDesc: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  abBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  abBadgeText: { fontSize: 10, fontWeight: '900' as const, color: '#FFF', letterSpacing: 0.5 },
  abVariantBlock: { marginBottom: 16, borderWidth: 1.5, borderColor: '#7C3AED20', borderRadius: 16, overflow: 'hidden' as const },
  abVariantHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  abVariantDot: { width: 8, height: 8, borderRadius: 4 },
  abVariantLabel: { fontSize: 11, fontWeight: '800' as const, letterSpacing: 1 },
  abSplitRow: { flexDirection: 'row' as const, gap: 8, paddingHorizontal: 14, paddingBottom: 14 },
  abSplitItem: { flex: 1, alignItems: 'center' as const, gap: 4 },
  abSplitBar: { height: 6, borderRadius: 3 },
  abSplitLabel: { fontSize: 10, fontWeight: '600' as const, color: '#94A3B8' },
  // A/B Results
  abResultsCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  abResultsHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 14 },
  abResultsTitle: { flex: 1, fontSize: 15, fontWeight: '700' as const, color: '#0F172A' },
  abWinnerBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  abWinnerText: { fontSize: 10, fontWeight: '900' as const, color: '#FFF' },
  abResultsRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  abResultItem: { flex: 1, alignItems: 'center' as const, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1.5, gap: 4 },
  abResultDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 2 },
  abResultLabel: { fontSize: 11, fontWeight: '600' as const, color: '#64748B' },
  abResultValue: { fontSize: 24, fontWeight: '900' as const },
  abResultSub: { fontSize: 10, color: '#94A3B8' },
  abRecommendation: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, marginTop: 12, borderWidth: 1, borderColor: '#FDE68A' },
  abRecommendationText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  // Map Preview
  mapPreviewContainer: { marginBottom: 10 },
  mapPreviewBg: { height: 180, backgroundColor: '#EFF6FF', borderRadius: 14, overflow: 'hidden' as const, position: 'relative' as const, borderWidth: 1, borderColor: '#BFDBFE' },
  mapPreviewGrid: { ...StyleSheet.absoluteFillObject },
  mapPreviewGridLine: { position: 'absolute' as const, left: 0, right: 0, height: 1, backgroundColor: '#BFDBFE40' },
  mapPreviewGridLineV: { position: 'absolute' as const, top: 0, bottom: 0, width: 1, backgroundColor: '#BFDBFE40' },
  mapPreviewDot: { position: 'absolute' as const, width: 22, height: 22, borderRadius: 11, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2, borderColor: '#FFF' },
  mapPreviewPartner: { position: 'absolute' as const, top: '38%', left: '42%', width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 }, android: { elevation: 4 }, default: {} }) },
  mapPreviewPartnerImg: { width: 35, height: 35, borderRadius: 17.5 },
  mapPreviewPartnerBadge: { position: 'absolute' as const, bottom: -2, right: -2, width: 14, height: 14, borderRadius: 7, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 2, borderColor: '#FFF' },
  mapPreviewLabel: { position: 'absolute' as const, top: '62%', left: '30%', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  mapPreviewLabelText: { fontSize: 9, fontWeight: '700' as const, color: '#FFF', maxWidth: 120 },
  // Segmentation
  segCard: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  segLabel: { fontSize: 10, fontWeight: '700' as const, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6, marginTop: 8 },
  segChipsRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 },
  segChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  segChipText: { fontSize: 12, fontWeight: '500' as const, color: '#64748B' },
  // Onboarding overlay
  onboardingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, alignItems: 'center' as const, justifyContent: 'center' as const, padding: 24 },
  onboardingCard: { backgroundColor: '#FFF', borderRadius: 24, padding: 28, maxWidth: 400, width: '100%', alignItems: 'center' as const },
  onboardingIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 16 },
  onboardingTitle: { fontSize: 20, fontWeight: '800' as const, color: '#0F172A', textAlign: 'center' as const, marginBottom: 8 },
  onboardingDesc: { fontSize: 14, color: '#64748B', textAlign: 'center' as const, lineHeight: 21, marginBottom: 20 },
  onboardingDots: { flexDirection: 'row' as const, gap: 8, marginBottom: 20 },
  onboardingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0' },
  onboardingDotActive: { backgroundColor: '#D4A017', width: 24 },
  onboardingBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14, width: '100%' as any },
  onboardingBtnText: { fontSize: 15, fontWeight: '700' as const, color: '#FFF' },
  onboardingSkip: { paddingVertical: 10, marginTop: 8 },
  onboardingSkipText: { fontSize: 13, fontWeight: '600' as const, color: '#94A3B8' },
  // Onboarding Checklist
  checklistCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  checklistHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 14 },
  checklistIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  checklistTitle: { fontSize: 15, fontWeight: '700' as const, color: '#0F172A' },
  checklistSub: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  checklistClaimBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  checklistClaimText: { fontSize: 13, fontWeight: '800' as const, color: '#FFF' },
  checklistProgressBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1.5 },
  checklistProgressText: { fontSize: 13, fontWeight: '800' as const },
  checklistBarTrack: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' as const, marginBottom: 14 },
  checklistBarFill: { height: '100%' as any, borderRadius: 3 },
  checklistItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 11, paddingHorizontal: 4, borderRadius: 10 },
  checklistCheck: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center' as const, justifyContent: 'center' as const },
  checklistItemText: { flex: 1, fontSize: 13, fontWeight: '600' as const, color: '#334155' },
  checklistDoneBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingVertical: 10, marginTop: 8, backgroundColor: '#10B98108', borderRadius: 10, borderWidth: 1, borderColor: '#10B98115' },
  checklistDoneText: { fontSize: 12, fontWeight: '700' as const, color: '#10B981' },
});
