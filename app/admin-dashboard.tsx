/**
 * Admin Dashboard
 *
 * Unified admin home page with key stats from all admin sections:
 * - Pending reports, active bans
 * - Total terrains, users
 * - Announcements sent
 * - Maintenance status
 * - Quick navigation to each admin section
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
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import * as Haptics from '@/services/haptics';

// Animations removed for admin performance
const NoAnimView = ({ entering, ...props }: any) => <View {...props} />;
const Animated = { View: NoAnimView };
const _noop: any = () => _noop; _noop.duration = _noop; _noop.delay = _noop; _noop.springify = _noop; _noop.damping = _noop;
const FadeInDown = _noop; const FadeIn = _noop; const FadeInUp = _noop;
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { getSupabaseClient } from '@/template';
import { AdminActivityLog, ACTION_CONFIG } from '@/services/adminActivityLogService';
import { getEloRank } from '@/services/eloService';
import { logAdminAction } from '@/services/adminActivityLogService';
import { useAlert } from '@/template';
import { FunctionsHttpError } from '@supabase/supabase-js';

import AsyncStorage from '@react-native-async-storage/async-storage';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import AdminSearchModal from '@/components/feature/AdminSearchModal';
import AdminGuard from '@/components/feature/AdminGuard';
import { OnboardingAnalytics, StepAnalytics } from '@/services/onboardingAnalyticsService';
import PageErrorBoundary from '@/components/ui/PageErrorBoundary';
import { DashboardSkeleton } from '@/components/ui/AdminSkeleton';
import { useAdminCache } from '@/hooks/useAdminCache';


interface TransferStats {
  pending: number;
  accepted: number;
  declined: number;
  expired: number;
  acceptanceRate: number;
  avgResponseTimeHours: number;
  weeklyEvolution: { week: string; count: number; accepted: number; declined: number }[];
  topSenders: { name: string; count: number; accepted: number; userId: string }[];
  recent: { id: string; playerName: string; senderName: string; recipientName: string; status: string; matchCount: number; challengeCount: number; createdAt: string }[];
}

interface DashboardStats {
  totalUsers: number;
  premiumUsers: number;
  totalPlayers: number;
  totalTerrains: number;
  totalClubs: number;
  verifiedClubs: number;
  totalMatches: number;
  pendingReports: number;
  activeWarnings: number;
  activeBans: number;
  totalAnnouncements: number;
  flaggedPlayers: number;
  maintenanceActive: boolean;
  maintenanceScheduled: boolean;
  pendingAppeals: number;
  overdueAppeals: number;
}

interface UnverifiedClub {
  id: string;
  name: string;
  city: string;
  membersCount: number;
  description: string | null;
  address: string | null;
  contactEmail: string | null;
  isPublic: boolean;
}

const INITIAL_STATS: DashboardStats = {
  totalUsers: 0, premiumUsers: 0, totalPlayers: 0, totalTerrains: 0,
  totalClubs: 0, verifiedClubs: 0, totalMatches: 0, pendingReports: 0, activeWarnings: 0,
  activeBans: 0, totalAnnouncements: 0, flaggedPlayers: 0,
  maintenanceActive: false, maintenanceScheduled: false, pendingAppeals: 0, overdueAppeals: 0,
};



export default function AdminDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { showAlert } = useAlert();
  const fr = language === 'fr';

  const adminCache = useAdminCache();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<DashboardStats>(INITIAL_STATS);

  // Lazy loading phases: load critical data first, then secondary
  const [phase, setPhase] = useState<'critical' | 'secondary' | 'done'>('critical');
  const [activityLogs, setActivityLogs] = useState<AdminActivityLog[]>([]);

  // Statistics data
  const [weeklyMatches, setWeeklyMatches] = useState<{ week: string; count: number }[]>([]);
  const [eloDistribution, setEloDistribution] = useState<{ tier: string; count: number; color: string; label: string }[]>([]);
  const [recentSignups, setRecentSignups] = useState<number>(0);
  const [monthlyGrowth, setMonthlyGrowth] = useState<{ month: string; count: number }[]>([]);
  const [growthDelta, setGrowthDelta] = useState<number>(0);

  // Club verification
  const [unverifiedClubs, setUnverifiedClubs] = useState<UnverifiedClub[]>([]);
  const [verifyingClubId, setVerifyingClubId] = useState<string | null>(null);
  const [showClubVerification, setShowClubVerification] = useState(false);
  const [exportingGrowth, setExportingGrowth] = useState(false);
  const [sendingAppealPush, setSendingAppealPush] = useState(false);

  // Widget visibility (persisted)
  const [widgetVisibility, setWidgetVisibility] = useState<Record<string, boolean>>({
    overview: true, moderation: true, appeals: true, activity: true,
    weeklyMatches: true, userGrowth: true, clubVerification: true, eloDistribution: true, navigation: true,
  });
  const [showWidgetSettings, setShowWidgetSettings] = useState(false);

  // Smart alerts
  const [smartAlerts, setSmartAlerts] = useState<{ id: string; severity: 'critical' | 'warning' | 'info'; title: string; message: string; icon: string; color: string; route?: string }[]>([]);
  const [adminNotifCount, setAdminNotifCount] = useState(0);

  // Push analytics
  const [pushStats, setPushStats] = useState({ sent: 0, errors: 0, types: {} as Record<string, number>, daily: [] as { date: string; sent: number; errors: number }[] });

  // Receipt delivery stats
  const [receiptStats, setReceiptStats] = useState<{ checked: number; delivered: number; failed: number; deliveryRate: number; tokensDeactivated: number; history: { date: string; rate: number }[] }>({ checked: 0, delivered: 0, failed: 0, deliveryRate: 0, tokensDeactivated: 0, history: [] });
  const [receiptLoading, setReceiptLoading] = useState(false);

  // Push delivery heatmap (hour-of-day distribution)
  const [pushHourlyData, setPushHourlyData] = useState<{ hour: number; count: number; platformBreakdown: Record<string, number> }[]>([]);

  // Push token analytics
  const [pushTokenStats, setPushTokenStats] = useState<{ totalTokens: number; activeTokens: number; inactiveTokens: number; usersWithToken: number; coverage: number; deactivatedThisWeek: number; platforms: Record<string, number> }>({ totalTokens: 0, activeTokens: 0, inactiveTokens: 0, usersWithToken: 0, coverage: 0, deactivatedThisWeek: 0, platforms: {} });

  // Onboarding analytics
  const [onboardingStats, setOnboardingStats] = useState<{ total: number; withProfile: number; withConsent: number; withRole: number; conversionRate: number; avgDaysToProfile: number }>({ total: 0, withProfile: 0, withConsent: 0, withRole: 0, conversionRate: 0, avgDaysToProfile: 0 });

  // Onboarding step-level analytics
  const [stepAnalytics, setStepAnalytics] = useState<OnboardingAnalytics | null>(null);

  // PDF export
  const [exportingPdf, setExportingPdf] = useState(false);

  // Club health alerts
  const [decliningClubs, setDecliningClubs] = useState<{ id: string; name: string; city: string; score: number; prevScore: number; delta: number; color: string }[]>([]);

  // Search modal
  const [showSearch, setShowSearch] = useState(false);

  // Transfer CSV export
  const [exportingTransfers, setExportingTransfers] = useState(false);
  const [exportingTransferPdf, setExportingTransferPdf] = useState(false);

  // Transfer reminder
  const [sendingTransferReminder, setSendingTransferReminder] = useState(false);
  const [lastTransferReminder, setLastTransferReminder] = useState<string | null>(null);
  const [remindedTransferIds, setRemindedTransferIds] = useState<Set<string>>(new Set());
  const [sendingUrgentReminder, setSendingUrgentReminder] = useState(false);

  // Transfer archive
  const [showArchive, setShowArchive] = useState(false);
  const [archiveData, setArchiveData] = useState<any[]>([]);
  const [loadingArchive, setLoadingArchive] = useState(false);
  const [archiveCount, setArchiveCount] = useState(0);
  const [exportingArchiveCsv, setExportingArchiveCsv] = useState(false);
  const [purgingArchive, setPurgingArchive] = useState(false);
  const [archiveSearchText, setArchiveSearchText] = useState('');
  const [archiveFilterStatus, setArchiveFilterStatus] = useState<'all' | 'accepted' | 'declined' | 'expired'>('all');
  const [archiveDateField, setArchiveDateField] = useState<'created' | 'archived'>('archived');
  const [archiveDateFrom, setArchiveDateFrom] = useState('');
  const [archiveDateTo, setArchiveDateTo] = useState('');

  // Transfer filters
  const [rawTransferData, setRawTransferData] = useState<any[]>([]);
  const [transferProfileMap, setTransferProfileMap] = useState<Record<string, string>>({});
  const [transferFilterStatus, setTransferFilterStatus] = useState<'all' | 'pending' | 'accepted' | 'declined' | 'expired'>('all');
  const [transferFilterPeriod, setTransferFilterPeriod] = useState<'all' | '7d' | '30d' | '3m'>('all');
  const [transferFilterSender, setTransferFilterSender] = useState<string | null>(null);

  // Transfer stats
  const [transferStats, setTransferStats] = useState<TransferStats>({ pending: 0, accepted: 0, declined: 0, expired: 0, acceptanceRate: 0, avgResponseTimeHours: 0, weeklyEvolution: [], topSenders: [], recent: [] });

  // Widget order (persisted)
  const DEFAULT_ORDER = ['overview', 'smartAlerts', 'transfers', 'clubHealthAlerts', 'onboarding', 'pushAnalytics', 'receiptDelivery', 'pushTokenAnalytics', 'moderation', 'appeals', 'activity', 'weeklyMatches', 'userGrowth', 'clubVerification', 'eloDistribution'];
  const [widgetOrder, setWidgetOrder] = useState<string[]>(DEFAULT_ORDER);

  // Load widget preferences + order
  useEffect(() => {
    AsyncStorage.getItem('admin_transfer_last_reminder').then(val => {
      if (val) setLastTransferReminder(val);
    }).catch(() => {});
    AsyncStorage.getItem('admin_transfer_reminded_ids').then(val => {
      if (val) try { setRemindedTransferIds(new Set(JSON.parse(val))); } catch { /* silent */ }
    }).catch(() => {});
    AsyncStorage.getItem('admin_widget_prefs').then(val => {
      if (val) try { setWidgetVisibility(JSON.parse(val)); } catch { /* silent */ }
    }).catch(() => {});
    AsyncStorage.getItem('admin_widget_order').then(val => {
      if (val) try {
        const parsed = JSON.parse(val);
        // Accept saved order even if length differs (new widgets added)
        const merged = [...parsed, ...DEFAULT_ORDER.filter(k => !parsed.includes(k))];
        setWidgetOrder(merged);
      } catch { /* silent */ }
    }).catch(() => {});
  }, []);

  const toggleWidget = useCallback((key: string) => {
    Haptics.selectionAsync();
    setWidgetVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      AsyncStorage.setItem('admin_widget_prefs', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const moveWidget = useCallback((key: string, direction: 'up' | 'down') => {
    Haptics.selectionAsync();
    setWidgetOrder(prev => {
      const idx = prev.indexOf(key);
      if (idx < 0) return prev;
      const newIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      AsyncStorage.setItem('admin_widget_order', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const sendAppealDeadlinePush = useCallback(async () => {
    if (sendingAppealPush || stats.overdueAppeals === 0) return;
    setSendingAppealPush(true);
    try {
      const supabase = getSupabaseClient();
      await supabase.functions.invoke('send-push', {
        body: {
          type: 'appeal_deadline',
          payload: {
            overdueCount: stats.overdueAppeals,
            oldestAppealDays: 2,
          },
        },
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(fr ? 'Rappel envoye' : 'Reminder sent', fr ? 'Notification envoyee a tous les admins' : 'Notification sent to all admins');
    } catch (e) {
      console.log('[Dashboard] Appeal push error:', e);
    }
    setSendingAppealPush(false);
  }, [sendingAppealPush, stats.overdueAppeals, fr, showAlert]);

  const loadStats = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();

      // ── Single edge function call replaces 16+ parallel queries ──
      const { data, error } = await supabase.functions.invoke('admin-stats', { body: {} });

      if (error) {
        let errorMessage = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const textContent = await error.context?.text();
            errorMessage = textContent || error.message;
          } catch { /* silent */ }
        }
        console.log('[AdminDashboard] Edge function error:', errorMessage);
        return;
      }

      if (!data) {
        console.log('[AdminDashboard] No data returned from admin-stats');
        return;
      }

      // ── Map server response to local state ──
      const res = data as any;
      const serverStats = res.stats;

      // Cache the raw response for other admin pages
      adminCache.setCached('admin-stats-response', res, 30000);

      // Update shared stats for cross-page access
      adminCache.setSharedStats({
        pendingReports: serverStats.pendingReports || 0,
        activeBans: serverStats.activeBans || 0,
        flaggedPlayers: serverStats.flaggedPlayers || 0,
        totalUsers: serverStats.totalUsers || 0,
        premiumUsers: serverStats.premiumUsers || 0,
        totalClubs: serverStats.totalClubs || 0,
        verifiedClubs: serverStats.verifiedClubs || 0,
        totalTerrains: serverStats.totalTerrains || 0,
        totalMatches: serverStats.totalMatches || 0,
        totalPlayers: serverStats.totalPlayers || 0,
      });

      setStats({
        totalUsers: serverStats.totalUsers || 0,
        premiumUsers: serverStats.premiumUsers || 0,
        totalPlayers: serverStats.totalPlayers || 0,
        totalTerrains: serverStats.totalTerrains || 0,
        totalClubs: serverStats.totalClubs || 0,
        verifiedClubs: serverStats.verifiedClubs || 0,
        totalMatches: serverStats.totalMatches || 0,
        pendingReports: serverStats.pendingReports || 0,
        activeWarnings: serverStats.activeWarnings || 0,
        activeBans: serverStats.activeBans || 0,
        totalAnnouncements: serverStats.totalAnnouncements || 0,
        flaggedPlayers: serverStats.flaggedPlayers || 0,
        maintenanceActive: serverStats.maintenanceActive || false,
        maintenanceScheduled: serverStats.maintenanceScheduled || false,
        pendingAppeals: serverStats.pendingAppeals || 0,
        overdueAppeals: serverStats.overdueAppeals || 0,
      });

      // Weekly matches (server returns en-US labels; re-localize if fr)
      const wm = (res.weeklyMatches || []) as { week: string; count: number }[];
      setWeeklyMatches(wm);

      // ELO distribution
      const elo = res.eloDistribution || { bronze: 0, silver: 0, gold: 0, diamond: 0, master: 0 };
      setEloDistribution([
        { tier: 'master', count: elo.master, color: '#F59E0B', label: fr ? 'Maitre' : 'Master' },
        { tier: 'diamond', count: elo.diamond, color: '#8B5CF6', label: fr ? 'Diamant' : 'Diamond' },
        { tier: 'gold', count: elo.gold, color: '#D4A017', label: fr ? 'Or' : 'Gold' },
        { tier: 'silver', count: elo.silver, color: '#94A3B8', label: fr ? 'Argent' : 'Silver' },
        { tier: 'bronze', count: elo.bronze, color: '#CD7F32', label: 'Bronze' },
      ]);

      // Monthly growth
      setMonthlyGrowth(res.monthlyGrowth || []);
      setGrowthDelta(res.growthDelta || 0);
      setRecentSignups(res.recentSignups || 0);

      // Unverified clubs
      setUnverifiedClubs((res.unverifiedClubs || []).map((c: any) => ({
        id: c.id, name: c.name, city: c.city, membersCount: c.membersCount || 0,
        description: c.description || null, address: c.address || null,
        contactEmail: c.contactEmail || null, isPublic: c.isPublic || false,
      })));

      // Push analytics
      setPushStats(res.pushAnalytics || { sent: 0, errors: 0, types: {}, daily: [] });

      // Receipt delivery stats (from check_push_receipts cron results)
      if (res.receiptStats) setReceiptStats(res.receiptStats);

      // Push token analytics
      if (res.pushTokenAnalytics) setPushTokenStats(res.pushTokenAnalytics);

      // Activity logs
      setActivityLogs((res.activityLogs || []).map((l: any) => ({
        id: l.id, adminUserId: l.adminUserId, adminName: l.adminName,
        actionType: l.actionType, actionDetail: l.actionDetail,
        targetType: l.targetType, targetId: l.targetId, targetName: l.targetName,
        metadata: l.metadata || {}, createdAt: l.createdAt,
      })));

      // Declining clubs
      setDecliningClubs(res.decliningClubs || []);

      // Fetch announcement timestamps for push delivery heatmap
      try {
        const { data: annHeatmapData } = await supabase.from('announcements').select('created_at, push_sent_count, platform_breakdown').eq('status', 'sent').order('created_at', { ascending: false }).limit(100);
        if (annHeatmapData && annHeatmapData.length > 0) {
          const hourMap = new Map<number, { count: number; platforms: Record<string, number> }>();
          for (let h = 0; h < 24; h++) hourMap.set(h, { count: 0, platforms: {} });
          annHeatmapData.forEach((a: any) => {
            const hour = new Date(a.created_at).getHours();
            const entry = hourMap.get(hour)!;
            entry.count += (a.push_sent_count || 1);
            if (a.platform_breakdown) {
              Object.entries(a.platform_breakdown).forEach(([p, c]) => {
                entry.platforms[p] = (entry.platforms[p] || 0) + (c as number);
              });
            }
          });
          setPushHourlyData(Array.from(hourMap.entries()).map(([hour, data]) => ({ hour, count: data.count, platformBreakdown: data.platforms })));
        }
      } catch { /* silent */ }

      // Player transfers (client-side fetch since not in edge function)
      try {
        const { data: transferData } = await supabase.from('player_transfer_requests').select('id, player_name, sender_user_id, recipient_user_id, status, match_count, challenge_count, created_at, updated_at').order('created_at', { ascending: false }).limit(100);
        if (transferData && transferData.length > 0) {
          const pendingT = transferData.filter((t: any) => t.status === 'pending').length;
          const acceptedT = transferData.filter((t: any) => t.status === 'accepted').length;
          const declinedT = transferData.filter((t: any) => t.status === 'declined').length;
          const expiredT = transferData.filter((t: any) => t.status === 'expired').length;
          const resolved = acceptedT + declinedT;
          const acceptanceRate = resolved > 0 ? Math.round((acceptedT / resolved) * 100) : 0;

          // Average response time (hours) for non-pending requests
          let totalResponseMs = 0;
          let responseCount = 0;
          transferData.forEach((t: any) => {
            if (t.status !== 'pending' && t.updated_at && t.created_at) {
              const diff = new Date(t.updated_at).getTime() - new Date(t.created_at).getTime();
              if (diff > 0) { totalResponseMs += diff; responseCount++; }
            }
          });
          const avgResponseTimeHours = responseCount > 0 ? Math.round((totalResponseMs / responseCount / 3600000) * 10) / 10 : 0;

          // Weekly evolution (last 6 weeks)
          const weeklyMap: Record<string, { count: number; accepted: number; declined: number }> = {};
          const now = Date.now();
          transferData.forEach((t: any) => {
            const created = new Date(t.created_at);
            const weeksAgo = Math.floor((now - created.getTime()) / (7 * 86400000));
            if (weeksAgo < 6) {
              const weekStart = new Date(now - weeksAgo * 7 * 86400000);
              const label = weekStart.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
              if (!weeklyMap[label]) weeklyMap[label] = { count: 0, accepted: 0, declined: 0 };
              weeklyMap[label].count++;
              if (t.status === 'accepted') weeklyMap[label].accepted++;
              if (t.status === 'declined') weeklyMap[label].declined++;
            }
          });
          const weeklyEvolution = Object.entries(weeklyMap).map(([week, d]) => ({ week, ...d })).reverse();

          // Top senders
          const senderMap: Record<string, { count: number; accepted: number; userId: string }> = {};
          transferData.forEach((t: any) => {
            if (!senderMap[t.sender_user_id]) senderMap[t.sender_user_id] = { count: 0, accepted: 0, userId: t.sender_user_id };
            senderMap[t.sender_user_id].count++;
            if (t.status === 'accepted') senderMap[t.sender_user_id].accepted++;
          });

          const userIds = [...new Set(transferData.flatMap((t: any) => [t.sender_user_id, t.recipient_user_id]))];
          const { data: profiles } = await supabase.from('user_profiles').select('id, username, email').in('id', userIds);
          const profileMap: Record<string, string> = {};
          (profiles || []).forEach((p: any) => { profileMap[p.id] = p.username || p.email || '?'; });

          // Store raw data for client-side filtering
          setRawTransferData(transferData);
          setTransferProfileMap(profileMap);

          const topSenders = Object.values(senderMap)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5)
            .map(s2 => ({ name: profileMap[s2.userId] || '?', count: s2.count, accepted: s2.accepted, userId: s2.userId }));

          setTransferStats({
            pending: pendingT, accepted: acceptedT, declined: declinedT, expired: expiredT,
            acceptanceRate, avgResponseTimeHours, weeklyEvolution, topSenders,
            recent: transferData.slice(0, 10).map((t: any) => ({
              id: t.id, playerName: t.player_name, senderName: profileMap[t.sender_user_id] || '?',
              recipientName: profileMap[t.recipient_user_id] || '?', status: t.status,
              matchCount: t.match_count || 0, challengeCount: t.challenge_count || 0, createdAt: t.created_at,
            })),
          });
        }
      } catch { /* silent - RLS may block if not admin */ }

      // Archive count
      try {
        const { count: arcCount } = await supabase.from('player_transfer_archives').select('id', { count: 'exact', head: true });
        setArchiveCount(arcCount || 0);
      } catch { /* silent */ }

      // Onboarding
      if (res.onboardingStats) setOnboardingStats(res.onboardingStats);
      if (res.onboardingAnalytics) setStepAnalytics(res.onboardingAnalytics);

      // ── Smart alerts (computed client-side from server data) ──
      const detectedAlerts: typeof smartAlerts = [];
      const pendingCount = serverStats.pendingReports || 0;
      if (pendingCount >= 5) detectedAlerts.push({ id: 'report_spike', severity: 'critical', title: fr ? 'Pic de signalements' : 'Report spike', message: fr ? `${pendingCount} signalements en attente. Intervention recommandee.` : `${pendingCount} pending reports. Action recommended.`, icon: 'warning', color: '#DC2626', route: '/admin-moderation' });
      else if (pendingCount >= 3) detectedAlerts.push({ id: 'reports_pending', severity: 'warning', title: fr ? 'Signalements en attente' : 'Pending reports', message: fr ? `${pendingCount} signalement(s) a traiter.` : `${pendingCount} report(s) to review.`, icon: 'gavel', color: '#D97706', route: '/admin-moderation' });

      if (wm.length >= 2) {
        const thisW = wm[wm.length - 1]?.count || 0;
        const lastW = wm[wm.length - 2]?.count || 0;
        if (lastW > 0 && thisW < lastW * 0.7) detectedAlerts.push({ id: 'match_decline', severity: 'warning', title: fr ? 'Baisse d\'activite matchs' : 'Match activity decline', message: fr ? `${thisW} matchs cette semaine vs ${lastW} la semaine derniere (-${Math.round((1 - thisW / lastW) * 100)}%)` : `${thisW} matches this week vs ${lastW} last week (-${Math.round((1 - thisW / lastW) * 100)}%)`, icon: 'trending-down', color: '#EF4444' });
      }

      const unverifiedCount = (res.unverifiedClubs || []).length;
      const totalClubsCount = serverStats.totalClubs || 1;
      const inactiveClubsPct = totalClubsCount > 0 ? Math.round((unverifiedCount / totalClubsCount) * 100) : 0;
      if (inactiveClubsPct > 50) detectedAlerts.push({ id: 'unverified_clubs', severity: 'info', title: fr ? 'Clubs non verifies' : 'Unverified clubs', message: fr ? `${inactiveClubsPct}% des clubs ne sont pas verifies.` : `${inactiveClubsPct}% of clubs are not verified.`, icon: 'pending', color: '#D97706', route: '/admin-clubs' });
      if ((res.recentSignups || 0) === 0) detectedAlerts.push({ id: 'no_signups', severity: 'info', title: fr ? 'Aucune inscription recente' : 'No recent signups', message: fr ? 'Aucun nouvel utilisateur cette semaine.' : 'No new users this week.', icon: 'person-off', color: '#94A3B8' });
      const overdueCount = serverStats.overdueAppeals || 0;
      if (overdueCount > 0) detectedAlerts.push({ id: 'overdue_appeals', severity: 'critical', title: fr ? 'Appels en retard' : 'Overdue appeals', message: fr ? `${overdueCount} appel(s) en attente depuis +48h.` : `${overdueCount} appeal(s) pending for 48h+.`, icon: 'timer-off', color: '#DC2626', route: '/admin-moderation' });
      if (unverifiedCount > 5 && inactiveClubsPct > 60) detectedAlerts.push({ id: 'declining_clubs', severity: 'warning', title: fr ? 'Clubs a risque' : 'At-risk clubs', message: fr ? `${inactiveClubsPct}% des clubs ne sont pas verifies. Examinez les tendances de sante.` : `${inactiveClubsPct}% of clubs are unverified. Review health trends.`, icon: 'trending-down', color: '#D97706', route: '/admin-clubs' });

      // Delivery rate smart alert: check if rate < 80% for 3+ consecutive entries in receipt history
      const rHistory = res.receiptStats?.history || [];
      if (rHistory.length >= 3) {
        const lastThree = rHistory.slice(-3);
        const allBelow80 = lastThree.every((h: any) => h.rate < 80);
        if (allBelow80) {
          const avgRate = Math.round(lastThree.reduce((s: number, h: any) => s + h.rate, 0) / lastThree.length);
          detectedAlerts.push({ id: 'delivery_rate_critical', severity: 'critical', title: fr ? 'Taux de livraison push critique' : 'Critical push delivery rate', message: fr ? `Taux moyen de ${avgRate}% sur les 3 derniers jours (< 80%). Verifiez les tokens invalides et la configuration push.` : `Average ${avgRate}% delivery rate over last 3 days (< 80%). Check invalid tokens and push config.`, icon: 'mark-email-unread', color: '#DC2626' });
        }
      } else if (res.receiptStats && res.receiptStats.checked > 0 && res.receiptStats.deliveryRate < 80) {
        detectedAlerts.push({ id: 'delivery_rate_low', severity: 'warning', title: fr ? 'Taux de livraison push bas' : 'Low push delivery rate', message: fr ? `${res.receiptStats.deliveryRate}% de livraison (seuil: 80%). ${res.receiptStats.tokensDeactivated} tokens desactives.` : `${res.receiptStats.deliveryRate}% delivery (threshold: 80%). ${res.receiptStats.tokensDeactivated} tokens deactivated.`, icon: 'mark-email-unread', color: '#D97706' });
      }

      setSmartAlerts(detectedAlerts);
      setAdminNotifCount(detectedAlerts.filter(a => a.severity === 'critical' || a.severity === 'warning').length + (serverStats.pendingAppeals || 0) + pendingCount);

    } catch (e) {
      console.log('[AdminDashboard] Error loading stats:', e);
    } finally {
      setLoading(false);
      setPhase('done');
    }
  }, []);

  // Try to restore from cache first for instant render, then refresh
  useEffect(() => {
    const cached = adminCache.getCached<any>('admin-stats-response');
    if (cached && adminCache.sharedStatsAge < 30000) {
      // Restore from cache instantly — skip loading state
      const res = cached;
      const serverStats = res.stats;
      setStats({
        totalUsers: serverStats.totalUsers || 0,
        premiumUsers: serverStats.premiumUsers || 0,
        totalPlayers: serverStats.totalPlayers || 0,
        totalTerrains: serverStats.totalTerrains || 0,
        totalClubs: serverStats.totalClubs || 0,
        verifiedClubs: serverStats.verifiedClubs || 0,
        totalMatches: serverStats.totalMatches || 0,
        pendingReports: serverStats.pendingReports || 0,
        activeWarnings: serverStats.activeWarnings || 0,
        activeBans: serverStats.activeBans || 0,
        totalAnnouncements: serverStats.totalAnnouncements || 0,
        flaggedPlayers: serverStats.flaggedPlayers || 0,
        maintenanceActive: serverStats.maintenanceActive || false,
        maintenanceScheduled: serverStats.maintenanceScheduled || false,
        pendingAppeals: serverStats.pendingAppeals || 0,
        overdueAppeals: serverStats.overdueAppeals || 0,
      });
      setWeeklyMatches(res.weeklyMatches || []);
      setRecentSignups(res.recentSignups || 0);
      setMonthlyGrowth(res.monthlyGrowth || []);
      setGrowthDelta(res.growthDelta || 0);
      if (res.pushAnalytics) setPushStats(res.pushAnalytics);
      if (res.pushTokenAnalytics) setPushTokenStats(res.pushTokenAnalytics);
      if (res.receiptStats) setReceiptStats(res.receiptStats);
      if (res.onboardingStats) setOnboardingStats(res.onboardingStats);
      if (res.onboardingAnalytics) setStepAnalytics(res.onboardingAnalytics);
      setLoading(false);
      setPhase('secondary');
      // Background refresh
      loadStats();
    } else {
      loadStats();
    }
  }, [loadStats]);

  // Recompute transfer stats when filters change
  useEffect(() => {
    if (rawTransferData.length === 0) return;
    const hasFilter = transferFilterStatus !== 'all' || transferFilterPeriod !== 'all' || transferFilterSender !== null;
    if (!hasFilter) {
      // Reset to unfiltered: recompute from raw data
      const pm = transferProfileMap;
      const all = rawTransferData;
      const pendingT = all.filter((t: any) => t.status === 'pending').length;
      const acceptedT = all.filter((t: any) => t.status === 'accepted').length;
      const declinedT = all.filter((t: any) => t.status === 'declined').length;
      const expiredT = all.filter((t: any) => t.status === 'expired').length;
      const resolved = acceptedT + declinedT;
      const acceptanceRate = resolved > 0 ? Math.round((acceptedT / resolved) * 100) : 0;
      let totalRMs = 0; let rcnt = 0;
      all.forEach((t: any) => { if (t.status !== 'pending' && t.updated_at && t.created_at) { const d = new Date(t.updated_at).getTime() - new Date(t.created_at).getTime(); if (d > 0) { totalRMs += d; rcnt++; } } });
      const avgH = rcnt > 0 ? Math.round((totalRMs / rcnt / 3600000) * 10) / 10 : 0;
      const wMap: Record<string, { count: number; accepted: number; declined: number }> = {};
      const nowMs = Date.now();
      all.forEach((t: any) => { const c = new Date(t.created_at); const wa = Math.floor((nowMs - c.getTime()) / (7 * 86400000)); if (wa < 6) { const ws = new Date(nowMs - wa * 7 * 86400000); const lb = ws.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' }); if (!wMap[lb]) wMap[lb] = { count: 0, accepted: 0, declined: 0 }; wMap[lb].count++; if (t.status === 'accepted') wMap[lb].accepted++; if (t.status === 'declined') wMap[lb].declined++; } });
      const sMap: Record<string, { count: number; accepted: number; userId: string }> = {};
      all.forEach((t: any) => { if (!sMap[t.sender_user_id]) sMap[t.sender_user_id] = { count: 0, accepted: 0, userId: t.sender_user_id }; sMap[t.sender_user_id].count++; if (t.status === 'accepted') sMap[t.sender_user_id].accepted++; });
      setTransferStats({ pending: pendingT, accepted: acceptedT, declined: declinedT, expired: expiredT, acceptanceRate, avgResponseTimeHours: avgH, weeklyEvolution: Object.entries(wMap).map(([w, d]) => ({ week: w, ...d })).reverse(), topSenders: Object.values(sMap).sort((a, b) => b.count - a.count).slice(0, 5).map(s2 => ({ name: pm[s2.userId] || '?', count: s2.count, accepted: s2.accepted, userId: s2.userId })), recent: all.slice(0, 10).map((t: any) => ({ id: t.id, playerName: t.player_name, senderName: pm[t.sender_user_id] || '?', recipientName: pm[t.recipient_user_id] || '?', status: t.status, matchCount: t.match_count || 0, challengeCount: t.challenge_count || 0, createdAt: t.created_at })) });
      return;
    }
    // Apply filters
    let filtered = [...rawTransferData];
    if (transferFilterStatus !== 'all') filtered = filtered.filter((t: any) => t.status === transferFilterStatus);
    const nowMs = Date.now();
    if (transferFilterPeriod === '7d') filtered = filtered.filter((t: any) => nowMs - new Date(t.created_at).getTime() < 7 * 86400000);
    else if (transferFilterPeriod === '30d') filtered = filtered.filter((t: any) => nowMs - new Date(t.created_at).getTime() < 30 * 86400000);
    else if (transferFilterPeriod === '3m') filtered = filtered.filter((t: any) => nowMs - new Date(t.created_at).getTime() < 90 * 86400000);
    if (transferFilterSender) filtered = filtered.filter((t: any) => t.sender_user_id === transferFilterSender);
    const pm = transferProfileMap;
    const pendingT = filtered.filter((t: any) => t.status === 'pending').length;
    const acceptedT = filtered.filter((t: any) => t.status === 'accepted').length;
    const declinedT = filtered.filter((t: any) => t.status === 'declined').length;
    const expiredT = filtered.filter((t: any) => t.status === 'expired').length;
    const resolved = acceptedT + declinedT;
    const acceptanceRate = resolved > 0 ? Math.round((acceptedT / resolved) * 100) : 0;
    let totalRMs = 0; let rcnt = 0;
    filtered.forEach((t: any) => { if (t.status !== 'pending' && t.updated_at && t.created_at) { const d = new Date(t.updated_at).getTime() - new Date(t.created_at).getTime(); if (d > 0) { totalRMs += d; rcnt++; } } });
    const avgH = rcnt > 0 ? Math.round((totalRMs / rcnt / 3600000) * 10) / 10 : 0;
    const wMap: Record<string, { count: number; accepted: number; declined: number }> = {};
    filtered.forEach((t: any) => { const c = new Date(t.created_at); const wa = Math.floor((nowMs - c.getTime()) / (7 * 86400000)); if (wa < 6) { const ws = new Date(nowMs - wa * 7 * 86400000); const lb = ws.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' }); if (!wMap[lb]) wMap[lb] = { count: 0, accepted: 0, declined: 0 }; wMap[lb].count++; if (t.status === 'accepted') wMap[lb].accepted++; if (t.status === 'declined') wMap[lb].declined++; } });
    const sMap: Record<string, { count: number; accepted: number; userId: string }> = {};
    filtered.forEach((t: any) => { if (!sMap[t.sender_user_id]) sMap[t.sender_user_id] = { count: 0, accepted: 0, userId: t.sender_user_id }; sMap[t.sender_user_id].count++; if (t.status === 'accepted') sMap[t.sender_user_id].accepted++; });
    setTransferStats({ pending: pendingT, accepted: acceptedT, declined: declinedT, expired: expiredT, acceptanceRate, avgResponseTimeHours: avgH, weeklyEvolution: Object.entries(wMap).map(([w, d]) => ({ week: w, ...d })).reverse(), topSenders: Object.values(sMap).sort((a, b) => b.count - a.count).slice(0, 5).map(s2 => ({ name: pm[s2.userId] || '?', count: s2.count, accepted: s2.accepted, userId: s2.userId })), recent: filtered.slice(0, 10).map((t: any) => ({ id: t.id, playerName: t.player_name, senderName: pm[t.sender_user_id] || '?', recipientName: pm[t.recipient_user_id] || '?', status: t.status, matchCount: t.match_count || 0, challengeCount: t.challenge_count || 0, createdAt: t.created_at })) });
  }, [rawTransferData, transferProfileMap, transferFilterStatus, transferFilterPeriod, transferFilterSender, fr]);

  const hasActiveTransferFilter = transferFilterStatus !== 'all' || transferFilterPeriod !== 'all' || transferFilterSender !== null;
  const resetTransferFilters = useCallback(() => { Haptics.selectionAsync(); setTransferFilterStatus('all'); setTransferFilterPeriod('all'); setTransferFilterSender(null); }, []);

  // Overdue transfers (pending > 7 days)
  const overdueTransfers = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 86400000;
    return rawTransferData.filter((t: any) => t.status === 'pending' && new Date(t.created_at).getTime() < sevenDaysAgo);
  }, [rawTransferData]);

  const unremindedOverdue = useMemo(() => {
    return overdueTransfers.filter((t: any) => !remindedTransferIds.has(t.id));
  }, [overdueTransfers, remindedTransferIds]);

  // Transfers approaching expiration (pending 25-30 days)
  const approachingExpiration = useMemo(() => {
    const twentyFiveDaysAgo = Date.now() - 25 * 86400000;
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    return rawTransferData.filter((t: any) => {
      const created = new Date(t.created_at).getTime();
      return t.status === 'pending' && created < twentyFiveDaysAgo && created >= thirtyDaysAgo;
    });
  }, [rawTransferData]);

  // Monthly transfer history (last 6 months)
  const monthlyTransferHistory = useMemo(() => {
    if (rawTransferData.length === 0) return [];
    const now = Date.now();
    const months: { month: string; total: number; accepted: number; declined: number; expired: number; acceptanceRate: number; avgResponseH: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = new Date(now);
      start.setMonth(start.getMonth() - i, 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      const label = start.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
      const inMonth = rawTransferData.filter((t: any) => {
        const d = new Date(t.created_at).getTime();
        return d >= start.getTime() && d < end.getTime();
      });
      const acc = inMonth.filter((t: any) => t.status === 'accepted').length;
      const dec = inMonth.filter((t: any) => t.status === 'declined').length;
      const exp = inMonth.filter((t: any) => t.status === 'expired').length;
      const resolved = acc + dec;
      const rate = resolved > 0 ? Math.round((acc / resolved) * 100) : 0;
      let totalMs = 0; let cnt = 0;
      inMonth.forEach((t: any) => { if (t.status !== 'pending' && t.updated_at && t.created_at) { const d2 = new Date(t.updated_at).getTime() - new Date(t.created_at).getTime(); if (d2 > 0) { totalMs += d2; cnt++; } } });
      const avgH = cnt > 0 ? Math.round((totalMs / cnt / 3600000) * 10) / 10 : 0;
      months.push({ month: label, total: inMonth.length, accepted: acc, declined: dec, expired: exp, acceptanceRate: rate, avgResponseH: avgH });
    }
    return months;
  }, [rawTransferData, fr]);

  // Daily transfer heatmap (last 90 days)
  const dailyTransferHeatmap = useMemo(() => {
    if (rawTransferData.length === 0) return { weeks: [] as { date: string; count: number; dayOfWeek: number }[][], maxCount: 0, totalTransfers: 0, activeDays: 0, peakDay: '' };
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86400000);
    const dayCounts: Record<string, number> = {};
    rawTransferData.forEach((t: any) => {
      const d = new Date(t.created_at).toISOString().slice(0, 10);
      if (new Date(d + 'T00:00:00').getTime() >= ninetyDaysAgo.getTime()) {
        dayCounts[d] = (dayCounts[d] || 0) + 1;
      }
    });
    const startDay = new Date(ninetyDaysAgo);
    startDay.setDate(startDay.getDate() - ((startDay.getDay() + 6) % 7));
    const weeks: { date: string; count: number; dayOfWeek: number }[][] = [];
    let currentWeek: { date: string; count: number; dayOfWeek: number }[] = [];
    const cursor = new Date(startDay);
    while (cursor <= now) {
      const dateStr = cursor.toISOString().slice(0, 10);
      const dow = (cursor.getDay() + 6) % 7;
      if (dow === 0 && currentWeek.length > 0) { weeks.push(currentWeek); currentWeek = []; }
      currentWeek.push({ date: dateStr, count: dayCounts[dateStr] || 0, dayOfWeek: dow });
      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentWeek.length > 0) weeks.push(currentWeek);
    const maxCount = Math.max(...Object.values(dayCounts), 0);
    const activeDays = Object.values(dayCounts).filter(c => c > 0).length;
    const totalTransfers = Object.values(dayCounts).reduce((a, b) => a + b, 0);
    let peakDay = '';
    let peakCount = 0;
    Object.entries(dayCounts).forEach(([d, c]) => { if (c > peakCount) { peakCount = c; peakDay = d; } });
    return { weeks, maxCount, totalTransfers, activeDays, peakDay };
  }, [rawTransferData]);

  const sendTransferReminders = useCallback(async () => {
    if (sendingTransferReminder || unremindedOverdue.length === 0) return;
    setSendingTransferReminder(true);
    try {
      const supabase = getSupabaseClient();
      let sentCount = 0;
      for (const t of unremindedOverdue) {
        try {
          await supabase.functions.invoke('send-push', {
            body: {
              type: 'player_transfer_reminder',
              payload: {
                targetUserId: t.recipient_user_id,
                playerName: t.player_name,
                senderName: transferProfileMap[t.sender_user_id] || '?',
                transferId: t.id,
              },
            },
          });
          sentCount++;
        } catch { /* continue with next */ }
      }
      const newReminded = new Set(remindedTransferIds);
      unremindedOverdue.forEach((t: any) => newReminded.add(t.id));
      setRemindedTransferIds(newReminded);
      AsyncStorage.setItem('admin_transfer_reminded_ids', JSON.stringify([...newReminded])).catch(() => {});
      const now = new Date().toISOString();
      setLastTransferReminder(now);
      AsyncStorage.setItem('admin_transfer_last_reminder', now).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(fr ? `${sentCount} rappel(s) envoye(s)` : `${sentCount} reminder(s) sent`, fr ? `Notifications envoyees aux destinataires en attente depuis +7 jours.` : `Notifications sent to recipients pending for 7+ days.`);
      logAdminAction({ actionType: 'transfer_reminder_sent', actionDetail: `Sent ${sentCount} transfer reminders for ${unremindedOverdue.length} overdue transfers`, metadata: { sentCount, overdueCount: unremindedOverdue.length } });
    } catch (e) {
      console.log('[Dashboard] Transfer reminder error:', e);
    }
    setSendingTransferReminder(false);
  }, [sendingTransferReminder, unremindedOverdue, remindedTransferIds, transferProfileMap, fr, showAlert]);

  const sendUrgentReminders = useCallback(async () => {
    if (sendingUrgentReminder || approachingExpiration.length === 0) return;
    setSendingUrgentReminder(true);
    try {
      const supabase = getSupabaseClient();
      let sentCount = 0;
      for (const t of approachingExpiration) {
        try {
          const daysLeft = Math.max(0, 30 - Math.floor((Date.now() - new Date(t.created_at).getTime()) / 86400000));
          await supabase.functions.invoke('send-push', {
            body: {
              type: 'player_transfer_urgent_reminder',
              payload: {
                targetUserId: t.recipient_user_id,
                playerName: t.player_name,
                senderName: transferProfileMap[t.sender_user_id] || '?',
                transferId: t.id,
                daysLeft,
              },
            },
          });
          sentCount++;
        } catch { /* continue */ }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(fr ? `${sentCount} rappel(s) urgent(s) envoye(s)` : `${sentCount} urgent reminder(s) sent`, fr ? `Notifications envoyees aux destinataires dont les transferts expirent dans 0-5 jours.` : `Notifications sent to recipients with transfers expiring in 0-5 days.`);
      logAdminAction({ actionType: 'transfer_urgent_reminder_sent', actionDetail: `Sent ${sentCount} urgent reminders for ${approachingExpiration.length} expiring transfers`, metadata: { sentCount, expiringCount: approachingExpiration.length } });
    } catch (e) {
      console.log('[Dashboard] Urgent transfer reminder error:', e);
    }
    setSendingUrgentReminder(false);
  }, [sendingUrgentReminder, approachingExpiration, transferProfileMap, fr, showAlert]);

  const loadArchive = useCallback(async () => {
    if (loadingArchive) return;
    setLoadingArchive(true);
    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('player_transfer_archives').select('*').order('archived_at', { ascending: false }).limit(50);
      if (data) {
        const userIds = [...new Set(data.flatMap((t: any) => [t.sender_user_id, t.recipient_user_id]))];
        const { data: profiles } = await supabase.from('user_profiles').select('id, username, email').in('id', userIds);
        const pm: Record<string, string> = {};
        (profiles || []).forEach((p: any) => { pm[p.id] = p.username || p.email || '?'; });
        setArchiveData(data.map((t: any) => ({ ...t, senderName: pm[t.sender_user_id] || '?', recipientName: pm[t.recipient_user_id] || '?' })));
      }
    } catch (e) { console.log('[Dashboard] Archive load error:', e); }
    setLoadingArchive(false);
  }, [loadingArchive]);

  const purgeOldArchives = useCallback(async () => {
    if (purgingArchive || purgeableArchives.length === 0) return;
    showAlert(
      fr ? 'Purger les archives ?' : 'Purge archives?',
      fr ? `${purgeableArchives.length} archive(s) de plus de 2 ans seront supprimees definitivement. Cette action est irreversible.` : `${purgeableArchives.length} archive(s) older than 2 years will be permanently deleted. This action is irreversible.`,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: fr ? 'Supprimer' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            setPurgingArchive(true);
            try {
              const supabase = getSupabaseClient();
              const twoYearsAgo = new Date(Date.now() - 2 * 365 * 86400000).toISOString();
              const { error, count } = await supabase.from('player_transfer_archives').delete({ count: 'exact' }).lt('archived_at', twoYearsAgo);
              if (error) {
                console.log('[Dashboard] Purge error:', error);
                showAlert(fr ? 'Erreur' : 'Error', error.message);
              } else {
                const purgedCount = count || purgeableArchives.length;
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                showAlert(fr ? 'Purge terminee' : 'Purge complete', fr ? `${purgedCount} archive(s) supprimee(s).` : `${purgedCount} archive(s) deleted.`);
                logAdminAction({ actionType: 'transfer_archive_purge', actionDetail: `Purged ${purgedCount} archives older than 2 years`, metadata: { purgedCount, cutoffDate: twoYearsAgo } });
                setArchiveData(prev => prev.filter((ar: any) => !(ar.archived_at && new Date(ar.archived_at).getTime() < Date.now() - 2 * 365 * 86400000)));
                setArchiveCount(prev => Math.max(0, prev - purgedCount));
              }
            } catch (e) {
              console.log('[Dashboard] Purge error:', e);
            }
            setPurgingArchive(false);
          },
        },
      ]
    );
  }, [purgingArchive, purgeableArchives, fr, showAlert]);

  // Transfer smart alerts (computed from current filtered stats)
  const transferAlerts = useMemo(() => {
    const alerts: { id: string; severity: 'critical' | 'warning' | 'info'; title: string; message: string; icon: string; color: string }[] = [];
    const ts = transferStats;
    const total = ts.pending + ts.accepted + ts.declined;
    if (total === 0) return alerts;
    const resolved = ts.accepted + ts.declined;
    // 1. Decline spike: > 50% decline rate with 3+ declines
    if (resolved > 0) {
      const declineRate = Math.round((ts.declined / resolved) * 100);
      if (declineRate > 50 && ts.declined >= 3) {
        alerts.push({ id: 'decline_spike', severity: 'critical', title: fr ? 'Pic de refus' : 'Decline spike', message: fr ? `${declineRate}% des transferts resolus sont refuses (${ts.declined} refus).` : `${declineRate}% of resolved transfers declined (${ts.declined} declines).`, icon: 'trending-down', color: '#DC2626' });
      }
    }
    // 2. Abnormal response time: > 48h average
    if (ts.avgResponseTimeHours > 48 && resolved >= 2) {
      alerts.push({ id: 'slow_response', severity: 'warning', title: fr ? 'Temps de reponse eleve' : 'Slow response time', message: fr ? `Temps moyen de ${ts.avgResponseTimeHours}h (seuil recommande : 48h).` : `Average ${ts.avgResponseTimeHours}h response (recommended: 48h).`, icon: 'timer-off', color: '#D97706' });
    }
    // 3. Sender(s) with low acceptance rate: < 25% on 3+ transfers
    const lowAcceptSenders = ts.topSenders.filter(s2 => { const r = s2.count > 0 ? Math.round((s2.accepted / s2.count) * 100) : 100; return r < 25 && s2.count >= 3; });
    if (lowAcceptSenders.length > 0) {
      const names = lowAcceptSenders.map(s2 => s2.name).join(', ');
      alerts.push({ id: 'low_accept_sender', severity: 'warning', title: fr ? 'Expediteur(s) a risque' : 'At-risk sender(s)', message: fr ? `${names} : taux d'acceptation < 25% sur 3+ transferts.` : `${names}: < 25% acceptance on 3+ transfers.`, icon: 'person-off', color: '#EF4444' });
    }
    // 4. High pending backlog: pending > resolved and pending >= 3
    if (ts.pending > resolved && ts.pending >= 3) {
      alerts.push({ id: 'high_pending', severity: 'info', title: fr ? 'Accumulation de transferts' : 'Transfer backlog', message: fr ? `${ts.pending} transferts sans reponse. Relancez les destinataires.` : `${ts.pending} unanswered transfers. Follow up with recipients.`, icon: 'hourglass-top', color: '#3B82F6' });
    }
    // 5. Recent decline trend: last 2 weeks show increasing declines
    if (ts.weeklyEvolution.length >= 2) {
      const last = ts.weeklyEvolution[ts.weeklyEvolution.length - 1];
      const prev = ts.weeklyEvolution[ts.weeklyEvolution.length - 2];
      if (last && prev && last.declined > prev.declined && last.declined >= 2) {
        alerts.push({ id: 'decline_trend', severity: 'info', title: fr ? 'Tendance refus en hausse' : 'Rising decline trend', message: fr ? `${last.declined} refus cette semaine vs ${prev.declined} la precedente.` : `${last.declined} declines this week vs ${prev.declined} prior.`, icon: 'show-chart', color: '#D97706' });
      }
    }
    // 6. Escalated transfers: pending > 21 days
    const twentyOneDaysMs = 21 * 86400000;
    const escalatedCount = rawTransferData.filter((t2: any) => t2.status === 'pending' && (Date.now() - new Date(t2.created_at).getTime()) > twentyOneDaysMs).length;
    if (escalatedCount > 0) {
      alerts.push({ id: 'escalated_transfers', severity: 'critical', title: fr ? 'Transferts escalades (+21j)' : 'Escalated transfers (21+ days)', message: fr ? `${escalatedCount} transfert(s) en attente depuis plus de 21 jours. Intervention manuelle recommandee.` : `${escalatedCount} transfer(s) pending for 21+ days. Manual intervention recommended.`, icon: 'priority-high', color: '#DC2626' });
    }
    // 7. Approaching expiration: pending 25-30 days
    const twentyFiveDaysMs = 25 * 86400000;
    const thirtyDaysMs = 30 * 86400000;
    const approachingExpCount = rawTransferData.filter((t2: any) => {
      const age = Date.now() - new Date(t2.created_at).getTime();
      return t2.status === 'pending' && age > twentyFiveDaysMs && age <= thirtyDaysMs;
    }).length;
    if (approachingExpCount > 0) {
      alerts.push({ id: 'approaching_expiration', severity: 'critical', title: fr ? 'Expiration imminente (25-30j)' : 'Expiration imminent (25-30d)', message: fr ? `${approachingExpCount} transfert(s) expirent dans moins de 5 jours. Envoyez un rappel urgent.` : `${approachingExpCount} transfer(s) expiring within 5 days. Send urgent reminder.`, icon: 'timer', color: '#DC2626' });
    }
    return alerts;
  }, [transferStats, rawTransferData, fr]);

  const filteredArchiveData = useMemo(() => {
    let filtered = archiveData;
    if (archiveFilterStatus !== 'all') filtered = filtered.filter((ar: any) => ar.status === archiveFilterStatus);
    if (archiveSearchText.trim().length > 0) {
      const q = archiveSearchText.trim().toLowerCase();
      filtered = filtered.filter((ar: any) => (ar.player_name || '').toLowerCase().includes(q) || (ar.senderName || '').toLowerCase().includes(q) || (ar.recipientName || '').toLowerCase().includes(q));
    }
    // Date range filter
    if (archiveDateFrom || archiveDateTo) {
      const dateKey = archiveDateField === 'created' ? 'created_at' : 'archived_at';
      const fromMs = archiveDateFrom ? new Date(archiveDateFrom + 'T00:00:00').getTime() : 0;
      const toMs = archiveDateTo ? new Date(archiveDateTo + 'T23:59:59').getTime() : Infinity;
      if (!isNaN(fromMs) && !isNaN(toMs)) {
        filtered = filtered.filter((ar: any) => {
          const d = ar[dateKey] ? new Date(ar[dateKey]).getTime() : 0;
          return d >= fromMs && d <= toMs;
        });
      }
    }
    return filtered;
  }, [archiveData, archiveFilterStatus, archiveSearchText, archiveDateField, archiveDateFrom, archiveDateTo]);

  const purgeableArchives = useMemo(() => {
    const twoYearsAgo = Date.now() - 2 * 365 * 86400000;
    return archiveData.filter((ar: any) => ar.archived_at && new Date(ar.archived_at).getTime() < twoYearsAgo);
  }, [archiveData]);

  const trendAlerts = useMemo(() => {
    const ta: { id: string; severity: 'critical' | 'warning' | 'info'; title: string; message: string; icon: string; color: string }[] = [];
    const recent = monthlyTransferHistory.filter(m => m.total > 0);
    if (recent.length < 2) return ta;
    if (recent.length >= 3) {
      const l3 = recent.slice(-3);
      if (l3[2].total < l3[1].total && l3[1].total < l3[0].total && l3[2].total > 0) {
        const decline = l3[0].total > 0 ? Math.round(((l3[0].total - l3[2].total) / l3[0].total) * 100) : 0;
        ta.push({ id: 'volume_decline_trend', severity: 'warning', title: fr ? 'Baisse de volume continue' : 'Continuous volume decline', message: fr ? `Volume en baisse sur 3 mois consecutifs (-${decline}%). Verifiez les causes.` : `Volume declining 3 consecutive months (-${decline}%). Check causes.`, icon: 'trending-down', color: '#D97706' });
      }
    }
    const l2 = recent.slice(-2);
    if (l2.length === 2) {
      const rd = l2[1].acceptanceRate - l2[0].acceptanceRate;
      if (rd < -10 && l2[1].total >= 2) ta.push({ id: 'acceptance_rate_drop', severity: 'warning', title: fr ? 'Taux acceptation en baisse' : 'Acceptance rate dropping', message: fr ? `${l2[1].acceptanceRate}% vs ${l2[0].acceptanceRate}% le mois precedent (${rd}pts).` : `${l2[1].acceptanceRate}% vs ${l2[0].acceptanceRate}% prior month (${rd}pts).`, icon: 'thumb-down', color: '#EF4444' });
    }
    if (l2.length === 2 && l2[0].avgResponseH > 0 && l2[1].avgResponseH > 0) {
      const ri = Math.round(((l2[1].avgResponseH - l2[0].avgResponseH) / l2[0].avgResponseH) * 100);
      if (ri > 20 && l2[1].avgResponseH > 24) ta.push({ id: 'response_time_increase', severity: 'info', title: fr ? 'Temps de reponse en hausse' : 'Response time increasing', message: fr ? `${l2[1].avgResponseH}h vs ${l2[0].avgResponseH}h (+${ri}%). Destinataires plus lents.` : `${l2[1].avgResponseH}h vs ${l2[0].avgResponseH}h (+${ri}%). Recipients slower.`, icon: 'timer', color: '#3B82F6' });
    }
    return ta;
  }, [monthlyTransferHistory, fr]);

  // Real-time polling every 30 seconds
  const [pollingActive, setPollingActive] = useState(true);
  const [lastPoll, setLastPoll] = useState<Date>(new Date());
  useEffect(() => {
    if (!pollingActive || loading) return;
    const interval = setInterval(async () => {
      try {
        await loadStats();
        setLastPoll(new Date());
      } catch { /* silent */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [pollingActive, loading, loadStats]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, [loadStats]);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.push('/profile' as any)}>
            <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
          </Pressable>
          <Text style={s.headerTitle}>Admin</Text>
          <View style={{ width: 40 }} />
        </View>
        <AdminQuickNav currentRoute="/admin-dashboard" />
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          <DashboardSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <PageErrorBoundary pageName="Dashboard">
    <AdminGuard language={language}>
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.push('/profile' as any)}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </Pressable>
        <Text style={s.headerTitle}>{fr ? 'Tableau de bord' : 'Dashboard'}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Pressable
            style={s.backBtn}
            onPress={() => { Haptics.selectionAsync(); setShowSearch(true); }}
          >
            <MaterialIcons name="search" size={20} color="#64748B" />
          </Pressable>
          <Pressable
            style={[s.backBtn, exportingPdf && { opacity: 0.5 }]}
            onPress={async () => {
              if (exportingPdf) return;
              setExportingPdf(true);
              Haptics.selectionAsync();
              try {
                const now = new Date();
                const dateStr = now.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:0;padding:24px;color:#0F172A;background:#F8FAFC}h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;color:#64748B;margin:24px 0 12px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #E2E8F0;padding-bottom:6px}.sub{font-size:12px;color:#94A3B8;margin-bottom:20px}.grid{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px}.card{flex:1;min-width:120px;background:#FFF;border-radius:12px;padding:16px;text-align:center;border:1px solid #E2E8F0}.card .val{font-size:28px;font-weight:800}.card .lbl{font-size:10px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px}.alert{background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:12px;margin-bottom:8px;font-size:12px;color:#991B1B}.alert.warn{background:#FFFBEB;border-color:#FDE68A;color:#92400E}.alert.info{background:#EFF6FF;border-color:#BFDBFE;color:#1E40AF}.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:11px}.bar-row .label{width:80px;color:#64748B;font-weight:600}.bar-row .bar{flex:1;height:14px;background:#F1F5F9;border-radius:4px;overflow:hidden}.bar-row .fill{height:100%;border-radius:4px}.bar-row .num{width:30px;text-align:right;font-weight:800;font-size:12px}footer{margin-top:32px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:10px;color:#94A3B8;text-align:center}</style></head><body><h1>Ultimate Petanque - ${fr ? 'Rapport Admin' : 'Admin Report'}</h1><p class="sub">${dateStr}</p><h2>${fr ? 'Vue d\'ensemble' : 'Overview'}</h2><div class="grid"><div class="card"><div class="val" style="color:#3B82F6">${stats.totalUsers}</div><div class="lbl">${fr ? 'Utilisateurs' : 'Users'}</div></div><div class="card"><div class="val" style="color:#10B981">${stats.totalTerrains}</div><div class="lbl">Terrains</div></div><div class="card"><div class="val" style="color:#7C3AED">${stats.totalClubs}</div><div class="lbl">Clubs</div></div><div class="card"><div class="val" style="color:#D97706">${stats.totalMatches}</div><div class="lbl">${fr ? 'Matchs' : 'Matches'}</div></div></div><div class="grid"><div class="card"><div class="val" style="color:#0EA5E9">${stats.totalPlayers}</div><div class="lbl">${fr ? 'Joueurs' : 'Players'}</div></div><div class="card"><div class="val" style="color:#C0C0C0">${stats.premiumUsers}</div><div class="lbl">Premium</div></div><div class="card"><div class="val" style="color:#2563EB">${stats.verifiedClubs}</div><div class="lbl">${fr ? 'Clubs verifies' : 'Verified Clubs'}</div></div><div class="card"><div class="val" style="color:#F59E0B">${pushStats.sent}</div><div class="lbl">Push</div></div></div><h2>${fr ? 'Moderation' : 'Moderation'}</h2><div class="grid"><div class="card"><div class="val" style="color:#F59E0B">${stats.pendingReports}</div><div class="lbl">${fr ? 'En attente' : 'Pending'}</div></div><div class="card"><div class="val" style="color:#D97706">${stats.activeWarnings}</div><div class="lbl">${fr ? 'Avertis' : 'Warned'}</div></div><div class="card"><div class="val" style="color:#DC2626">${stats.activeBans}</div><div class="lbl">${fr ? 'Bannis' : 'Banned'}</div></div><div class="card"><div class="val" style="color:#EF4444">${stats.flaggedPlayers}</div><div class="lbl">${fr ? 'Suspects' : 'Flagged'}</div></div></div>${smartAlerts.length > 0 ? `<h2>${fr ? 'Alertes' : 'Alerts'}</h2>${smartAlerts.map(a => `<div class="alert ${a.severity === 'warning' ? 'warn' : a.severity === 'info' ? 'info' : ''}">${a.title}: ${a.message}</div>`).join('')}` : ''}<h2>${fr ? 'Croissance utilisateurs' : 'User Growth'}</h2>${monthlyGrowth.map(m => `<div class="bar-row"><span class="label">${m.month}</span><div class="bar"><div class="fill" style="width:${Math.max(3, (m.count / Math.max(...monthlyGrowth.map(x => x.count), 1)) * 100)}%;background:#3B82F6"></div></div><span class="num">${m.count}</span></div>`).join('')}<h2>${fr ? 'Matchs par semaine' : 'Matches per Week'}</h2>${weeklyMatches.map(w => `<div class="bar-row"><span class="label">${w.week}</span><div class="bar"><div class="fill" style="width:${Math.max(3, (w.count / Math.max(...weeklyMatches.map(x => x.count), 1)) * 100)}%;background:#10B981"></div></div><span class="num">${w.count}</span></div>`).join('')}<h2>ELO</h2>${eloDistribution.map(e => `<div class="bar-row"><span class="label" style="color:${e.color}">${e.label}</span><div class="bar"><div class="fill" style="width:${Math.max(3, (e.count / Math.max(...eloDistribution.map(x => x.count), 1)) * 100)}%;background:${e.color}"></div></div><span class="num">${e.count}</span></div>`).join('')}<footer>Ultimate Petanque Admin Report - ${dateStr}</footer></body></html>`;
                const PrintModule = require('expo-print');
                const { uri } = await PrintModule.printToFileAsync({ html, base64: false });
                if (uri) {
                  const SharingModule = require('expo-sharing');
                  const canShare = await SharingModule.isAvailableAsync();
                  if (canShare) await SharingModule.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fr ? 'Rapport Admin PDF' : 'Admin Report PDF' });
                }
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              } catch (e) { console.log('[Dashboard] PDF export error:', e); }
              setExportingPdf(false);
            }}
            disabled={exportingPdf}
          >
            {exportingPdf ? <ActivityIndicator size="small" color="#64748B" /> : <MaterialIcons name="picture-as-pdf" size={20} color="#DC2626" />}
          </Pressable>
          <Pressable
            style={[s.backBtn, showWidgetSettings && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }]}
            onPress={() => { Haptics.selectionAsync(); setShowWidgetSettings(!showWidgetSettings); }}
          >
            <MaterialIcons name="tune" size={20} color={showWidgetSettings ? '#FFF' : '#64748B'} />
          </Pressable>
        </View>
      </View>

      <AdminQuickNav currentRoute="/admin-dashboard" />

      {/* Widget Settings Modal */}
      <Modal visible={showWidgetSettings} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowWidgetSettings(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.backBtn} onPress={() => setShowWidgetSettings(false)}>
              <MaterialIcons name="close" size={24} color="#0F172A" />
            </Pressable>
            <Text style={s.modalTitle}>{fr ? 'Widgets du tableau de bord' : 'Dashboard Widgets'}</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12 }}>
              <MaterialIcons name="info-outline" size={16} color="#3B82F6" />
              <Text style={{ flex: 1, fontSize: 12, color: '#3B82F6', lineHeight: 18 }}>{fr ? 'Activez ou desactivez les widgets et reorganisez-les avec les fleches.' : 'Toggle widgets on/off and reorder them with the arrows.'}</Text>
            </View>
            {(() => {
              const items = [
                { key: 'overview', label: fr ? 'Vue d\'ensemble' : 'Overview', icon: 'analytics' },
                { key: 'smartAlerts', label: fr ? 'Alertes' : 'Alerts', icon: 'notifications-active' },
                { key: 'transfers', label: fr ? 'Transferts joueurs' : 'Player Transfers', icon: 'swap-horiz' },
                { key: 'onboarding', label: 'Onboarding', icon: 'person-add' },
                { key: 'clubHealthAlerts', label: fr ? 'Sante clubs' : 'Club Health', icon: 'favorite' },
                { key: 'pushAnalytics', label: fr ? 'Push Analytics' : 'Push Analytics', icon: 'send' },
                { key: 'receiptDelivery', label: fr ? 'Livraison Push' : 'Push Delivery', icon: 'mark-email-read' },
                { key: 'pushTokenAnalytics', label: fr ? 'Tokens Push' : 'Push Tokens', icon: 'phonelink-ring' },
                { key: 'moderation', label: fr ? 'Moderation' : 'Moderation', icon: 'gavel' },
                { key: 'appeals', label: fr ? 'Appels de ban' : 'Ban Appeals', icon: 'rate-review' },
                { key: 'activity', label: fr ? 'Activite recente' : 'Recent Activity', icon: 'history' },
                { key: 'weeklyMatches', label: fr ? 'Matchs/semaine' : 'Matches/week', icon: 'sports' },
                { key: 'userGrowth', label: fr ? 'Croissance' : 'Growth', icon: 'trending-up' },
                { key: 'clubVerification', label: fr ? 'Verification clubs' : 'Club Verification', icon: 'verified' },
                { key: 'eloDistribution', label: 'ELO', icon: 'leaderboard' },
              ];
              const sorted = [...items].sort((a, b) => widgetOrder.indexOf(a.key) - widgetOrder.indexOf(b.key));
              return sorted.map((w, idx) => (
                <View key={w.key} style={s.widgetToggle}>
                  <Pressable style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }} onPress={() => toggleWidget(w.key)}>
                    <MaterialIcons name={w.icon as any} size={16} color={widgetVisibility[w.key] !== false ? '#3B82F6' : '#CBD5E1'} />
                    <Text style={[s.widgetToggleText, widgetVisibility[w.key] === false && { color: '#CBD5E1' }]}>{w.label}</Text>
                  </Pressable>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <Pressable onPress={() => moveWidget(w.key, 'up')} disabled={idx === 0} hitSlop={6}>
                      <MaterialIcons name="keyboard-arrow-up" size={18} color={idx === 0 ? '#E2E8F0' : '#64748B'} />
                    </Pressable>
                    <Pressable onPress={() => moveWidget(w.key, 'down')} disabled={idx === sorted.length - 1} hitSlop={6}>
                      <MaterialIcons name="keyboard-arrow-down" size={18} color={idx === sorted.length - 1 ? '#E2E8F0' : '#64748B'} />
                    </Pressable>
                    <View style={[s.widgetDot, widgetVisibility[w.key] !== false ? { backgroundColor: '#10B981' } : { backgroundColor: '#E2E8F0' }]} />
                  </View>
                </View>
              ));
            })()}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Transfer Archive Modal */}
      <Modal visible={showArchive} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowArchive(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.backBtn} onPress={() => setShowArchive(false)}>
              <MaterialIcons name="close" size={24} color="#0F172A" />
            </Pressable>
            <Text style={s.modalTitle}>{fr ? 'Archives transferts' : 'Transfer Archives'}</Text>
            <Pressable
              style={[s.backBtn, exportingArchiveCsv && { opacity: 0.5 }]}
              onPress={async () => {
                if (exportingArchiveCsv || filteredArchiveData.length === 0) return;
                setExportingArchiveCsv(true);
                try {
                  const headers = 'Player,Sender,Recipient,Status,Matches,Challenges,Created,Archived';
                  const rows = filteredArchiveData.map((ar: any) => `"${ar.player_name}","${ar.senderName}","${ar.recipientName}",${ar.status},${ar.match_count || 0},${ar.challenge_count || 0},${ar.created_at ? ar.created_at.slice(0, 10) : ''},${ar.archived_at ? ar.archived_at.slice(0, 10) : ''}`);
                  const csv = [headers, ...rows].join('\n');
                  if (typeof document !== 'undefined') {
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `transfer-archives-${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } else {
                    const FS = require('expo-file-system');
                    const SharingMod = require('expo-sharing');
                    const path = `${FS.cacheDirectory}transfer-archives-${new Date().toISOString().slice(0, 10)}.csv`;
                    await FS.writeAsStringAsync(path, csv, { encoding: FS.EncodingType.UTF8 });
                    const canShare = await SharingMod.isAvailableAsync();
                    if (canShare) await SharingMod.shareAsync(path, { mimeType: 'text/csv', dialogTitle: fr ? 'Exporter les archives' : 'Export archives' });
                  }
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } catch (e) { console.log('[Dashboard] Archive CSV export error:', e); }
                setExportingArchiveCsv(false);
              }}
              disabled={exportingArchiveCsv || filteredArchiveData.length === 0}
            >
              {exportingArchiveCsv ? <ActivityIndicator size="small" color="#7C3AED" /> : <MaterialIcons name="file-download" size={20} color={filteredArchiveData.length > 0 ? '#7C3AED' : '#CBD5E1'} />}
            </Pressable>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, backgroundColor: '#EDE9FE', borderRadius: 12, padding: 12 }}>
              <MaterialIcons name="inventory-2" size={16} color="#7C3AED" />
              <Text style={{ flex: 1, fontSize: 12, color: '#7C3AED', lineHeight: 18 }}>
                {fr ? `${archiveCount} transfert(s) archive(s). Les transferts resolus sont archives automatiquement apres 90 jours.` : `${archiveCount} archived transfer(s). Resolved transfers are auto-archived after 90 days.`}
              </Text>
            </View>
            <View style={{ marginBottom: 12, gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <MaterialIcons name="search" size={18} color="#94A3B8" />
                <TextInput style={{ flex: 1, fontSize: 13, color: '#0F172A', paddingVertical: 4 }} placeholder={fr ? 'Rechercher par joueur, expediteur...' : 'Search by player, sender...'} placeholderTextColor="#CBD5E1" value={archiveSearchText} onChangeText={setArchiveSearchText} />
                {archiveSearchText.length > 0 ? <Pressable onPress={() => setArchiveSearchText('')} hitSlop={8}><MaterialIcons name="close" size={16} color="#94A3B8" /></Pressable> : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {(['all', 'accepted', 'declined', 'expired'] as const).map(st => {
                  const active = archiveFilterStatus === st;
                  const colors: Record<string, string> = { all: '#64748B', accepted: '#10B981', declined: '#EF4444', expired: '#94A3B8' };
                  const labels: Record<string, string> = { all: fr ? 'Tous' : 'All', accepted: fr ? 'Acceptes' : 'Accepted', declined: fr ? 'Refuses' : 'Declined', expired: fr ? 'Expires' : 'Expired' };
                  return <Pressable key={st} style={[s.filterChip, active && { backgroundColor: colors[st], borderColor: colors[st] }]} onPress={() => { Haptics.selectionAsync(); setArchiveFilterStatus(st); }}><Text style={[s.filterChipText, active && { color: '#FFF' }]}>{labels[st]}</Text></Pressable>;
                })}
              </ScrollView>
              {/* Date range filter */}
              <View style={{ gap: 6, marginTop: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name="date-range" size={14} color="#64748B" />
                  <Pressable style={[s.filterChip, archiveDateField === 'created' && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }]} onPress={() => { Haptics.selectionAsync(); setArchiveDateField('created'); }}>
                    <Text style={[s.filterChipText, archiveDateField === 'created' && { color: '#FFF' }]}>{fr ? 'Date creation' : 'Created date'}</Text>
                  </Pressable>
                  <Pressable style={[s.filterChip, archiveDateField === 'archived' && { backgroundColor: '#7C3AED', borderColor: '#7C3AED' }]} onPress={() => { Haptics.selectionAsync(); setArchiveDateField('archived'); }}>
                    <Text style={[s.filterChipText, archiveDateField === 'archived' && { color: '#FFF' }]}>{fr ? 'Date archivage' : 'Archived date'}</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {[
                    { key: 'all', label: fr ? 'Tout' : 'All' },
                    { key: '7d', label: '7j' },
                    { key: '30d', label: '30j' },
                    { key: '3m', label: '3m' },
                    { key: '6m', label: '6m' },
                    { key: '1y', label: '1an' },
                  ].map(p => {
                    const isActive = (() => {
                      if (p.key === 'all') return !archiveDateFrom && !archiveDateTo;
                      const now = new Date();
                      let expected = '';
                      if (p.key === '7d') expected = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
                      else if (p.key === '30d') expected = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
                      else if (p.key === '3m') { const d = new Date(now); d.setMonth(d.getMonth() - 3); expected = d.toISOString().slice(0, 10); }
                      else if (p.key === '6m') { const d = new Date(now); d.setMonth(d.getMonth() - 6); expected = d.toISOString().slice(0, 10); }
                      else if (p.key === '1y') { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); expected = d.toISOString().slice(0, 10); }
                      return archiveDateFrom === expected && !archiveDateTo;
                    })();
                    return (
                      <Pressable key={p.key} style={[s.filterChip, isActive && { backgroundColor: '#0EA5E9', borderColor: '#0EA5E9' }]} onPress={() => {
                        Haptics.selectionAsync();
                        if (p.key === 'all') { setArchiveDateFrom(''); setArchiveDateTo(''); return; }
                        const now = new Date();
                        let from = '';
                        if (p.key === '7d') from = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
                        else if (p.key === '30d') from = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
                        else if (p.key === '3m') { const d = new Date(now); d.setMonth(d.getMonth() - 3); from = d.toISOString().slice(0, 10); }
                        else if (p.key === '6m') { const d = new Date(now); d.setMonth(d.getMonth() - 6); from = d.toISOString().slice(0, 10); }
                        else if (p.key === '1y') { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); from = d.toISOString().slice(0, 10); }
                        setArchiveDateFrom(from); setArchiveDateTo('');
                      }}>
                        <Text style={[s.filterChipText, isActive && { color: '#FFF' }]}>{p.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginBottom: 3 }}>{fr ? 'De' : 'From'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: archiveDateFrom ? '#0EA5E9' : '#E2E8F0', paddingHorizontal: 8, paddingVertical: 6 }}>
                      <MaterialIcons name="calendar-today" size={13} color={archiveDateFrom ? '#0EA5E9' : '#CBD5E1'} />
                      <TextInput style={{ flex: 1, fontSize: 12, color: '#0F172A', paddingVertical: 2, paddingHorizontal: 6 }} placeholder="YYYY-MM-DD" placeholderTextColor="#CBD5E1" value={archiveDateFrom} onChangeText={setArchiveDateFrom} maxLength={10} keyboardType="numbers-and-punctuation" />
                      {archiveDateFrom ? <Pressable onPress={() => setArchiveDateFrom('')} hitSlop={6}><MaterialIcons name="close" size={14} color="#94A3B8" /></Pressable> : null}
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginBottom: 3 }}>{fr ? 'A' : 'To'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 10, borderWidth: 1, borderColor: archiveDateTo ? '#0EA5E9' : '#E2E8F0', paddingHorizontal: 8, paddingVertical: 6 }}>
                      <MaterialIcons name="event" size={13} color={archiveDateTo ? '#0EA5E9' : '#CBD5E1'} />
                      <TextInput style={{ flex: 1, fontSize: 12, color: '#0F172A', paddingVertical: 2, paddingHorizontal: 6 }} placeholder="YYYY-MM-DD" placeholderTextColor="#CBD5E1" value={archiveDateTo} onChangeText={setArchiveDateTo} maxLength={10} keyboardType="numbers-and-punctuation" />
                      {archiveDateTo ? <Pressable onPress={() => setArchiveDateTo('')} hitSlop={6}><MaterialIcons name="close" size={14} color="#94A3B8" /></Pressable> : null}
                    </View>
                  </View>
                </View>
              </View>
              {(archiveSearchText.length > 0 || archiveFilterStatus !== 'all' || archiveDateFrom || archiveDateTo) ? <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600', marginTop: 4 }}>{filteredArchiveData.length}/{archiveData.length} {fr ? 'resultat(s)' : 'result(s)'}</Text> : null}
            </View>
            {/* Purge old archives (2+ years) */}
            {purgeableArchives.length > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FECACA' }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#DC262615', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="delete-sweep" size={16} color="#DC2626" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#991B1B' }}>
                    {purgeableArchives.length} {fr ? 'archive(s) > 2 ans' : 'archive(s) > 2 years'}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#DC2626', marginTop: 1 }}>
                    {fr ? 'Suppression definitive possible' : 'Eligible for permanent deletion'}
                  </Text>
                </View>
                <Pressable
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#DC2626' }, purgingArchive && { opacity: 0.5 }]}
                  onPress={purgeOldArchives}
                  disabled={purgingArchive}
                >
                  {purgingArchive ? <ActivityIndicator size="small" color="#FFF" /> : (
                    <>
                      <MaterialIcons name="delete-forever" size={13} color="#FFF" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>{fr ? 'Purger' : 'Purge'}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}
            {loadingArchive ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <ActivityIndicator size="large" color="#7C3AED" />
              </View>
            ) : filteredArchiveData.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <MaterialIcons name="inventory-2" size={32} color="#CBD5E1" />
                <Text style={{ fontSize: 13, color: '#94A3B8', marginTop: 8 }}>{fr ? 'Aucune archive' : 'No archives'}</Text>
              </View>
            ) : filteredArchiveData.map((ar: any, idx: number) => {
              const sc = ar.status === 'accepted' ? '#10B981' : ar.status === 'declined' ? '#EF4444' : '#94A3B8';
              return (
                <View key={ar.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F1F5F9' }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: sc + '12', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name={ar.status === 'accepted' ? 'check-circle' : ar.status === 'declined' ? 'cancel' : 'timer-off'} size={16} color={sc} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>{ar.player_name}</Text>
                    <Text style={{ fontSize: 10, color: '#94A3B8' }}>{ar.senderName} \u2192 {ar.recipientName}</Text>
                    <Text style={{ fontSize: 9, color: '#CBD5E1', marginTop: 2 }}>
                      {fr ? 'Archive le' : 'Archived'} {new Date(ar.archived_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <View style={{ backgroundColor: sc + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: sc }}>{ar.status}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#0EA5E9' }}>{ar.match_count}m</Text>
                      {ar.challenge_count > 0 ? <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>{ar.challenge_count}d</Text> : null}
                    </View>
                    <Text style={{ fontSize: 8, color: '#CBD5E1' }}>{ar.created_at ? new Date(ar.created_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' }) : ''}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Polling Indicator */}
        {pollingActive && !loading ? (
          <Pressable
            style={s.pollingIndicator}
            onPress={() => { Haptics.selectionAsync(); setPollingActive(!pollingActive); }}
          >
            <View style={s.pollingDot} />
            <Text style={s.pollingText}>
              {fr ? 'Actualisation auto' : 'Auto-refresh'} • {lastPoll.toLocaleTimeString(fr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </Pressable>
        ) : null}

        {/* Maintenance Alert */}
        {(stats.maintenanceActive || stats.maintenanceScheduled) ? (
          <Animated.View entering={FadeInDown.duration(300)}>
            <Pressable
              style={[s.alertCard, { backgroundColor: stats.maintenanceActive ? '#FEF3C7' : '#EFF6FF', borderColor: stats.maintenanceActive ? '#FDE68A' : '#BFDBFE' }]}
              onPress={() => { Haptics.selectionAsync(); router.push('/admin-maintenance' as any); }}
            >
              <View style={[s.alertIcon, { backgroundColor: stats.maintenanceActive ? '#F59E0B20' : '#3B82F620' }]}>
                <MaterialIcons name="construction" size={20} color={stats.maintenanceActive ? '#D97706' : '#2563EB'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.alertTitle, { color: stats.maintenanceActive ? '#92400E' : '#1E40AF' }]}>
                  {stats.maintenanceActive ? (fr ? 'Maintenance active' : 'Maintenance active') : (fr ? 'Maintenance planifiee' : 'Maintenance scheduled')}
                </Text>
                <Text style={[s.alertDesc, { color: stats.maintenanceActive ? '#B45309' : '#3B82F6' }]}>
                  {fr ? 'Cliquez pour gerer' : 'Click to manage'}
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color={stats.maintenanceActive ? '#D97706' : '#3B82F6'} />
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Ordered Widget Rendering */}
        {widgetOrder.map((wKey, wIdx) => {
          if (widgetVisibility[wKey] === false) return null;
          const wDelay = 50 + wIdx * 20;

          if (wKey === 'overview') return (
        <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
          <Text style={s.sectionTitle}>{fr ? 'VUE D\'ENSEMBLE' : 'OVERVIEW'}</Text>
          <View style={s.metricsGrid}>
            <View style={[s.metricCard, { borderColor: '#3B82F620' }]}>
              <View style={[s.metricIcon, { backgroundColor: '#DBEAFE' }]}>
                <MaterialIcons name="people" size={18} color="#3B82F6" />
              </View>
              <Text style={[s.metricValue, { color: '#3B82F6' }]}>{stats.totalUsers}</Text>
              <Text style={s.metricLabel}>{fr ? 'Utilisateurs' : 'Users'}</Text>
            </View>
            <View style={[s.metricCard, { borderColor: '#10B98120' }]}>
              <View style={[s.metricIcon, { backgroundColor: '#DCFCE7' }]}>
                <MaterialIcons name="sports-soccer" size={18} color="#10B981" />
              </View>
              <Text style={[s.metricValue, { color: '#10B981' }]}>{stats.totalTerrains}</Text>
              <Text style={s.metricLabel}>{fr ? 'Terrains' : 'Terrains'}</Text>
            </View>
            <View style={[s.metricCard, { borderColor: '#7C3AED20' }]}>
              <View style={[s.metricIcon, { backgroundColor: '#EDE9FE' }]}>
                <MaterialIcons name="home" size={18} color="#7C3AED" />
              </View>
              <Text style={[s.metricValue, { color: '#7C3AED' }]}>{stats.totalClubs}</Text>
              <Text style={s.metricLabel}>Clubs</Text>
            </View>
            <View style={[s.metricCard, { borderColor: '#D9770620' }]}>
              <View style={[s.metricIcon, { backgroundColor: '#FEF3C7' }]}>
                <MaterialIcons name="sports" size={18} color="#D97706" />
              </View>
              <Text style={[s.metricValue, { color: '#D97706' }]}>{stats.totalMatches}</Text>
              <Text style={s.metricLabel}>{fr ? 'Matchs' : 'Matches'}</Text>
            </View>
          </View>

          {/* Secondary stats row */}
          <View style={s.secondaryRow}>
            <View style={s.secondaryItem}>
              <MaterialIcons name="person" size={14} color="#64748B" />
              <Text style={s.secondaryText}>{stats.totalPlayers} {fr ? 'joueurs' : 'players'}</Text>
            </View>
            <View style={s.secondaryDot} />
            <View style={s.secondaryItem}>
              <MaterialIcons name="star" size={14} color="#C0C0C0" />
              <Text style={s.secondaryText}>{stats.premiumUsers} premium</Text>
            </View>
          </View>
        </Animated.View>

          );

          if (wKey === 'smartAlerts' && smartAlerts.length > 0) return (
          <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
            <Text style={s.sectionTitle}>{fr ? 'ALERTES INTELLIGENTES' : 'SMART ALERTS'}</Text>
            {smartAlerts.map((alert, aIdx) => (
              <Pressable
                key={alert.id}
                style={[s.alertCard, { backgroundColor: alert.severity === 'critical' ? '#FEF2F2' : alert.severity === 'warning' ? '#FFFBEB' : '#F0F9FF', borderColor: alert.severity === 'critical' ? '#FECACA' : alert.severity === 'warning' ? '#FDE68A' : '#BAE6FD', marginBottom: 8 }]}
                onPress={() => { if (alert.route) { Haptics.selectionAsync(); router.push(alert.route as any); } }}
              >
                <View style={[s.alertIcon, { backgroundColor: alert.color + '15' }]}>
                  <MaterialIcons name={alert.icon as any} size={18} color={alert.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.alertTitle, { color: alert.color }]}>{alert.title}</Text>
                    {alert.severity === 'critical' ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#DC2626' }} /> : null}
                  </View>
                  <Text style={[s.alertDesc, { color: alert.color + 'CC' }]}>{alert.message}</Text>
                </View>
                {alert.route ? <MaterialIcons name="chevron-right" size={18} color={alert.color} /> : null}
              </Pressable>
            ))}
          </Animated.View>
          );

          if (wKey === 'transfers') return (
          <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 }}>
              <Text style={s.sectionTitle}>{fr ? 'TRANSFERTS JOUEURS' : 'PLAYER TRANSFERS'}</Text>
              {(transferStats.recent.length > 0 || archiveCount > 0) ? (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                <Pressable
                  style={[s.growthExportBtn, { borderColor: '#7C3AED30' }]}
                  onPress={() => { Haptics.selectionAsync(); loadArchive(); setShowArchive(true); }}
                >
                  <MaterialIcons name="inventory-2" size={16} color="#7C3AED" />
                  {archiveCount > 0 ? <View style={{ position: 'absolute', top: -2, right: -2, backgroundColor: '#7C3AED', borderRadius: 7, minWidth: 14, height: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }}><Text style={{ fontSize: 8, fontWeight: '800', color: '#FFF' }}>{archiveCount > 99 ? '99+' : archiveCount}</Text></View> : null}
                </Pressable>
                <Pressable
                  style={[s.growthExportBtn, exportingTransferPdf && { opacity: 0.5 }]}
                  onPress={async () => {
                    if (exportingTransferPdf) return;
                    setExportingTransferPdf(true);
                    Haptics.selectionAsync();
                    try {
                      const now = new Date();
                      const dateStr = now.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric' });
                      const ts = transferStats;
                      const total = ts.pending + ts.accepted + ts.declined + ts.expired;
                      const filterParts = [
                        transferFilterStatus !== 'all' ? (fr ? `Statut: ${transferFilterStatus}` : `Status: ${transferFilterStatus}`) : '',
                        transferFilterPeriod !== 'all' ? (fr ? `Periode: ${transferFilterPeriod}` : `Period: ${transferFilterPeriod}`) : '',
                        transferFilterSender ? `${fr ? 'Expediteur' : 'Sender'}: ${transferProfileMap[transferFilterSender] || '?'}` : '',
                      ].filter(Boolean).join(' • ') || (fr ? 'Aucun filtre' : 'No filters');
                      const maxW = Math.max(...(ts.weeklyEvolution.length > 0 ? ts.weeklyEvolution.map(w => w.count) : [1]), 1);
                      const weeklyHtml = ts.weeklyEvolution.map(w => {
                        const pct = Math.max(3, (w.count / maxW) * 100);
                        const accPct = Math.max(0, (w.accepted / maxW) * 100);
                        const decPct = Math.max(0, (w.declined / maxW) * 100);
                        const penPct = Math.max(0, ((w.count - w.accepted - w.declined) / maxW) * 100);
                        return `<div class="bar-row"><span class="label">${w.week}</span><div class="bar"><div class="fill" style="width:${accPct}%;background:#10B981"></div><div class="fill" style="width:${decPct}%;background:#EF4444"></div><div class="fill" style="width:${penPct}%;background:#F59E0B"></div></div><span class="num">${w.count}</span></div>`;
                      }).join('');
                      const senderHtml = ts.topSenders.map((sn, si) => {
                        const rate = sn.count > 0 ? Math.round((sn.accepted / sn.count) * 100) : 0;
                        return `<tr><td style="text-align:center;font-weight:800;color:#94A3B8">${si+1}</td><td>${sn.name}</td><td style="text-align:center;font-weight:800">${sn.count}</td><td style="text-align:center">${sn.accepted}</td><td style="text-align:center;color:${rate >= 60 ? '#10B981' : rate >= 30 ? '#D97706' : '#EF4444'};font-weight:800">${rate}%</td></tr>`;
                      }).join('');
                      const alertsHtml = transferAlerts.map(a => `<div class="alert ${a.severity === 'critical' ? 'crit' : a.severity === 'warning' ? 'warn' : 'info'}"><strong>${a.title}</strong>: ${a.message}</div>`).join('');
                      const recentHtml = ts.recent.map(tr => {
                        const sc = tr.status === 'accepted' ? '#10B981' : tr.status === 'declined' ? '#EF4444' : tr.status === 'expired' ? '#94A3B8' : '#F59E0B';
                        const age = Math.floor((Date.now() - new Date(tr.createdAt).getTime()) / 86400000);
                        let badge = '';
                        if (tr.status === 'expired') badge = '<span class="badge expired">EXPIRED</span>';
                        else if (tr.status === 'pending' && age > 25) badge = '<span class="badge expiring">EXPIRING</span>';
                        else if (tr.status === 'pending' && age > 21) badge = '<span class="badge escalated">ESCALATED</span>';
                        else if (tr.status === 'pending' && age > 7) badge = '<span class="badge overdue">OVERDUE</span>';
                        return `<tr><td>${tr.playerName} ${badge}</td><td>${tr.senderName}</td><td>${tr.recipientName}</td><td style="color:${sc};font-weight:700">${tr.status}</td><td style="text-align:center">${tr.matchCount}m${tr.challengeCount > 0 ? ' ' + tr.challengeCount + 'd' : ''}</td><td>${tr.createdAt.slice(0,10)}</td></tr>`;
                      }).join('');
                      const pdfHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:0;padding:24px;color:#0F172A;background:#F8FAFC}h1{font-size:22px;margin:0 0 4px}h2{font-size:14px;color:#64748B;margin:24px 0 12px;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #E2E8F0;padding-bottom:6px}.sub{font-size:12px;color:#94A3B8;margin-bottom:4px}.filter-tag{display:inline-block;background:#EFF6FF;color:#3B82F6;font-size:10px;font-weight:700;padding:3px 10px;border-radius:6px;margin-bottom:16px}.grid{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px}.card{flex:1;min-width:80px;background:#FFF;border-radius:12px;padding:14px 8px;text-align:center;border:1px solid #E2E8F0}.card .val{font-size:26px;font-weight:800;line-height:1.2}.card .lbl{font-size:9px;color:#94A3B8;text-transform:uppercase;letter-spacing:0.5px;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px}th{background:#F1F5F9;text-align:left;padding:8px 6px;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;color:#64748B;border-bottom:2px solid #E2E8F0}td{padding:7px 6px;border-bottom:1px solid #F1F5F9}.bar-row{display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:11px}.bar-row .label{width:50px;color:#64748B;font-weight:600;font-size:10px}.bar-row .bar{flex:1;height:14px;background:#F1F5F9;border-radius:4px;overflow:hidden;display:flex}.bar-row .fill{height:100%}.bar-row .num{width:28px;text-align:right;font-weight:800;font-size:11px}.legend{display:flex;gap:12px;margin-top:6px;justify-content:flex-end}.legend-item{display:flex;align-items:center;gap:4px;font-size:9px;color:#94A3B8}.legend-dot{width:8px;height:8px;border-radius:2px}.alert{border-radius:8px;padding:10px 12px;margin-bottom:6px;font-size:11px;line-height:1.5}.alert.crit{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B}.alert.warn{background:#FFFBEB;border:1px solid #FDE68A;color:#92400E}.alert.info{background:#EFF6FF;border:1px solid #BFDBFE;color:#1E40AF}.badge{display:inline-block;font-size:7px;font-weight:800;color:#FFF;padding:2px 5px;border-radius:3px;margin-left:4px;vertical-align:middle}.badge.expired{background:#94A3B8}.badge.expiring{background:#991B1B}.badge.escalated{background:#DC2626}.badge.overdue{background:#F59E0B}.reminder-box{background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:12px;margin-bottom:12px;font-size:11px;color:#92400E}footer{margin-top:32px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:10px;color:#94A3B8;text-align:center}</style></head><body><h1>${fr ? 'Rapport des Transferts Joueurs' : 'Player Transfer Report'}</h1><p class="sub">${dateStr}</p><div class="filter-tag">${filterParts}</div><h2>KPIs</h2><div class="grid"><div class="card"><div class="val" style="color:#F59E0B">${ts.pending}</div><div class="lbl">${fr ? 'En attente' : 'Pending'}</div></div><div class="card"><div class="val" style="color:#10B981">${ts.accepted}</div><div class="lbl">${fr ? 'Acceptes' : 'Accepted'}</div></div><div class="card"><div class="val" style="color:#EF4444">${ts.declined}</div><div class="lbl">${fr ? 'Refuses' : 'Declined'}</div></div>${ts.expired > 0 ? `<div class="card"><div class="val" style="color:#94A3B8">${ts.expired}</div><div class="lbl">${fr ? 'Expires' : 'Expired'}</div></div>` : ''}<div class="card"><div class="val" style="color:${ts.acceptanceRate >= 60 ? '#10B981' : ts.acceptanceRate >= 30 ? '#D97706' : '#EF4444'}">${ts.acceptanceRate}%</div><div class="lbl">${fr ? 'Taux accept.' : 'Accept rate'}</div></div><div class="card"><div class="val" style="color:#3B82F6">${ts.avgResponseTimeHours < 1 ? '<1' : ts.avgResponseTimeHours}h</div><div class="lbl">${fr ? 'Temps moy.' : 'Avg response'}</div></div></div>${ts.weeklyEvolution.length > 1 ? `<h2>${fr ? 'Evolution Hebdomadaire' : 'Weekly Evolution'}</h2>${weeklyHtml}<div class="legend"><div class="legend-item"><div class="legend-dot" style="background:#10B981"></div>${fr ? 'Accepte' : 'Accepted'}</div><div class="legend-item"><div class="legend-dot" style="background:#EF4444"></div>${fr ? 'Refuse' : 'Declined'}</div><div class="legend-item"><div class="legend-dot" style="background:#F59E0B"></div>${fr ? 'Attente' : 'Pending'}</div></div>` : ''}${ts.topSenders.length > 0 ? `<h2>${fr ? 'Top Expediteurs' : 'Top Senders'}</h2><table><thead><tr><th>#</th><th>${fr ? 'Nom' : 'Name'}</th><th style="text-align:center">${fr ? 'Total' : 'Total'}</th><th style="text-align:center">${fr ? 'Acceptes' : 'Accepted'}</th><th style="text-align:center">${fr ? 'Taux' : 'Rate'}</th></tr></thead><tbody>${senderHtml}</tbody></table>` : ''}${transferAlerts.length > 0 ? `<h2>${fr ? 'Alertes Actives' : 'Active Alerts'}</h2>${alertsHtml}` : ''}<div class="reminder-box"><strong>${fr ? 'Rappels' : 'Reminders'}</strong><br/>${fr ? 'Transferts en retard (+7j)' : 'Overdue transfers (7+d)'}: <strong>${overdueTransfers.length}</strong><br/>${fr ? 'Non rappeles' : 'Not reminded'}: <strong>${unremindedOverdue.length}</strong><br/>${fr ? 'Expiration imminente (25-30j)' : 'Approaching expiration (25-30d)'}: <strong>${approachingExpiration.length}</strong>${lastTransferReminder ? `<br/>${fr ? 'Dernier rappel' : 'Last reminder'}: <strong>${new Date(lastTransferReminder).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong>` : ''}</div>${ts.recent.length > 0 ? `<h2>${fr ? 'Transferts Recents' : 'Recent Transfers'} (${ts.recent.length})</h2><table><thead><tr><th>${fr ? 'Joueur' : 'Player'}</th><th>${fr ? 'Expediteur' : 'Sender'}</th><th>${fr ? 'Destinataire' : 'Recipient'}</th><th>Status</th><th style="text-align:center">${fr ? 'Donnees' : 'Data'}</th><th>Date</th></tr></thead><tbody>${recentHtml}</tbody></table>` : ''}<footer>Ultimate Petanque - ${fr ? 'Rapport Transferts' : 'Transfer Report'} - ${dateStr} • ${total} ${fr ? 'transferts au total' : 'total transfers'}</footer></body></html>`;
                      const PrintModule = require('expo-print');
                      const { uri } = await PrintModule.printToFileAsync({ html: pdfHtml, base64: false });
                      if (uri) {
                        const SharingModule = require('expo-sharing');
                        const canShare = await SharingModule.isAvailableAsync();
                        if (canShare) await SharingModule.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fr ? 'Rapport Transferts PDF' : 'Transfer Report PDF' });
                      }
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch (e) { console.log('[Dashboard] Transfer PDF export error:', e); }
                    setExportingTransferPdf(false);
                  }}
                  disabled={exportingTransferPdf}
                >
                  {exportingTransferPdf ? <ActivityIndicator size="small" color="#DC2626" /> : <MaterialIcons name="picture-as-pdf" size={16} color="#DC2626" />}
                </Pressable>
                <Pressable
                  style={[s.growthExportBtn, exportingTransfers && { opacity: 0.5 }]}
                  onPress={async () => {
                    if (exportingTransfers) return;
                    setExportingTransfers(true);
                    try {
                      const headers = 'Player,Sender,Recipient,Status,Matches,Challenges,Date';
                      const rows = transferStats.recent.map(tr => `"${tr.playerName}","${tr.senderName}","${tr.recipientName}",${tr.status},${tr.matchCount},${tr.challengeCount},${tr.createdAt.slice(0, 10)}`);
                      const summary = `\n--- Summary ---\nPending,${transferStats.pending}\nAccepted,${transferStats.accepted}\nDeclined,${transferStats.declined}\nAcceptance Rate,${transferStats.acceptanceRate}%\nAvg Response Time,${transferStats.avgResponseTimeHours}h`;
                      const csv = [headers, ...rows, '', summary].join('\n');
                      if (typeof document !== 'undefined') {
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `transfers-${new Date().toISOString().slice(0, 10)}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } else {
                        const FS = require('expo-file-system');
                        const SharingMod = require('expo-sharing');
                        const path = `${FS.cacheDirectory}transfers-${new Date().toISOString().slice(0, 10)}.csv`;
                        await FS.writeAsStringAsync(path, csv, { encoding: FS.EncodingType.UTF8 });
                        const canShare = await SharingMod.isAvailableAsync();
                        if (canShare) await SharingMod.shareAsync(path, { mimeType: 'text/csv', dialogTitle: fr ? 'Exporter les transferts' : 'Export transfers' });
                      }
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch (e) { console.log('[Dashboard] Transfer export error:', e); }
                    setExportingTransfers(false);
                  }}
                  disabled={exportingTransfers}
                >
                  {exportingTransfers ? <ActivityIndicator size="small" color="#2563EB" /> : <MaterialIcons name="file-download" size={16} color="#2563EB" />}
                </Pressable>
                </View>
              ) : null}
            </View>

            {/* Transfer Filters */}
            <View style={{ marginBottom: 8 }}>
              {/* Status filter */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 6, paddingHorizontal: 2 }}>
                {(['all', 'pending', 'accepted', 'declined', 'expired'] as const).map(st => {
                  const active = transferFilterStatus === st;
                  const colors: Record<string, string> = { all: '#64748B', pending: '#F59E0B', accepted: '#10B981', declined: '#EF4444', expired: '#94A3B8' };
                  const labels: Record<string, string> = { all: fr ? 'Tous' : 'All', pending: fr ? 'Attente' : 'Pending', accepted: fr ? 'Acceptes' : 'Accepted', declined: fr ? 'Refuses' : 'Declined', expired: fr ? 'Expires' : 'Expired' };
                  const icons: Record<string, string> = { all: 'list', pending: 'schedule', accepted: 'check-circle', declined: 'cancel', expired: 'timer-off' };
                  return (
                    <Pressable key={st} style={[s.filterChip, active && { backgroundColor: colors[st], borderColor: colors[st] }]} onPress={() => { Haptics.selectionAsync(); setTransferFilterStatus(st); }}>
                      <MaterialIcons name={icons[st] as any} size={12} color={active ? '#FFF' : colors[st]} />
                      <Text style={[s.filterChipText, active && { color: '#FFF' }]}>{labels[st]}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {/* Period filter */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
                {(['all', '7d', '30d', '3m'] as const).map(p => {
                  const active = transferFilterPeriod === p;
                  const labels: Record<string, string> = { all: fr ? 'Tout' : 'All', '7d': '7j', '30d': '30j', '3m': '3m' };
                  return (
                    <Pressable key={p} style={[s.filterChip, active && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }]} onPress={() => { Haptics.selectionAsync(); setTransferFilterPeriod(p); }}>
                      <MaterialIcons name="date-range" size={12} color={active ? '#FFF' : '#3B82F6'} />
                      <Text style={[s.filterChipText, active && { color: '#FFF' }]}>{labels[p]}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {/* Sender filter indicator */}
              {transferFilterSender ? (
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, backgroundColor: '#0EA5E910', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10 }} onPress={() => { Haptics.selectionAsync(); setTransferFilterSender(null); }}>
                  <MaterialIcons name="person" size={14} color="#0EA5E9" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#0EA5E9', flex: 1 }}>{transferProfileMap[transferFilterSender] || '?'}</Text>
                  <MaterialIcons name="close" size={14} color="#0EA5E9" />
                </Pressable>
              ) : null}
              {/* Reset filters */}
              {hasActiveTransferFilter ? (
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6, paddingVertical: 6 }} onPress={resetTransferFilters}>
                  <MaterialIcons name="filter-list-off" size={14} color="#94A3B8" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Reinitialiser les filtres' : 'Reset filters'}</Text>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>{rawTransferData.length > 0 ? `${transferStats.pending + transferStats.accepted + transferStats.declined}/${rawTransferData.length}` : ''}</Text>
                </Pressable>
              ) : null}
            </View>

            <View style={s.chartCard}>
              {/* Transfer Smart Alerts */}
              {transferAlerts.length > 0 ? (
                <View style={{ marginBottom: 12, gap: 6 }}>
                  {transferAlerts.map(alert => (
                    <View key={alert.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: alert.color + '08', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: alert.color + '20' }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: alert.color + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name={alert.icon as any} size={13} color={alert.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: alert.color }}>{alert.title}</Text>
                        <Text style={{ fontSize: 10, color: alert.color + 'CC', lineHeight: 14, marginTop: 1 }}>{alert.message}</Text>
                      </View>
                      {alert.severity === 'critical' ? <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: alert.color }} /> : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Transfer Trend Alerts (monthly history) */}
              {trendAlerts.length > 0 ? (
                <View style={{ marginBottom: 12, gap: 6 }}>
                  <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 2 }}>{fr ? 'TENDANCES MENSUELLES' : 'MONTHLY TRENDS'}</Text>
                  {trendAlerts.map(ta => (
                    <View key={ta.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: ta.color + '08', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: ta.color + '20' }}>
                      <View style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: ta.color + '15', alignItems: 'center', justifyContent: 'center' }}>
                        <MaterialIcons name={ta.icon as any} size={13} color={ta.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: ta.color }}>{ta.title}</Text>
                        <Text style={{ fontSize: 10, color: ta.color + 'CC', lineHeight: 14, marginTop: 1 }}>{ta.message}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Reminder button for overdue transfers */}
              {overdueTransfers.length > 0 ? (
                <View style={{ marginBottom: 12, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FDE68A' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name="notifications-active" size={16} color="#D97706" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400E' }}>
                        {overdueTransfers.length} {fr ? 'transfert(s) en attente +7j' : 'transfer(s) pending 7+ days'}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#B45309', marginTop: 1 }}>
                        {unremindedOverdue.length > 0
                          ? (fr ? `${unremindedOverdue.length} non rappele(s)` : `${unremindedOverdue.length} not yet reminded`)
                          : (fr ? 'Tous deja rappeles' : 'All already reminded')}
                      </Text>
                    </View>
                    <Pressable
                      style={[{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: unremindedOverdue.length > 0 ? '#D97706' : '#E2E8F0' }, sendingTransferReminder && { opacity: 0.5 }]}
                      onPress={sendTransferReminders}
                      disabled={sendingTransferReminder || unremindedOverdue.length === 0}
                    >
                      {sendingTransferReminder ? <ActivityIndicator size="small" color="#FFF" /> : (
                        <>
                          <MaterialIcons name="send" size={13} color={unremindedOverdue.length > 0 ? '#FFF' : '#94A3B8'} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: unremindedOverdue.length > 0 ? '#FFF' : '#94A3B8' }}>
                            {fr ? 'Rappeler' : 'Remind'}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                  {lastTransferReminder ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#FDE68A' }}>
                      <MaterialIcons name="check-circle" size={11} color="#D97706" />
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#B45309' }}>
                        {fr ? 'Dernier rappel' : 'Last reminder'}: {new Date(lastTransferReminder).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Urgent reminder for approaching expiration (25-30 days) */}
              {approachingExpiration.length > 0 ? (
                <View style={{ marginBottom: 12, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FECACA' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#DC262615', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name="timer" size={16} color="#DC2626" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#991B1B' }}>
                        {approachingExpiration.length} {fr ? 'transfert(s) expirent bientot' : 'transfer(s) expiring soon'}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#DC2626', marginTop: 1 }}>
                        {fr ? 'Annulation auto dans 0-5 jours' : 'Auto-cancel in 0-5 days'}
                      </Text>
                    </View>
                    <Pressable
                      style={[{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#DC2626' }, sendingUrgentReminder && { opacity: 0.5 }]}
                      onPress={sendUrgentReminders}
                      disabled={sendingUrgentReminder}
                    >
                      {sendingUrgentReminder ? <ActivityIndicator size="small" color="#FFF" /> : (
                        <>
                          <MaterialIcons name="priority-high" size={13} color="#FFF" />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>
                            {fr ? 'Rappel urgent' : 'Urgent remind'}
                          </Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/* KPI row */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <Pressable style={{ flex: 1, alignItems: 'center', backgroundColor: transferFilterStatus === 'pending' ? '#F59E0B15' : '#F59E0B08', borderRadius: 12, paddingVertical: 12, gap: 2, borderWidth: 1, borderColor: transferFilterStatus === 'pending' ? '#F59E0B40' : '#F59E0B20' }} onPress={() => { Haptics.selectionAsync(); setTransferFilterStatus(transferFilterStatus === 'pending' ? 'all' : 'pending'); }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#F59E0B' }}>{transferStats.pending}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'En attente' : 'Pending'}</Text>
                </Pressable>
                <Pressable style={{ flex: 1, alignItems: 'center', backgroundColor: transferFilterStatus === 'accepted' ? '#10B98115' : '#10B98108', borderRadius: 12, paddingVertical: 12, gap: 2, borderWidth: 1, borderColor: transferFilterStatus === 'accepted' ? '#10B98140' : '#10B98120' }} onPress={() => { Haptics.selectionAsync(); setTransferFilterStatus(transferFilterStatus === 'accepted' ? 'all' : 'accepted'); }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#10B981' }}>{transferStats.accepted}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Acceptes' : 'Accepted'}</Text>
                </Pressable>
                <Pressable style={{ flex: 1, alignItems: 'center', backgroundColor: transferFilterStatus === 'declined' ? '#EF444415' : '#EF444408', borderRadius: 12, paddingVertical: 12, gap: 2, borderWidth: 1, borderColor: transferFilterStatus === 'declined' ? '#EF444440' : '#EF444420' }} onPress={() => { Haptics.selectionAsync(); setTransferFilterStatus(transferFilterStatus === 'declined' ? 'all' : 'declined'); }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#EF4444' }}>{transferStats.declined}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Refuses' : 'Declined'}</Text>
                </Pressable>
                {transferStats.expired > 0 ? (
                  <Pressable style={{ flex: 1, alignItems: 'center', backgroundColor: transferFilterStatus === 'expired' ? '#94A3B815' : '#94A3B808', borderRadius: 12, paddingVertical: 12, gap: 2, borderWidth: 1, borderColor: transferFilterStatus === 'expired' ? '#94A3B840' : '#94A3B820' }} onPress={() => { Haptics.selectionAsync(); setTransferFilterStatus(transferFilterStatus === 'expired' ? 'all' : 'expired'); }}>
                    <Text style={{ fontSize: 22, fontWeight: '800', color: '#94A3B8' }}>{transferStats.expired}</Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Expires' : 'Expired'}</Text>
                  </Pressable>
                ) : null}
              </View>

              {/* Analytics row: acceptance rate + avg response time */}
              {(transferStats.accepted + transferStats.declined) > 0 ? (
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: transferStats.acceptanceRate >= 60 ? '#DCFCE7' : transferStats.acceptanceRate >= 30 ? '#FEF3C7' : '#FEF2F2', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name="pie-chart" size={14} color={transferStats.acceptanceRate >= 60 ? '#10B981' : transferStats.acceptanceRate >= 30 ? '#D97706' : '#EF4444'} />
                    </View>
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: transferStats.acceptanceRate >= 60 ? '#10B981' : transferStats.acceptanceRate >= 30 ? '#D97706' : '#EF4444' }}>{transferStats.acceptanceRate}%</Text>
                      <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' }}>{fr ? 'Taux accept.' : 'Accept rate'}</Text>
                    </View>
                  </View>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name="timer" size={14} color="#3B82F6" />
                    </View>
                    <View>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#3B82F6' }}>{transferStats.avgResponseTimeHours < 1 ? '<1' : transferStats.avgResponseTimeHours}h</Text>
                      <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' }}>{fr ? 'Temps moy.' : 'Avg response'}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Weekly evolution chart */}
              {transferStats.weeklyEvolution.length > 1 ? (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 8 }}>{fr ? 'Evolution par semaine' : 'Weekly evolution'}</Text>
                  {(() => {
                    const maxW = Math.max(...transferStats.weeklyEvolution.map(w => w.count), 1);
                    return transferStats.weeklyEvolution.map((w, idx) => {
                      const isLast = idx === transferStats.weeklyEvolution.length - 1;
                      return (
                        <View key={w.week} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Text style={{ width: 42, fontSize: 9, fontWeight: isLast ? '800' : '600', color: isLast ? '#0EA5E9' : '#94A3B8' }}>{w.week}</Text>
                          <View style={{ flex: 1, height: 16, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', flexDirection: 'row' }}>
                            {w.accepted > 0 ? <View style={{ height: '100%' as any, width: `${Math.max(2, (w.accepted / maxW) * 100)}%`, backgroundColor: '#10B981', borderRadius: 4 }} /> : null}
                            {w.declined > 0 ? <View style={{ height: '100%' as any, width: `${Math.max(1, (w.declined / maxW) * 100)}%`, backgroundColor: '#EF4444' }} /> : null}
                            {(w.count - w.accepted - w.declined) > 0 ? <View style={{ height: '100%' as any, width: `${Math.max(1, ((w.count - w.accepted - w.declined) / maxW) * 100)}%`, backgroundColor: '#F59E0B' }} /> : null}
                          </View>
                          <Text style={{ width: 20, fontSize: 10, fontWeight: '800', color: '#0F172A', textAlign: 'right' }}>{w.count}</Text>
                        </View>
                      );
                    });
                  })()}
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 6, justifyContent: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#10B981' }} />
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Accepte' : 'Accepted'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#EF4444' }} />
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Refuse' : 'Declined'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#F59E0B' }} />
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Attente' : 'Pending'}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Top senders */}
              {transferStats.topSenders.length > 0 ? (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 8 }}>{fr ? 'Top expediteurs' : 'Top senders'}</Text>
                  {transferStats.topSenders.map((sender, idx) => {
                    const senderAcceptRate = sender.count > 0 ? Math.round((sender.accepted / sender.count) * 100) : 0;
                    const isSenderFiltered = transferFilterSender === sender.userId;
                    return (
                      <Pressable key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F1F5F9', backgroundColor: isSenderFiltered ? '#0EA5E908' : 'transparent', marginHorizontal: isSenderFiltered ? -4 : 0, paddingHorizontal: isSenderFiltered ? 4 : 0, borderRadius: isSenderFiltered ? 8 : 0 }} onPress={() => { Haptics.selectionAsync(); setTransferFilterSender(isSenderFiltered ? null : sender.userId); }}>
                        <View style={{ width: 22, height: 22, borderRadius: 7, backgroundColor: isSenderFiltered ? '#0EA5E9' : idx === 0 ? '#0EA5E9' : '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                          {isSenderFiltered ? <MaterialIcons name="filter-list" size={11} color="#FFF" /> : <Text style={{ fontSize: 10, fontWeight: '800', color: idx === 0 ? '#FFF' : '#94A3B8' }}>{idx + 1}</Text>}
                        </View>
                        <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: isSenderFiltered ? '#0EA5E9' : '#0F172A' }} numberOfLines={1}>{sender.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#0EA5E9' }}>{sender.count}</Text>
                          <View style={{ backgroundColor: senderAcceptRate >= 60 ? '#DCFCE7' : '#FEF3C7', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                            <Text style={{ fontSize: 8, fontWeight: '700', color: senderAcceptRate >= 60 ? '#10B981' : '#D97706' }}>{senderAcceptRate}%</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {/* Monthly Transfer History (6 months) */}
              {monthlyTransferHistory.length > 0 && monthlyTransferHistory.some(m => m.total > 0) ? (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 8 }}>{fr ? 'Historique mensuel (6 mois)' : 'Monthly history (6 months)'}</Text>
                  {(() => {
                    const maxM = Math.max(...monthlyTransferHistory.map(m => m.total), 1);
                    return monthlyTransferHistory.map((m, idx) => {
                      const isLast = idx === monthlyTransferHistory.length - 1;
                      const rateColor = m.acceptanceRate >= 60 ? '#10B981' : m.acceptanceRate >= 30 ? '#D97706' : m.total > 0 ? '#EF4444' : '#CBD5E1';
                      return (
                        <View key={m.month} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                          <Text style={{ width: 44, fontSize: 9, fontWeight: isLast ? '800' : '600', color: isLast ? '#3B82F6' : '#94A3B8' }}>{m.month}</Text>
                          <View style={{ flex: 1, height: 16, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', flexDirection: 'row' }}>
                            {m.accepted > 0 ? <View style={{ height: '100%' as any, width: `${Math.max(2, (m.accepted / maxM) * 100)}%`, backgroundColor: '#10B981' }} /> : null}
                            {m.declined > 0 ? <View style={{ height: '100%' as any, width: `${Math.max(1, (m.declined / maxM) * 100)}%`, backgroundColor: '#EF4444' }} /> : null}
                            {m.expired > 0 ? <View style={{ height: '100%' as any, width: `${Math.max(1, (m.expired / maxM) * 100)}%`, backgroundColor: '#94A3B8' }} /> : null}
                            {(m.total - m.accepted - m.declined - m.expired) > 0 ? <View style={{ height: '100%' as any, width: `${Math.max(1, ((m.total - m.accepted - m.declined - m.expired) / maxM) * 100)}%`, backgroundColor: '#F59E0B' }} /> : null}
                          </View>
                          <Text style={{ width: 20, fontSize: 10, fontWeight: '800', color: '#0F172A', textAlign: 'right' }}>{m.total}</Text>
                          <View style={{ backgroundColor: rateColor + '15', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, minWidth: 30, alignItems: 'center' }}>
                            <Text style={{ fontSize: 8, fontWeight: '700', color: rateColor }}>{m.total > 0 ? `${m.acceptanceRate}%` : '-'}</Text>
                          </View>
                        </View>
                      );
                    });
                  })()}
                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: '#10B981' }} />
                      <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Accepte' : 'Accepted'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: '#EF4444' }} />
                      <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Refuse' : 'Declined'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: '#94A3B8' }} />
                      <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Expire' : 'Expired'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: '#F59E0B' }} />
                      <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Attente' : 'Pending'}</Text>
                    </View>
                  </View>
                  {/* Month-over-month delta */}
                  {monthlyTransferHistory.filter(m => m.total > 0).length >= 2 ? (() => {
                    const recent = monthlyTransferHistory[monthlyTransferHistory.length - 1];
                    const prev = monthlyTransferHistory[monthlyTransferHistory.length - 2];
                    const volumeDelta = prev.total > 0 ? Math.round(((recent.total - prev.total) / prev.total) * 100) : 0;
                    const rateDelta = recent.acceptanceRate - prev.acceptanceRate;
                    const respDelta = prev.avgResponseH > 0 ? Math.round(((recent.avgResponseH - prev.avgResponseH) / prev.avgResponseH) * 100) : 0;
                    return (
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8 }}>
                          <MaterialIcons name={volumeDelta >= 0 ? 'trending-up' : 'trending-down'} size={12} color={volumeDelta >= 0 ? '#10B981' : '#EF4444'} />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: volumeDelta >= 0 ? '#10B981' : '#EF4444' }}>{volumeDelta >= 0 ? '+' : ''}{volumeDelta}%</Text>
                          <Text style={{ fontSize: 8, color: '#94A3B8' }}>{fr ? 'volume' : 'volume'}</Text>
                        </View>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8 }}>
                          <MaterialIcons name={rateDelta >= 0 ? 'thumb-up' : 'thumb-down'} size={12} color={rateDelta >= 0 ? '#10B981' : '#EF4444'} />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: rateDelta >= 0 ? '#10B981' : '#EF4444' }}>{rateDelta >= 0 ? '+' : ''}{rateDelta}pts</Text>
                          <Text style={{ fontSize: 8, color: '#94A3B8' }}>{fr ? 'taux' : 'rate'}</Text>
                        </View>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8 }}>
                          <MaterialIcons name="timer" size={12} color={respDelta <= 0 ? '#10B981' : '#EF4444'} />
                          <Text style={{ fontSize: 10, fontWeight: '700', color: respDelta <= 0 ? '#10B981' : '#EF4444' }}>{respDelta <= 0 ? '' : '+'}{respDelta}%</Text>
                          <Text style={{ fontSize: 8, color: '#94A3B8' }}>{fr ? 'delai' : 'resp.'}</Text>
                        </View>
                      </View>
                    );
                  })() : null}
                </View>
              ) : null}

              {/* Daily transfer heatmap (90 days) */}
              {dailyTransferHeatmap.weeks.length > 0 ? (
                <View style={{ marginBottom: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>{fr ? 'Activite quotidienne (90j)' : 'Daily activity (90d)'}</Text>
                    {dailyTransferHeatmap.peakDay ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF2F2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <MaterialIcons name="local-fire-department" size={10} color="#EF4444" />
                        <Text style={{ fontSize: 8, fontWeight: '700', color: '#EF4444' }}>
                          {fr ? 'Pic' : 'Peak'}: {new Date(dailyTransferHeatmap.peakDay + 'T00:00:00').toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })} ({dailyTransferHeatmap.maxCount})
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 2 }}>
                    {/* Day of week labels */}
                    <View style={{ gap: 2, justifyContent: 'flex-start', paddingTop: 0 }}>
                      {[fr ? 'L' : 'M', '', fr ? 'M' : 'W', '', fr ? 'V' : 'F', '', fr ? 'D' : 'S'].map((d, i) => (
                        <View key={i} style={{ height: 11, width: 14, justifyContent: 'center' }}>
                          {d ? <Text style={{ fontSize: 7, fontWeight: '600', color: '#CBD5E1', textAlign: 'right' }}>{d}</Text> : null}
                        </View>
                      ))}
                    </View>
                    {/* Heatmap grid */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2 }}>
                      {dailyTransferHeatmap.weeks.map((week, wi) => (
                        <View key={wi} style={{ gap: 2 }}>
                          {Array.from({ length: 7 }, (_, di) => {
                            const cell = week.find(c => c.dayOfWeek === di);
                            if (!cell) return <View key={di} style={{ width: 11, height: 11, borderRadius: 2, backgroundColor: 'transparent' }} />;
                            const ct = cell.count;
                            const bg = ct === 0 ? '#F1F5F9' : ct === 1 ? '#86EFAC' : ct <= 3 ? '#FDE047' : '#FCA5A5';
                            const isToday = cell.date === new Date().toISOString().slice(0, 10);
                            return (
                              <View key={di} style={{ width: 11, height: 11, borderRadius: 2, backgroundColor: bg, borderWidth: isToday ? 1.5 : 0, borderColor: isToday ? '#3B82F6' : 'transparent' }} />
                            );
                          })}
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                  {/* Legend + summary */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 8, color: '#94A3B8', fontWeight: '600' }}>{fr ? 'Moins' : 'Less'}</Text>
                      {['#F1F5F9', '#86EFAC', '#FDE047', '#FCA5A5'].map((c, i) => (
                        <View key={i} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
                      ))}
                      <Text style={{ fontSize: 8, color: '#94A3B8', fontWeight: '600' }}>{fr ? 'Plus' : 'More'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B' }}>{dailyTransferHeatmap.totalTransfers} {fr ? 'transferts' : 'transfers'}</Text>
                      <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1' }} />
                      <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B' }}>{dailyTransferHeatmap.activeDays} {fr ? 'jours actifs' : 'active days'}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Recent transfers list */}
              {transferStats.recent.length > 0 ? (
                <View style={{ gap: 0 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 8 }}>{fr ? 'Recents' : 'Recent'}</Text>
                  {transferStats.recent.map((tr, idx) => {
                    const sc = tr.status === 'accepted' ? '#10B981' : tr.status === 'declined' ? '#EF4444' : tr.status === 'expired' ? '#94A3B8' : '#F59E0B';
                    return (
                      <View key={tr.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F1F5F9' }}>
                        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: sc + '12', alignItems: 'center', justifyContent: 'center' }}>
                          <MaterialIcons name={tr.status === 'accepted' ? 'check-circle' : tr.status === 'declined' ? 'cancel' : tr.status === 'expired' ? 'timer-off' : 'schedule'} size={16} color={sc} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A', flexShrink: 1 }} numberOfLines={1}>{tr.playerName}</Text>
                            {tr.status === 'expired' ? (
                              <View style={{ backgroundColor: '#94A3B8', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                <Text style={{ fontSize: 7, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 }}>EXPIRED</Text>
                              </View>
                            ) : tr.status === 'pending' && (Date.now() - new Date(tr.createdAt).getTime()) > 25 * 86400000 ? (
                              <View style={{ backgroundColor: '#991B1B', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                <Text style={{ fontSize: 7, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 }}>EXPIRING</Text>
                              </View>
                            ) : tr.status === 'pending' && (Date.now() - new Date(tr.createdAt).getTime()) > 21 * 86400000 ? (
                              <View style={{ backgroundColor: '#DC2626', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                <Text style={{ fontSize: 7, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 }}>ESCALATED</Text>
                              </View>
                            ) : tr.status === 'pending' && (Date.now() - new Date(tr.createdAt).getTime()) > 7 * 86400000 ? (
                              <View style={{ backgroundColor: '#F59E0B', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                <Text style={{ fontSize: 7, fontWeight: '800', color: '#FFF', letterSpacing: 0.3 }}>OVERDUE</Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={{ fontSize: 10, color: '#94A3B8' }}>{tr.senderName} → {tr.recipientName}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#0EA5E9' }}>{tr.matchCount}m</Text>
                            {tr.challengeCount > 0 ? <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>{tr.challengeCount}d</Text> : null}
                          </View>
                          <Text style={{ fontSize: 8, color: '#CBD5E1' }}>{new Date(tr.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <MaterialIcons name="swap-horiz" size={24} color="#CBD5E1" />
                  <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>{fr ? 'Aucun transfert' : 'No transfers yet'}</Text>
                </View>
              )}
            </View>
          </Animated.View>
          );

          if (wKey === 'clubHealthAlerts' && decliningClubs.length > 0) return (
          <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
            <Text style={s.sectionTitle}>{fr ? 'CLUBS EN DECLIN' : 'DECLINING CLUBS'}</Text>
            <View style={s.chartCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <View style={[s.metricIcon, { backgroundColor: '#FEF2F2' }]}>
                  <MaterialIcons name="trending-down" size={18} color="#EF4444" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{decliningClubs.length} {fr ? 'club(s) en baisse' : 'declining club(s)'}</Text>
                  <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{fr ? 'Score de sante en baisse sur 30 jours' : 'Health score declining over 30 days'}</Text>
                </View>
              </View>
              {decliningClubs.map((club, idx) => (
                <Pressable
                  key={club.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F1F5F9' }}
                  onPress={() => { Haptics.selectionAsync(); router.push(`/club/${club.id}` as any); }}
                >
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: club.color + '12', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="home" size={16} color={club.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>{club.name}</Text>
                    <Text style={{ fontSize: 10, color: '#94A3B8' }}>{club.city}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 2 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: club.color }}>{club.score}</Text>
                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>/100</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FEF2F2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                      <MaterialIcons name="trending-down" size={10} color="#EF4444" />
                      <Text style={{ fontSize: 9, fontWeight: '800', color: '#EF4444' }}>{club.delta}</Text>
                    </View>
                  </View>
                  <MaterialIcons name="chevron-right" size={16} color="#CBD5E1" />
                </Pressable>
              ))}
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}
                onPress={() => { Haptics.selectionAsync(); router.push('/admin-clubs' as any); }}
              >
                <MaterialIcons name="open-in-new" size={14} color="#3B82F6" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#3B82F6' }}>{fr ? 'Voir tous les clubs' : 'View all clubs'}</Text>
              </Pressable>
            </View>
          </Animated.View>
          );

          if (wKey === 'moderation') return (
        <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
          <Text style={s.sectionTitle}>{fr ? 'MODERATION' : 'MODERATION'}</Text>
          <View style={s.moderationGrid}>
            <Pressable
              style={[s.modCard, { borderColor: '#F59E0B30' }]}
              onPress={() => { Haptics.selectionAsync(); router.push('/admin-moderation' as any); }}
            >
              <View style={[s.modIcon, { backgroundColor: '#FEF3C7' }]}>
                <MaterialIcons name="schedule" size={16} color="#F59E0B" />
              </View>
              <Text style={[s.modValue, { color: '#F59E0B' }]}>{stats.pendingReports}</Text>
              <Text style={s.modLabel}>{fr ? 'En attente' : 'Pending'}</Text>
            </Pressable>
            <View style={[s.modCard, { borderColor: '#D9770630' }]}>
              <View style={[s.modIcon, { backgroundColor: '#FEF3C7' }]}>
                <MaterialIcons name="warning-amber" size={16} color="#D97706" />
              </View>
              <Text style={[s.modValue, { color: '#D97706' }]}>{stats.activeWarnings}</Text>
              <Text style={s.modLabel}>{fr ? 'Avertis' : 'Warned'}</Text>
            </View>
            <View style={[s.modCard, { borderColor: '#DC262630' }]}>
              <View style={[s.modIcon, { backgroundColor: '#FEF2F2' }]}>
                <MaterialIcons name="block" size={16} color="#DC2626" />
              </View>
              <Text style={[s.modValue, { color: '#DC2626' }]}>{stats.activeBans}</Text>
              <Text style={s.modLabel}>{fr ? 'Bannis' : 'Banned'}</Text>
            </View>
            <View style={[s.modCard, { borderColor: '#EF444430' }]}>
              <View style={[s.modIcon, { backgroundColor: '#FEF2F2' }]}>
                <MaterialIcons name="flag" size={16} color="#EF4444" />
              </View>
              <Text style={[s.modValue, { color: '#EF4444' }]}>{stats.flaggedPlayers}</Text>
              <Text style={s.modLabel}>{fr ? 'Suspects' : 'Flagged'}</Text>
            </View>
          </View>
        </Animated.View>

          );

          if (wKey === 'appeals' && stats.pendingAppeals > 0) return (
          <Animated.View entering={FadeInDown.duration(300).delay(120)}>
            <Pressable
              style={[s.alertCard, { backgroundColor: stats.overdueAppeals > 0 ? '#FEF2F2' : '#FFFBEB', borderColor: stats.overdueAppeals > 0 ? '#FECACA' : '#FDE68A' }]}
              onPress={() => { Haptics.selectionAsync(); router.push('/admin-moderation' as any); }}
            >
              <View style={[s.alertIcon, { backgroundColor: stats.overdueAppeals > 0 ? '#DC262620' : '#D9770620' }]}>
                <MaterialIcons name={stats.overdueAppeals > 0 ? 'warning' : 'rate-review'} size={20} color={stats.overdueAppeals > 0 ? '#DC2626' : '#D97706'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.alertTitle, { color: stats.overdueAppeals > 0 ? '#991B1B' : '#92400E' }]}>
                  {stats.pendingAppeals} {fr ? 'appel(s) de ban en attente' : 'pending ban appeal(s)'}
                </Text>
                {stats.overdueAppeals > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <MaterialIcons name="timer-off" size={12} color="#DC2626" />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#DC2626' }}>
                      {stats.overdueAppeals} {fr ? 'en retard (+48h)' : 'overdue (+48h)'}
                    </Text>
                  </View>
                ) : (
                  <Text style={[s.alertDesc, { color: '#B45309' }]}>
                    {fr ? 'Cliquez pour examiner' : 'Click to review'}
                  </Text>
                )}
              </View>
              <MaterialIcons name="chevron-right" size={20} color={stats.overdueAppeals > 0 ? '#DC2626' : '#D97706'} />
            </Pressable>
            {stats.overdueAppeals > 0 ? (
              <Pressable
                style={[s.appealPushBtn, sendingAppealPush && { opacity: 0.5 }]}
                onPress={sendAppealDeadlinePush}
                disabled={sendingAppealPush}
              >
                {sendingAppealPush ? <ActivityIndicator size="small" color="#DC2626" /> : (
                  <><MaterialIcons name="notifications-active" size={14} color="#DC2626" /><Text style={s.appealPushText}>{fr ? 'Rappeler les admins' : 'Remind admins'}</Text></>
                )}
              </Pressable>
            ) : null}
          </Animated.View>
          );

          if (wKey === 'activity' && activityLogs.length > 0) return (
          <Animated.View entering={FadeInDown.duration(300).delay(130)}>
            <View style={s.activityHeader}>
              <Text style={s.sectionTitle}>{fr ? 'ACTIVITE RECENTE' : 'RECENT ACTIVITY'}</Text>
              <Pressable
                style={s.activityViewAllBtn}
                onPress={() => { Haptics.selectionAsync(); router.push('/admin-activity-log' as any); }}
              >
                <Text style={s.activityViewAllText}>{fr ? 'Voir tout' : 'View all'}</Text>
                <MaterialIcons name="chevron-right" size={16} color="#3B82F6" />
              </Pressable>
            </View>
            <View style={s.activityCard}>
              {activityLogs.slice(0, 10).map((log, idx) => {
                const cfg = ACTION_CONFIG[log.actionType] || { iconFr: log.actionType, iconEn: log.actionType, color: '#64748B', icon: 'info' };
                const timeAgo = getTimeAgo(log.createdAt, fr);
                return (
                  <View key={log.id} style={[s.activityItem, idx > 0 && s.activityItemBorder]}>
                    <View style={[s.activityIcon, { backgroundColor: cfg.color + '12' }]}>
                      <MaterialIcons name={cfg.icon as any} size={14} color={cfg.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.activityText} numberOfLines={1}>
                        {fr ? cfg.iconFr : cfg.iconEn}
                        {log.targetName ? ` — ${log.targetName}` : ''}
                      </Text>
                      <Text style={s.activityMeta}>
                        {log.adminName || 'Admin'} {"•"} {timeAgo}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </Animated.View>
          );

          if (wKey === 'weeklyMatches' && weeklyMatches.length > 0) return (
          <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
            <Text style={s.sectionTitle}>{fr ? 'MATCHS PAR SEMAINE' : 'MATCHES PER WEEK'}</Text>
            <View style={s.chartCard}>
              {(() => {
                const maxVal = Math.max(...weeklyMatches.map(w => w.count), 1);
                return weeklyMatches.map((w, idx) => (
                  <View key={idx} style={s.chartRow}>
                    <Text style={s.chartLabel} numberOfLines={1}>{w.week}</Text>
                    <View style={s.chartBarBg}>
                      <View style={[s.chartBarFill, { width: `${Math.max(2, (w.count / maxVal) * 100)}%`, backgroundColor: '#3B82F6' }]} />
                    </View>
                    <Text style={s.chartValue}>{w.count}</Text>
                  </View>
                ));
              })()}
              {recentSignups > 0 ? (
                <View style={s.chartFooter}>
                  <MaterialIcons name="person-add" size={12} color="#10B981" />
                  <Text style={s.chartFooterText}>+{recentSignups} {fr ? 'inscriptions cette semaine' : 'signups this week'}</Text>
                </View>
              ) : null}
            </View>
          </Animated.View>
          );

          if (wKey === 'userGrowth' && monthlyGrowth.length > 0) return (
          <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
            <View style={s.growthHeader}>
              <Text style={s.sectionTitle}>{fr ? 'CROISSANCE UTILISATEURS' : 'USER GROWTH'}</Text>
              <Pressable
                style={[s.growthExportBtn, exportingGrowth && { opacity: 0.5 }]}
                onPress={async () => {
                  if (exportingGrowth || monthlyGrowth.length === 0) return;
                  setExportingGrowth(true);
                  try {
                    const headers = 'Month,New Users';
                    const rows = monthlyGrowth.map(m => `${m.month},${m.count}`);
                    const summary = `\nTotal Users,${stats.totalUsers}\nPremium Users,${stats.premiumUsers}\nTotal Matches,${stats.totalMatches}\nTotal Clubs,${stats.totalClubs}\nVerified Clubs,${stats.verifiedClubs}\nTotal Terrains,${stats.totalTerrains}\nGrowth Delta,${growthDelta}%`;
                    const csv = [headers, ...rows, '', '--- Summary ---', summary].join('\n');
                    if (typeof document !== 'undefined') {
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `growth-report-${new Date().toISOString().slice(0, 10)}.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } else {
                      const FS = require('expo-file-system');
                      const SharingMod = require('expo-sharing');
                      const path = `${FS.cacheDirectory}growth-report-${new Date().toISOString().slice(0, 10)}.csv`;
                      await FS.writeAsStringAsync(path, csv, { encoding: FS.EncodingType.UTF8 });
                      const canShare = await SharingMod.isAvailableAsync();
                      if (canShare) await SharingMod.shareAsync(path, { mimeType: 'text/csv', dialogTitle: fr ? 'Exporter le rapport' : 'Export report' });
                    }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch (e) { console.log('[Dashboard] Export error:', e); }
                  setExportingGrowth(false);
                }}
                disabled={exportingGrowth}
              >
                {exportingGrowth ? <ActivityIndicator size="small" color="#2563EB" /> : <MaterialIcons name="file-download" size={16} color="#2563EB" />}
              </Pressable>
              {growthDelta !== 0 ? (
                <View style={[s.growthDelta, { backgroundColor: growthDelta > 0 ? '#DCFCE7' : '#FEF2F2' }]}>
                  <MaterialIcons name={growthDelta > 0 ? 'trending-up' : 'trending-down'} size={12} color={growthDelta > 0 ? '#10B981' : '#EF4444'} />
                  <Text style={[s.growthDeltaText, { color: growthDelta > 0 ? '#10B981' : '#EF4444' }]}>{growthDelta > 0 ? '+' : ''}{growthDelta}%</Text>
                </View>
              ) : null}
            </View>
            <View style={s.chartCard}>
              {(() => {
                const maxVal = Math.max(...monthlyGrowth.map(m => m.count), 1);
                return monthlyGrowth.map((m, idx) => {
                  const isLast = idx === monthlyGrowth.length - 1;
                  return (
                    <View key={idx} style={s.chartRow}>
                      <Text style={[s.chartLabel, isLast && { color: '#3B82F6', fontWeight: '700' as any }]}>{m.month}</Text>
                      <View style={s.chartBarBg}>
                        <View style={[s.chartBarFill, { width: `${Math.max(2, (m.count / maxVal) * 100)}%`, backgroundColor: isLast ? '#3B82F6' : '#93C5FD' }]} />
                      </View>
                      <Text style={[s.chartValue, isLast && { color: '#3B82F6' }]}>{m.count}</Text>
                    </View>
                  );
                });
              })()}
              <View style={s.chartFooter}>
                <MaterialIcons name="people" size={12} color="#3B82F6" />
                <Text style={[s.chartFooterText, { color: '#3B82F6' }]}>{stats.totalUsers} {fr ? 'utilisateurs au total' : 'total users'}</Text>
              </View>
            </View>
          </Animated.View>
          );

          if (wKey === 'clubVerification') return (
        <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
          <Pressable style={s.verifyHeader} onPress={() => { Haptics.selectionAsync(); setShowClubVerification(!showClubVerification); }}>
            <Text style={s.sectionTitle}>{fr ? 'VERIFICATION CLUBS' : 'CLUB VERIFICATION'}</Text>
            <View style={s.verifyStats}>
              <View style={[s.verifyStatPill, { backgroundColor: '#DCFCE7' }]}>
                <MaterialIcons name="verified" size={10} color="#10B981" />
                <Text style={[s.verifyStatText, { color: '#10B981' }]}>{stats.verifiedClubs}</Text>
              </View>
              <View style={[s.verifyStatPill, { backgroundColor: '#FEF3C7' }]}>
                <MaterialIcons name="pending" size={10} color="#D97706" />
                <Text style={[s.verifyStatText, { color: '#D97706' }]}>{unverifiedClubs.length}</Text>
              </View>
              <MaterialIcons name={showClubVerification ? 'expand-less' : 'expand-more'} size={18} color="#94A3B8" />
            </View>
          </Pressable>
          {showClubVerification ? (
            <View style={s.verifySection}>
              {unverifiedClubs.length === 0 ? (
                <View style={s.verifyEmpty}>
                  <MaterialIcons name="verified" size={32} color="#CBD5E1" />
                  <Text style={s.verifyEmptyText}>{fr ? 'Tous les clubs sont verifies' : 'All clubs are verified'}</Text>
                </View>
              ) : (
                unverifiedClubs.slice(0, 8).map(club => {
                  const criteria = [
                    { key: 'address', met: !!club.address, label: fr ? 'Adresse' : 'Address', icon: 'place' },
                    { key: 'members', met: club.membersCount >= 2, label: fr ? '2+ membres' : '2+ members', icon: 'people' },
                    { key: 'desc', met: !!club.description, label: 'Description', icon: 'description' },
                    { key: 'public', met: club.isPublic, label: fr ? 'Public' : 'Public', icon: 'public' },
                  ];
                  const metCount = criteria.filter(c => c.met).length;
                  const canVerify = metCount >= 3;
                  return (
                    <View key={club.id} style={s.verifyCard}>
                      <View style={s.verifyCardHeader}>
                        <View style={s.verifyClubIcon}>
                          <MaterialIcons name="home" size={18} color="#7C3AED" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.verifyClubName} numberOfLines={1}>{club.name}</Text>
                          <Text style={s.verifyClubCity}>{club.city} {"•"} {club.membersCount} {fr ? 'membres' : 'members'}</Text>
                        </View>
                        <Pressable
                          style={[s.verifyBtn, canVerify ? { backgroundColor: '#2563EB' } : { backgroundColor: '#E2E8F0' }]}
                          onPress={async () => {
                            if (!canVerify) {
                              showAlert(fr ? 'Criteres insuffisants' : 'Insufficient criteria', fr ? 'Le club doit remplir au moins 3 criteres sur 4.' : 'Club must meet at least 3 of 4 criteria.');
                              return;
                            }
                            setVerifyingClubId(club.id);
                            Haptics.selectionAsync();
                            const supabase = getSupabaseClient();
                            const { error } = await supabase.from('clubs').update({ is_verified: true, updated_at: new Date().toISOString() }).eq('id', club.id);
                            setVerifyingClubId(null);
                            if (!error) {
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              setUnverifiedClubs(prev => prev.filter(c => c.id !== club.id));
                              setStats(prev => ({ ...prev, verifiedClubs: prev.verifiedClubs + 1 }));
                              logAdminAction({ actionType: 'club_verify', targetType: 'club', targetId: club.id, targetName: club.name, actionDetail: `Verified club: ${club.name} (${club.city})`, metadata: { criteria: criteria.map(c => ({ ...c })) } });
                              // Send push notification to club owner
                              try {
                                const { data: clubOwner } = await supabase.from('clubs').select('user_id').eq('id', club.id).single();
                                if (clubOwner?.user_id) {
                                  supabase.functions.invoke('send-push', { body: { type: 'club_verification', payload: { targetUserId: clubOwner.user_id, clubName: club.name, clubId: club.id } } });
                                }
                              } catch { /* silent */ }
                            }
                          }}
                          disabled={verifyingClubId === club.id}
                        >
                          {verifyingClubId === club.id ? <ActivityIndicator size="small" color="#FFF" /> : (
                            <><MaterialIcons name="verified" size={14} color={canVerify ? '#FFF' : '#94A3B8'} /><Text style={[s.verifyBtnText, !canVerify && { color: '#94A3B8' }]}>{fr ? 'Verifier' : 'Verify'}</Text></>
                          )}
                        </Pressable>
                      </View>
                      <View style={s.criteriaRow}>
                        {criteria.map(c => (
                          <View key={c.key} style={[s.criteriaChip, c.met ? { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' } : { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                            <MaterialIcons name={c.met ? 'check-circle' : 'cancel'} size={10} color={c.met ? '#10B981' : '#EF4444'} />
                            <Text style={[s.criteriaText, { color: c.met ? '#10B981' : '#EF4444' }]}>{c.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })
              )}
              {unverifiedClubs.length > 8 ? (
                <Text style={s.verifyMore}>+{unverifiedClubs.length - 8} {fr ? 'clubs restants' : 'more clubs'}</Text>
              ) : null}
            </View>
          ) : null}
        </Animated.View>

          );

          if (wKey === 'eloDistribution' && eloDistribution.length > 0) return (
          <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
            <Text style={s.sectionTitle}>{fr ? 'DISTRIBUTION ELO' : 'ELO DISTRIBUTION'}</Text>
            <View style={s.chartCard}>
              {(() => {
                const totalElo = eloDistribution.reduce((sum, e) => sum + e.count, 0) || 1;
                return eloDistribution.map((e, idx) => (
                  <View key={idx} style={s.chartRow}>
                    <View style={[s.eloTierDot, { backgroundColor: e.color }]} />
                    <Text style={[s.chartLabel, { width: 64 }]}>{e.label}</Text>
                    <View style={s.chartBarBg}>
                      <View style={[s.chartBarFill, { width: `${Math.max(2, (e.count / totalElo) * 100)}%`, backgroundColor: e.color }]} />
                    </View>
                    <Text style={s.chartValue}>{e.count}</Text>
                    <Text style={s.chartPercent}>{Math.round((e.count / totalElo) * 100)}%</Text>
                  </View>
                ));
              })()}
            </View>
          </Animated.View>
          );

          if (wKey === 'onboarding') return (
          <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
            <Text style={s.sectionTitle}>ONBOARDING</Text>
            <View style={s.chartCard}>
              {/* Step-level funnel (from tracking table) */}
              {stepAnalytics && stepAnalytics.steps.length > 0 ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialIcons name="filter-list" size={16} color="#3B82F6" />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Entonnoir par etape' : 'Step Funnel'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 10, color: '#94A3B8', fontWeight: '600' }}>{stepAnalytics.totalSessions} sessions</Text>
                      <View style={{ backgroundColor: stepAnalytics.completionRate >= 50 ? '#DCFCE7' : '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: stepAnalytics.completionRate >= 50 ? '#10B981' : '#D97706' }}>{stepAnalytics.completionRate}%</Text>
                      </View>
                    </View>
                  </View>
                  <View style={{ gap: 4 }}>
                    {stepAnalytics.steps.filter(st => st.step >= 1).map((st, idx) => {
                      const maxEntered = Math.max(...stepAnalytics.steps.filter(s => s.step >= 1).map(s => s.entered), 1);
                      const pct = maxEntered > 0 ? Math.round((st.entered / maxEntered) * 100) : 0;
                      const stepColors = ['#3B82F6', '#10B981', '#F59E0B', '#7C3AED', '#0EA5E9', '#EC4899', '#D97706', '#EF4444'];
                      const color = stepColors[idx % stepColors.length];
                      return (
                        <View key={st.step}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                            <Text style={{ width: 18, fontSize: 9, fontWeight: '800', color: '#94A3B8', textAlign: 'center' }}>{st.step}</Text>
                            <Text style={{ flex: 1, fontSize: 10, fontWeight: '600', color: '#0F172A' }}>{st.name}</Text>
                            <Text style={{ fontSize: 10, fontWeight: '800', color }}>{st.entered}</Text>
                            {st.avgDurationSec > 0 ? <Text style={{ fontSize: 8, color: '#94A3B8', width: 28, textAlign: 'right' }}>{st.avgDurationSec}s</Text> : null}
                            {st.dropoffRate > 20 ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' }} /> : null}
                          </View>
                          <View style={{ height: 5, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden', marginLeft: 24, marginBottom: 3 }}>
                            <View style={{ height: '100%' as any, width: `${Math.max(3, pct)}%`, backgroundColor: color, borderRadius: 3 }} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  {/* Summary row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', gap: 8 }}>
                    {stepAnalytics.avgTotalDurationSec > 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialIcons name="timer" size={12} color="#3B82F6" />
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#64748B' }}>{fr ? 'Duree moy.' : 'Avg duration'}: {Math.floor(stepAnalytics.avgTotalDurationSec / 60)}m{stepAnalytics.avgTotalDurationSec % 60}s</Text>
                      </View>
                    ) : null}
                    {stepAnalytics.topDropoffStep ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF2F2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#EF4444' }} />
                        <Text style={{ fontSize: 9, fontWeight: '700', color: '#DC2626' }}>{fr ? 'Abandon' : 'Dropoff'}: {stepAnalytics.topDropoffStep}</Text>
                      </View>
                    ) : null}
                  </View>
                </>
              ) : (
                <>
                  {/* Fallback: user_profiles-based funnel */}
                  <View style={{ gap: 8, marginBottom: 12 }}>
                    {[
                      { label: fr ? 'Inscrits' : 'Registered', count: onboardingStats.total, color: '#3B82F6', icon: 'person-add' },
                      { label: fr ? 'Profil complete' : 'Profile completed', count: onboardingStats.withProfile, color: '#10B981', icon: 'badge' },
                      { label: fr ? 'Consentement donne' : 'Consent given', count: onboardingStats.withConsent, color: '#7C3AED', icon: 'verified-user' },
                    ].map((step, idx) => {
                      const pct = onboardingStats.total > 0 ? Math.round((step.count / onboardingStats.total) * 100) : 0;
                      return (
                        <View key={idx}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: step.color + '12', alignItems: 'center', justifyContent: 'center' }}>
                              <MaterialIcons name={step.icon as any} size={14} color={step.color} />
                            </View>
                            <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#0F172A' }}>{step.label}</Text>
                            <Text style={{ fontSize: 14, fontWeight: '800', color: step.color }}>{step.count}</Text>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8', width: 32, textAlign: 'right' }}>{pct}%</Text>
                          </View>
                          <View style={{ height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden', marginLeft: 36 }}>
                            <View style={{ height: '100%' as any, width: `${Math.max(3, pct)}%`, backgroundColor: step.color, borderRadius: 3 }} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialIcons name="filter-list" size={14} color="#3B82F6" />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>{fr ? 'Taux de completion' : 'Completion rate'}</Text>
                    </View>
                    <View style={{ backgroundColor: onboardingStats.conversionRate >= 70 ? '#DCFCE7' : onboardingStats.conversionRate >= 40 ? '#FEF3C7' : '#FEF2F2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: onboardingStats.conversionRate >= 70 ? '#10B981' : onboardingStats.conversionRate >= 40 ? '#D97706' : '#EF4444' }}>{onboardingStats.conversionRate}%</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 8 }}>
                    <MaterialIcons name="info-outline" size={14} color="#3B82F6" />
                    <Text style={{ flex: 1, fontSize: 10, color: '#3B82F6', lineHeight: 14 }}>
                      {fr ? 'Le tracking detaille par etape sera disponible quand des utilisateurs passeront l\'onboarding.' : 'Detailed step tracking will appear once users go through onboarding.'}
                    </Text>
                  </View>
                </>
              )}
            </View>
          </Animated.View>
          );

          if (wKey === 'pushAnalytics') return (
          <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
            <Text style={s.sectionTitle}>PUSH ANALYTICS</Text>
            <View style={s.chartCard}>
              {/* KPI row */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 12, gap: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#3B82F6' }}>{pushStats.sent}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Envoyees' : 'Sent'}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 12, paddingVertical: 12, gap: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#EF4444' }}>{pushStats.errors || 0}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Erreurs' : 'Errors'}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#DCFCE7', borderRadius: 12, paddingVertical: 12, gap: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#10B981' }}>
                    {pushStats.sent > 0 ? `${Math.round(((pushStats.sent - (pushStats.errors || 0)) / pushStats.sent) * 100)}%` : '-'}
                  </Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Livraison' : 'Delivery'}</Text>
                </View>
              </View>

              {/* Daily chart (last 7 days) */}
              {pushStats.daily && pushStats.daily.length > 0 ? (
                <View style={{ marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 8 }}>{fr ? '7 derniers jours' : 'Last 7 days'}</Text>
                  {(() => {
                    const maxDaily = Math.max(...pushStats.daily.map(d => d.sent), 1);
                    return pushStats.daily.map((d, idx) => {
                      const dateLabel = new Date(d.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { weekday: 'short' });
                      const isToday = idx === pushStats.daily.length - 1;
                      return (
                        <View key={d.date} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Text style={{ width: 32, fontSize: 9, fontWeight: isToday ? '800' : '600', color: isToday ? '#3B82F6' : '#94A3B8' }}>{dateLabel}</Text>
                          <View style={{ flex: 1, height: 16, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', flexDirection: 'row' }}>
                            <View style={{ height: '100%' as any, width: `${Math.max(2, (d.sent / maxDaily) * 100)}%`, backgroundColor: '#3B82F6', borderRadius: 4 }} />
                            {d.errors > 0 ? <View style={{ height: '100%' as any, width: `${Math.max(1, (d.errors / maxDaily) * 100)}%`, backgroundColor: '#EF4444', borderTopRightRadius: 4, borderBottomRightRadius: 4 }} /> : null}
                          </View>
                          <Text style={{ width: 24, fontSize: 10, fontWeight: '800', color: '#0F172A', textAlign: 'right' }}>{d.sent}</Text>
                          {d.errors > 0 ? <Text style={{ width: 20, fontSize: 9, fontWeight: '600', color: '#EF4444', textAlign: 'right' }}>-{d.errors}</Text> : null}
                        </View>
                      );
                    });
                  })()}
                  {/* Legend */}
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 6, justifyContent: 'flex-end' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#3B82F6' }} />
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Envoye' : 'Sent'}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#EF4444' }} />
                      <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Erreur' : 'Error'}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* By target type */}
              {Object.keys(pushStats.types).length > 0 ? (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 4 }}>{fr ? 'Par type de cible' : 'By target type'}</Text>
                  {(() => {
                    const maxPush = Math.max(...Object.values(pushStats.types), 1);
                    const typeColors: Record<string, string> = { all: '#3B82F6', city: '#10B981', club: '#7C3AED', level: '#D97706' };
                    return Object.entries(pushStats.types).sort((a, b) => b[1] - a[1]).map(([type, count]) => (
                      <View key={type} style={s.chartRow}>
                        <Text style={[s.chartLabel, { width: 56 }]}>{type === 'all' ? (fr ? 'Tous' : 'All') : type}</Text>
                        <View style={s.chartBarBg}>
                          <View style={[s.chartBarFill, { width: `${Math.max(4, (count / maxPush) * 100)}%`, backgroundColor: typeColors[type] || '#94A3B8' }]} />
                        </View>
                        <Text style={s.chartValue}>{count}</Text>
                      </View>
                    ));
                  })()}
                </View>
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <MaterialIcons name="notifications-off" size={24} color="#CBD5E1" />
                  <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>{fr ? 'Aucune notification envoyee' : 'No notifications sent yet'}</Text>
                </View>
              )}

              {/* Push Delivery Heatmap (hour of day) */}
              {pushHourlyData.some(h => h.count > 0) ? (
                <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <MaterialIcons name="grid-on" size={14} color="#7C3AED" />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>{fr ? 'Heatmap par heure' : 'Hourly Heatmap'}</Text>
                    </View>
                    {(() => {
                      const bestHour = pushHourlyData.reduce((best, h) => h.count > best.count ? h : best, { hour: 0, count: 0, platformBreakdown: {} });
                      return bestHour.count > 0 ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                          <MaterialIcons name="local-fire-department" size={10} color="#10B981" />
                          <Text style={{ fontSize: 9, fontWeight: '700', color: '#10B981' }}>{fr ? 'Pic' : 'Peak'}: {bestHour.hour}h ({bestHour.count})</Text>
                        </View>
                      ) : null;
                    })()}
                  </View>
                  {/* Heatmap grid: 4 rows × 6 columns (4-hour blocks) */}
                  <View style={{ gap: 3 }}>
                    {[0, 6, 12, 18].map(startHour => {
                      const maxCount = Math.max(...pushHourlyData.map(h => h.count), 1);
                      return (
                        <View key={startHour} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                          <Text style={{ width: 24, fontSize: 8, fontWeight: '600', color: '#94A3B8', textAlign: 'right' }}>{startHour}h</Text>
                          {Array.from({ length: 6 }, (_, i) => {
                            const hour = startHour + i;
                            const data = pushHourlyData.find(h => h.hour === hour) || { hour, count: 0, platformBreakdown: {} };
                            const intensity = data.count / maxCount;
                            const bg = data.count === 0 ? '#F1F5F9'
                              : intensity < 0.25 ? '#C7D2FE'
                              : intensity < 0.5 ? '#818CF8'
                              : intensity < 0.75 ? '#6366F1'
                              : '#4F46E5';
                            const textColor = intensity >= 0.5 ? '#FFF' : '#64748B';
                            return (
                              <View key={hour} style={{ flex: 1, height: 28, borderRadius: 4, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
                                {data.count > 0 ? <Text style={{ fontSize: 7, fontWeight: '800', color: textColor }}>{data.count}</Text> : null}
                              </View>
                            );
                          })}
                        </View>
                      );
                    })}
                    {/* Hour labels */}
                    <View style={{ flexDirection: 'row', marginLeft: 27, gap: 3 }}>
                      {[0, 6, 12, 18].map(startHour => (
                        <React.Fragment key={startHour}>
                          {Array.from({ length: 6 }, (_, i) => (
                            <View key={startHour + i} style={{ flex: 1, alignItems: 'center' }}>
                              <Text style={{ fontSize: 6, color: '#CBD5E1', fontWeight: '600' }}>{startHour + i}</Text>
                            </View>
                          ))}
                        </React.Fragment>
                      )).flat().slice(0, 6)}
                    </View>
                    <View style={{ flexDirection: 'row', marginLeft: 27, gap: 3 }}>
                      {Array.from({ length: 6 }, (_, i) => (
                        <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                          <Text style={{ fontSize: 6, color: '#CBD5E1', fontWeight: '600' }}>{i}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                  {/* Legend + Platform breakdown */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Text style={{ fontSize: 7, color: '#94A3B8', fontWeight: '600' }}>{fr ? 'Moins' : 'Less'}</Text>
                      {['#F1F5F9', '#C7D2FE', '#818CF8', '#6366F1', '#4F46E5'].map((c, i) => (
                        <View key={i} style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: c }} />
                      ))}
                      <Text style={{ fontSize: 7, color: '#94A3B8', fontWeight: '600' }}>{fr ? 'Plus' : 'More'}</Text>
                    </View>
                    {(() => {
                      const totalHeatmap = pushHourlyData.reduce((s, h) => s + h.count, 0);
                      const platformTotals: Record<string, number> = {};
                      pushHourlyData.forEach(h => Object.entries(h.platformBreakdown).forEach(([p, c]) => { platformTotals[p] = (platformTotals[p] || 0) + c; }));
                      const platformColors: Record<string, string> = { ios: '#000', android: '#3DDC84', web: '#3B82F6', unknown: '#94A3B8' };
                      return Object.keys(platformTotals).length > 0 ? (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          {Object.entries(platformTotals).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, c]) => (
                            <View key={p} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: platformColors[p] || '#94A3B8' }} />
                              <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8' }}>{p} {Math.round((c / totalHeatmap) * 100)}%</Text>
                            </View>
                          ))}
                        </View>
                      ) : null;
                    })()}
                  </View>
                  {/* Best send time recommendation */}
                  {(() => {
                    const sorted = [...pushHourlyData].filter(h => h.count > 0).sort((a, b) => b.count - a.count);
                    if (sorted.length < 3) return null;
                    const top3 = sorted.slice(0, 3).map(h => `${h.hour}h`).join(', ');
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 8 }}>
                        <MaterialIcons name="tips-and-updates" size={12} color="#3B82F6" />
                        <Text style={{ flex: 1, fontSize: 9, color: '#3B82F6', lineHeight: 13 }}>{fr ? `Creneaux optimaux : ${top3}` : `Optimal slots: ${top3}`}</Text>
                      </View>
                    );
                  })()}
                </View>
              ) : null}
            </View>
          </Animated.View>
          );

          if (wKey === 'receiptDelivery') return (
          <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
            <Text style={s.sectionTitle}>{fr ? 'LIVRAISON PUSH (RECEIPTS)' : 'PUSH DELIVERY (RECEIPTS)'}</Text>
            <View style={s.chartCard}>
              {/* KPI row */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: receiptStats.deliveryRate >= 80 ? '#DCFCE7' : receiptStats.deliveryRate >= 60 ? '#FEF3C7' : '#FEF2F2', borderRadius: 12, paddingVertical: 12, gap: 2 }}>
                  <Text style={{ fontSize: 26, fontWeight: '900', color: receiptStats.deliveryRate >= 80 ? '#10B981' : receiptStats.deliveryRate >= 60 ? '#D97706' : '#EF4444' }}>{receiptStats.deliveryRate}%</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Taux livraison' : 'Delivery Rate'}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 12, gap: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#3B82F6' }}>{receiptStats.checked}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Verifies' : 'Checked'}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#DCFCE7', borderRadius: 12, paddingVertical: 12, gap: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#10B981' }}>{receiptStats.delivered}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Livres' : 'Delivered'}</Text>
                </View>
              </View>

              {/* Alert if delivery rate drops below 80% */}
              {receiptStats.checked > 0 && receiptStats.deliveryRate < 80 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#FECACA' }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#DC262615', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="warning" size={14} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#991B1B' }}>{fr ? 'Taux de livraison bas' : 'Low delivery rate'}</Text>
                    <Text style={{ fontSize: 10, color: '#DC2626', lineHeight: 14, marginTop: 1 }}>
                      {fr
                        ? `${receiptStats.deliveryRate}% < 80%. ${receiptStats.failed} echecs, ${receiptStats.tokensDeactivated} tokens desactives.`
                        : `${receiptStats.deliveryRate}% < 80%. ${receiptStats.failed} failed, ${receiptStats.tokensDeactivated} tokens deactivated.`}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Delivery stats row */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12, paddingHorizontal: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MaterialIcons name="error" size={14} color="#EF4444" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#EF4444' }}>{receiptStats.failed} {fr ? 'echecs' : 'failed'}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <MaterialIcons name="phonelink-erase" size={14} color="#D97706" />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706' }}>{receiptStats.tokensDeactivated} {fr ? 'desactives' : 'deactivated'}</Text>
                </View>
              </View>

              {/* Delivery rate history (mini chart) */}
              {receiptStats.history && receiptStats.history.length > 1 ? (
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 8 }}>{fr ? 'Evolution du taux' : 'Rate Evolution'}</Text>
                  {(() => {
                    const hst = receiptStats.history.slice(-7);
                    return hst.map((h, idx) => {
                      const isLast = idx === hst.length - 1;
                      const rateColor = h.rate >= 90 ? '#10B981' : h.rate >= 80 ? '#3B82F6' : h.rate >= 60 ? '#D97706' : '#EF4444';
                      return (
                        <View key={h.date} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                          <Text style={{ width: 42, fontSize: 9, fontWeight: isLast ? '800' : '600', color: isLast ? '#3B82F6' : '#94A3B8' }}>
                            {new Date(h.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                          </Text>
                          <View style={{ flex: 1, height: 14, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                            <View style={{ height: '100%' as any, width: `${Math.max(3, h.rate)}%`, backgroundColor: rateColor, borderRadius: 4 }} />
                          </View>
                          <Text style={{ width: 32, fontSize: 10, fontWeight: '800', color: rateColor, textAlign: 'right' }}>{h.rate}%</Text>
                        </View>
                      );
                    });
                  })()}
                  {/* 80% threshold line indicator */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                    <View style={{ width: 16, height: 2, backgroundColor: '#EF4444', borderRadius: 1 }} />
                    <Text style={{ fontSize: 8, fontWeight: '600', color: '#EF4444' }}>80% {fr ? 'seuil' : 'threshold'}</Text>
                  </View>
                </View>
              ) : receiptStats.checked === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                  <MaterialIcons name="mark-email-read" size={24} color="#CBD5E1" />
                  <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 6, textAlign: 'center' }}>
                    {fr ? 'Les receipts seront verifies par le cron hebdomadaire.' : 'Receipts will be checked by the weekly cron.'}
                  </Text>
                </View>
              ) : null}

              {/* Manual check button */}
              <Pressable
                style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#3B82F610', borderWidth: 1, borderColor: '#3B82F620', marginTop: 10 }, receiptLoading && { opacity: 0.5 }]}
                onPress={async () => {
                  if (receiptLoading) return;
                  setReceiptLoading(true);
                  Haptics.selectionAsync();
                  try {
                    const supabase = getSupabaseClient();
                    const { data } = await supabase.functions.invoke('weekly-cron', { body: { tasks: ['check_push_receipts'] } });
                    if (data?.results?.check_push_receipts) {
                      const r = data.results.check_push_receipts;
                      setReceiptStats(prev => ({
                        ...prev,
                        checked: (prev.checked || 0) + (r.checked || 0),
                        delivered: (prev.delivered || 0) + (r.delivered || 0),
                        failed: (prev.failed || 0) + (r.failed || 0),
                        tokensDeactivated: (prev.tokensDeactivated || 0) + (r.tokensDeactivated || 0),
                        deliveryRate: r.deliveryRate || prev.deliveryRate,
                      }));
                      showAlert(fr ? 'Receipts verifies' : 'Receipts checked', `${r.checked || 0} ${fr ? 'verifies' : 'checked'}, ${r.delivered || 0} ${fr ? 'livres' : 'delivered'}`);
                    }
                  } catch (e) { console.log('[Dashboard] Receipt check error:', e); }
                  setReceiptLoading(false);
                }}
                disabled={receiptLoading}
              >
                {receiptLoading ? <ActivityIndicator size="small" color="#3B82F6" /> : <MaterialIcons name="refresh" size={14} color="#3B82F6" />}
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#3B82F6' }}>{receiptLoading ? '...' : (fr ? 'Verifier maintenant' : 'Check now')}</Text>
              </Pressable>
            </View>
          </Animated.View>
          );

          if (wKey === 'pushTokenAnalytics') return (
          <Animated.View key={wKey} entering={FadeInDown.duration(300).delay(wDelay)}>
            <Text style={s.sectionTitle}>{fr ? 'TOKENS PUSH' : 'PUSH TOKENS'}</Text>
            <View style={s.chartCard}>
              {/* KPI row */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#DCFCE7', borderRadius: 12, paddingVertical: 12, gap: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#10B981' }}>{pushTokenStats.activeTokens}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Actifs' : 'Active'}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 12, paddingVertical: 12, gap: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#EF4444' }}>{pushTokenStats.inactiveTokens}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Inactifs' : 'Inactive'}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 12, gap: 2 }}>
                  <Text style={{ fontSize: 22, fontWeight: '800', color: '#3B82F6' }}>{pushTokenStats.coverage}%</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Couverture' : 'Coverage'}</Text>
                </View>
              </View>

              {/* Users with token */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10 }}>
                <MaterialIcons name="people" size={16} color="#3B82F6" />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#0F172A' }}>
                  {pushTokenStats.usersWithToken} {fr ? 'utilisateurs avec token actif' : 'users with active token'}
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#3B82F6' }}>
                  {pushTokenStats.usersWithToken}/{stats.totalUsers}
                </Text>
              </View>

              {/* Deactivated this week */}
              {pushTokenStats.deactivatedThisWeek > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, backgroundColor: '#FEF3C7', borderRadius: 10, padding: 10 }}>
                  <MaterialIcons name="warning-amber" size={16} color="#D97706" />
                  <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#92400E' }}>
                    {pushTokenStats.deactivatedThisWeek} {fr ? 'desactives cette semaine' : 'deactivated this week'}
                  </Text>
                  <Text style={{ fontSize: 10, color: '#D97706', fontWeight: '600' }}>DeviceNotRegistered</Text>
                </View>
              ) : null}

              {/* Platform breakdown */}
              {Object.keys(pushTokenStats.platforms).length > 0 ? (
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 4 }}>{fr ? 'Par plateforme' : 'By platform'}</Text>
                  {(() => {
                    const maxPlatform = Math.max(...Object.values(pushTokenStats.platforms), 1);
                    const platformColors: Record<string, string> = { ios: '#000000', android: '#3DDC84', web: '#3B82F6', unknown: '#94A3B8' };
                    const platformIcons: Record<string, string> = { ios: 'phone-iphone', android: 'phone-android', web: 'computer', unknown: 'device-unknown' };
                    return Object.entries(pushTokenStats.platforms).sort((a, b) => b[1] - a[1]).map(([platform, count]) => (
                      <View key={platform} style={s.chartRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, width: 70 }}>
                          <MaterialIcons name={(platformIcons[platform] || 'device-unknown') as any} size={12} color={platformColors[platform] || '#94A3B8'} />
                          <Text style={[s.chartLabel, { width: 50 }]}>{platform}</Text>
                        </View>
                        <View style={s.chartBarBg}>
                          <View style={[s.chartBarFill, { width: `${Math.max(4, (count / maxPlatform) * 100)}%`, backgroundColor: platformColors[platform] || '#94A3B8' }]} />
                        </View>
                        <Text style={s.chartValue}>{count}</Text>
                      </View>
                    ));
                  })()}
                </View>
              ) : null}
            </View>
          </Animated.View>
          );



          return null;
        })}
      </ScrollView>
      <AdminSearchModal visible={showSearch} onClose={() => setShowSearch(false)} language={language} />
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 10, marginTop: 8, paddingHorizontal: 4 },

  // Alert
  alertCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1.5 },
  alertIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 14, fontWeight: '700' },
  alertDesc: { fontSize: 11, fontWeight: '500', marginTop: 2 },

  // Metrics
  metricsGrid: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  metricCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  metricIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  metricValue: { fontSize: 22, fontWeight: '800' },
  metricLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  secondaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 16, paddingVertical: 6 },
  secondaryItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  secondaryText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  secondaryDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1' },

  // Moderation
  moderationGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  modCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1 },
  modIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  modValue: { fontSize: 18, fontWeight: '800' },
  modLabel: { fontSize: 8, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },



  // Polling indicator
  pollingIndicator: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, alignSelf: 'flex-end' as const, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#DCFCE7', marginBottom: 8 },
  pollingDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#10B981' },
  pollingText: { fontSize: 10, fontWeight: '600' as const, color: '#10B981' },

  // Chart styles
  chartCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 3, elevation: 1 },
  chartRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 8 },
  chartLabel: { fontSize: 10, fontWeight: '600' as const, color: '#94A3B8', width: 48 },
  chartBarBg: { flex: 1, height: 18, backgroundColor: '#F1F5F9', borderRadius: 5, overflow: 'hidden' as const },
  chartBarFill: { height: '100%' as any, borderRadius: 5 },
  chartValue: { fontSize: 12, fontWeight: '800' as const, color: '#0F172A', width: 28, textAlign: 'right' as const },
  chartPercent: { fontSize: 10, fontWeight: '600' as const, color: '#94A3B8', width: 28, textAlign: 'right' as const },
  chartFooter: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 4, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  chartFooterText: { fontSize: 11, fontWeight: '600' as const, color: '#10B981' },
  eloTierDot: { width: 10, height: 10, borderRadius: 5 },

  // Growth header
  growthHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 0 },
  growthDelta: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  growthDeltaText: { fontSize: 11, fontWeight: '800' as const },
  growthExportBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#EFF6FF', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: '#DBEAFE' },

  // Appeal push button
  appealPushBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', marginTop: 8 },
  appealPushText: { fontSize: 11, fontWeight: '700' as const, color: '#DC2626' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  modalTitle: { fontSize: 17, fontWeight: '700' as const, color: '#0F172A' },

  // Widget settings
  widgetToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 10, paddingHorizontal: 12, justifyContent: 'space-between' as const, backgroundColor: '#FFF', borderRadius: 12, marginBottom: 6, borderWidth: 1, borderColor: '#F1F5F9' },
  widgetToggleText: { flex: 1, fontSize: 13, fontWeight: '600' as const, color: '#0F172A' },
  widgetDot: { width: 10, height: 10, borderRadius: 5 },

  // Club verification
  verifyHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: 6, marginTop: 8 },
  verifyStats: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  verifyStatPill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  verifyStatText: { fontSize: 11, fontWeight: '800' as const },
  verifySection: { marginBottom: 16 },
  verifyEmpty: { alignItems: 'center' as const, paddingVertical: 28, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9', gap: 8 },
  verifyEmptyText: { fontSize: 13, fontWeight: '600' as const, color: '#94A3B8' },
  verifyCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 3, elevation: 1 },
  verifyCardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 8 },
  verifyClubIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#7C3AED12', alignItems: 'center' as const, justifyContent: 'center' as const },
  verifyClubName: { fontSize: 14, fontWeight: '700' as const, color: '#0F172A' },
  verifyClubCity: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  verifyBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  verifyBtnText: { fontSize: 12, fontWeight: '700' as const, color: '#FFF' },
  criteriaRow: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 4 },
  criteriaChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  criteriaText: { fontSize: 9, fontWeight: '700' as const },
  verifyMore: { fontSize: 12, fontWeight: '600' as const, color: '#94A3B8', textAlign: 'center' as const, marginTop: 4 },

  // Activity Log
  activityHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 },
  activityViewAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#EFF6FF' },
  activityViewAllText: { fontSize: 11, fontWeight: '700', color: '#3B82F6' },
  activityCard: { backgroundColor: '#FFF', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 16, marginTop: 10 },
  activityItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  activityItemBorder: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  activityIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  activityText: { fontSize: 12, fontWeight: '600', color: '#0F172A' },
  activityMeta: { fontSize: 10, color: '#94A3B8', marginTop: 1 },

  // Transfer filter chips
  filterChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  filterChipText: { fontSize: 11, fontWeight: '700' as const, color: '#64748B' },
});

function getTimeAgo(dateStr: string, fr: boolean): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return fr ? 'A l\'instant' : 'Just now';
  if (mins < 60) return `${mins}${fr ? ' min' : 'm'}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}${fr ? 'j' : 'd'}`;
  return new Date(dateStr).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
}
