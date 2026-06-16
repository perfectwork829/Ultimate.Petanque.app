/**
 * Admin Notification Center
 *
 * Groups all admin alerts, overdue appeals, pending reports,
 * and weekly reports with read/unread tracking and quick actions.
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
import { useAlert } from '@/template';
import { getAllAppeals, BanAppeal, respondToAppeal } from '@/services/banAppealService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logAdminAction } from '@/services/adminActivityLogService';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import AdminGuard from '@/components/feature/AdminGuard';
import { Switch } from 'react-native';

interface AdminNotification {
  id: string;
  type: 'alert' | 'appeal' | 'report' | 'weekly' | 'club';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  icon: string;
  color: string;
  route?: string;
  timestamp: string;
  isRead: boolean;
  metadata?: Record<string, any>;
}

const READ_KEY = 'admin_notif_read_ids';

// All push notification types in the app with labels and categories
const PUSH_TYPES: { id: string; label: { fr: string; en: string }; desc: { fr: string; en: string }; icon: string; color: string; category: string }[] = [
  // Competitif
  { id: 'ranking_changed', label: { fr: 'Changement de classement', en: 'Ranking changed' }, desc: { fr: 'Notifie quand le rang change', en: 'Notifies when rank changes' }, icon: 'leaderboard', color: '#D97706', category: 'competitive' },
  { id: 'elo_rank_changed', label: { fr: 'Changement de ligue ELO', en: 'ELO league change' }, desc: { fr: 'Promotion/relegation de ligue', en: 'League promotion/relegation' }, icon: 'military-tech', color: '#7C3AED', category: 'competitive' },
  { id: 'weekly_summary', label: { fr: 'Resume hebdomadaire', en: 'Weekly summary' }, desc: { fr: 'Resume des performances le lundi', en: 'Performance summary on Mondays' }, icon: 'date-range', color: '#2563EB', category: 'competitive' },
  { id: 'trust_score_improved', label: { fr: 'Score de confiance', en: 'Trust score improved' }, desc: { fr: 'Amelioration du score de confiance', en: 'Trust score improved' }, icon: 'shield', color: '#10B981', category: 'competitive' },
  { id: 'trust_weekly_tip', label: { fr: 'Conseil confiance', en: 'Trust tip' }, desc: { fr: 'Conseils pour ameliorer le score', en: 'Tips to improve trust score' }, icon: 'lightbulb', color: '#F59E0B', category: 'competitive' },
  // Evenements
  { id: 'event_created', label: { fr: 'Nouvel evenement', en: 'New event' }, desc: { fr: 'Evenement sponsorise cree a proximite', en: 'Sponsored event created nearby' }, icon: 'campaign', color: '#7C3AED', category: 'events' },
  { id: 'event_reminder', label: { fr: 'Rappel evenement', en: 'Event reminder' }, desc: { fr: 'Rappel avant un evenement sponsorise', en: 'Reminder before sponsored event' }, icon: 'alarm', color: '#EF4444', category: 'events' },
  { id: 'meetup_invitation', label: { fr: 'Invitation RDV', en: 'Meetup invitation' }, desc: { fr: 'Invitation a un rendez-vous petanque', en: 'Invitation to a petanque meetup' }, icon: 'event', color: '#3B82F6', category: 'events' },
  // Partage
  { id: 'share_request', label: { fr: 'Demande de partage', en: 'Share request' }, desc: { fr: 'Partage de match/defi', en: 'Match/challenge share request' }, icon: 'share', color: '#0EA5E9', category: 'sharing' },
  { id: 'witness_request', label: { fr: 'Demande attestation', en: 'Witness request' }, desc: { fr: 'Demande d\'attestation de match', en: 'Match attestation request' }, icon: 'visibility', color: '#6366F1', category: 'sharing' },
  { id: 'witness_attested', label: { fr: 'Match atteste', en: 'Match attested' }, desc: { fr: 'Un temoin a atteste un match', en: 'Witness attested a match' }, icon: 'verified', color: '#10B981', category: 'sharing' },
  { id: 'new_follower', label: { fr: 'Nouvel abonne', en: 'New follower' }, desc: { fr: 'Notifie quand un joueur commence a vous suivre', en: 'Notifies when a player starts following you' }, icon: 'person-add', color: '#EC4899', category: 'sharing' },
  // Club
  { id: 'club_invitation', label: { fr: 'Invitation club', en: 'Club invitation' }, desc: { fr: 'Invitation a rejoindre un club', en: 'Invitation to join a club' }, icon: 'mail', color: '#7C3AED', category: 'club' },
  { id: 'club_invitation_response', label: { fr: 'Reponse invitation', en: 'Invitation response' }, desc: { fr: 'Reponse a une invitation club', en: 'Response to a club invitation' }, icon: 'how-to-reg', color: '#10B981', category: 'club' },
  { id: 'club_invitation_reminder', label: { fr: 'Rappel invitation', en: 'Invitation reminder' }, desc: { fr: 'Rappel pour invitations en attente', en: 'Reminder for pending invitations' }, icon: 'notifications', color: '#F59E0B', category: 'club' },
  { id: 'club_claim', label: { fr: 'Reclamation club', en: 'Club claim' }, desc: { fr: 'Demande de revendication de propriete', en: 'Ownership claim request' }, icon: 'assignment-ind', color: '#DC2626', category: 'club' },
  { id: 'club_verification', label: { fr: 'Verification club', en: 'Club verification' }, desc: { fr: 'Decision de verification admin', en: 'Admin verification decision' }, icon: 'verified-user', color: '#2563EB', category: 'club' },
  { id: 'club_verification_decision', label: { fr: 'Decision verification', en: 'Verification decision' }, desc: { fr: 'Decision detaillee de verification', en: 'Detailed verification decision' }, icon: 'gavel', color: '#1E40AF', category: 'club' },
  { id: 'co_admin', label: { fr: 'Co-admin club', en: 'Club co-admin' }, desc: { fr: 'Ajout/retrait co-administrateur', en: 'Co-admin added/removed' }, icon: 'group', color: '#7C3AED', category: 'club' },
  // Sponsor
  { id: 'sponsor_push', label: { fr: 'Push sponsor', en: 'Sponsor push' }, desc: { fr: 'Notification envoyee par un sponsor', en: 'Notification sent by a sponsor' }, icon: 'campaign', color: '#D4A017', category: 'sponsor' },
  { id: 'ambassador_promotion', label: { fr: 'Promotion ambassadeur', en: 'Ambassador promotion' }, desc: { fr: 'Promotion au niveau superieur', en: 'Promoted to next level' }, icon: 'emoji-events', color: '#7C3AED', category: 'sponsor' },
  // Admin
  { id: 'maintenance', label: { fr: 'Maintenance', en: 'Maintenance' }, desc: { fr: 'Notification de maintenance', en: 'Maintenance notification' }, icon: 'build', color: '#94A3B8', category: 'admin' },
  { id: 'maintenance_end', label: { fr: 'Fin maintenance', en: 'Maintenance end' }, desc: { fr: 'Fin de la maintenance', en: 'Maintenance completed' }, icon: 'check-circle', color: '#10B981', category: 'admin' },
  { id: 'announcement', label: { fr: 'Annonce', en: 'Announcement' }, desc: { fr: 'Annonce admin ciblee', en: 'Targeted admin announcement' }, icon: 'volume-up', color: '#3B82F6', category: 'admin' },
  { id: 'moderation_action', label: { fr: 'Action moderation', en: 'Moderation action' }, desc: { fr: 'Avertissement/suspension/ban', en: 'Warning/suspension/ban' }, icon: 'security', color: '#EF4444', category: 'admin' },
  { id: 'appeal_deadline', label: { fr: 'Appel en retard', en: 'Overdue appeal' }, desc: { fr: 'Rappel pour appels de ban en retard', en: 'Reminder for overdue ban appeals' }, icon: 'timer-off', color: '#DC2626', category: 'admin' },
  { id: 'ban_appeal_response', label: { fr: 'Reponse appel ban', en: 'Ban appeal response' }, desc: { fr: 'Decision sur un appel de ban', en: 'Ban appeal decision' }, icon: 'gavel', color: '#D97706', category: 'admin' },
  { id: 'merge_undo', label: { fr: 'Fusion annulee', en: 'Merge undone' }, desc: { fr: 'Annulation de fusion par admin', en: 'Admin undid a merge' }, icon: 'undo', color: '#F59E0B', category: 'admin' },
];

const PUSH_CATEGORIES: { id: string; label: { fr: string; en: string }; icon: string; color: string }[] = [
  { id: 'competitive', label: { fr: 'Competitif & Classement', en: 'Competitive & Rankings' }, icon: 'emoji-events', color: '#D97706' },
  { id: 'events', label: { fr: 'Evenements & RDV', en: 'Events & Meetups' }, icon: 'event', color: '#7C3AED' },
  { id: 'sharing', label: { fr: 'Partage & Attestation', en: 'Sharing & Attestation' }, icon: 'share', color: '#0EA5E9' },
  { id: 'club', label: { fr: 'Club', en: 'Club' }, icon: 'home', color: '#2563EB' },
  { id: 'sponsor', label: { fr: 'Sponsors & Ambassadeurs', en: 'Sponsors & Ambassadors' }, icon: 'campaign', color: '#D4A017' },
  { id: 'admin', label: { fr: 'Administration', en: 'Administration' }, icon: 'admin-panel-settings', color: '#EF4444' },
];

export default function AdminNotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const fr = language === 'fr';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<'all' | 'unread' | 'critical' | 'appeals' | 'reports'>('all');
  const { showAlert } = useAlert();
  const [processingAction, setProcessingAction] = useState<string | null>(null);

  // Push type management
  const [showPushManagement, setShowPushManagement] = useState(false);
  const [disabledPushTypes, setDisabledPushTypes] = useState<Set<string>>(new Set());
  const [loadingPushConfig, setLoadingPushConfig] = useState(false);
  const [savingPushConfig, setSavingPushConfig] = useState(false);

  // Push disable history
  const [pushHistory, setPushHistory] = useState<{ id: string; action: string; detail: string; date: string; adminName?: string }[]>([]);
  const [loadingPushHistory, setLoadingPushHistory] = useState(false);
  const [showPushHistory, setShowPushHistory] = useState(false);

  // Load read IDs from storage
  useEffect(() => {
    AsyncStorage.getItem(READ_KEY).then(val => {
      if (val) try { setReadIds(new Set(JSON.parse(val))); } catch { /* silent */ }
    }).catch(() => {});
  }, []);

  // Load disabled push types from app_config
  const loadPushConfig = useCallback(async () => {
    setLoadingPushConfig(true);
    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase.from('app_config').select('disabled_push_types').eq('id', 'main').single();
      if (data?.disabled_push_types && Array.isArray(data.disabled_push_types)) {
        setDisabledPushTypes(new Set(data.disabled_push_types));
      }
    } catch { /* silent */ }
    setLoadingPushConfig(false);
  }, []);

  useEffect(() => { loadPushConfig(); }, [loadPushConfig]);

  // Load push toggle history from admin_activity_logs
  const loadPushHistory = useCallback(async () => {
    setLoadingPushHistory(true);
    try {
      const supabase = getSupabaseClient();
      const { data } = await supabase
        .from('admin_activity_logs')
        .select('id, admin_name, action_detail, created_at, metadata')
        .like('action_detail', '%Push type%')
        .order('created_at', { ascending: false })
        .limit(50);
      // Also get category toggles
      const { data: catData } = await supabase
        .from('admin_activity_logs')
        .select('id, admin_name, action_detail, created_at, metadata')
        .like('action_detail', '%Category%')
        .order('created_at', { ascending: false })
        .limit(20);
      const all = [...(data || []), ...(catData || [])].sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setPushHistory(all.map((r: any) => ({
        id: r.id,
        action: r.metadata?.disabled ? 'disabled' : 'enabled',
        detail: r.action_detail || '',
        date: r.created_at,
        adminName: r.admin_name,
      })));
    } catch { /* silent */ }
    setLoadingPushHistory(false);
  }, []);

  useEffect(() => { if (showPushManagement) loadPushHistory(); }, [showPushManagement, loadPushHistory]);

  const togglePushType = useCallback(async (pushType: string) => {
    Haptics.selectionAsync();
    const next = new Set(disabledPushTypes);
    if (next.has(pushType)) next.delete(pushType); else next.add(pushType);
    setDisabledPushTypes(next);
    setSavingPushConfig(true);
    try {
      const supabase = getSupabaseClient();
      await supabase.from('app_config').update({ disabled_push_types: [...next], updated_at: new Date().toISOString() }).eq('id', 'main');
      logAdminAction({ actionType: 'club_verify' as any, actionDetail: `Push type "${pushType}" ${next.has(pushType) ? 'disabled' : 'enabled'}`, metadata: { pushType, disabled: next.has(pushType) } });
    } catch { /* silent */ }
    setSavingPushConfig(false);
  }, [disabledPushTypes]);

  const toggleAllInCategory = useCallback(async (categoryId: string, disable: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = new Set(disabledPushTypes);
    const catTypes = PUSH_TYPES.filter(pt => pt.category === categoryId);
    catTypes.forEach(pt => { if (disable) next.add(pt.id); else next.delete(pt.id); });
    setDisabledPushTypes(next);
    setSavingPushConfig(true);
    try {
      const supabase = getSupabaseClient();
      await supabase.from('app_config').update({ disabled_push_types: [...next], updated_at: new Date().toISOString() }).eq('id', 'main');
      logAdminAction({ actionType: 'club_verify' as any, actionDetail: `Category "${categoryId}" ${disable ? 'disabled' : 'enabled'} (${catTypes.length} types)`, metadata: { category: categoryId, disabled: disable } });
    } catch { /* silent */ }
    setSavingPushConfig(false);
  }, [disabledPushTypes]);

  const markAsRead = useCallback((id: string) => {
    setReadIds(prev => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(READ_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  const markAllAsRead = useCallback(() => {
    Haptics.selectionAsync();
    const allIds = notifications.map(n => n.id);
    setReadIds(prev => {
      const next = new Set([...prev, ...allIds]);
      AsyncStorage.setItem(READ_KEY, JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, [notifications]);

  const loadNotifications = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const notifs: AdminNotification[] = [];
      const now = new Date();

      // 1. Overdue ban appeals
      const { appeals } = await getAllAppeals(50);
      const pendingAppeals = appeals.filter(a => a.status === 'pending');
      const threshold48h = Date.now() - 48 * 60 * 60 * 1000;
      const overdueAppeals = pendingAppeals.filter(a => new Date(a.createdAt).getTime() < threshold48h);

      overdueAppeals.forEach(a => {
        const hoursAgo = Math.floor((Date.now() - new Date(a.createdAt).getTime()) / (60 * 60 * 1000));
        const daysAgo = Math.floor(hoursAgo / 24);
        notifs.push({
          id: `appeal-${a.id}`,
          type: 'appeal',
          severity: 'critical',
          title: fr ? `Appel en retard (${daysAgo}j)` : `Overdue appeal (${daysAgo}d)`,
          message: `${(a as any).userName || (a as any).userEmail || 'User'}: ${a.message.substring(0, 80)}${a.message.length > 80 ? '...' : ''}`,
          icon: 'timer-off',
          color: '#DC2626',
          route: '/admin-moderation',
          timestamp: a.createdAt,
          isRead: false,
        });
      });

      // Non-overdue pending appeals
      pendingAppeals.filter(a => !overdueAppeals.includes(a)).forEach(a => {
        notifs.push({
          id: `appeal-pending-${a.id}`,
          type: 'appeal',
          severity: 'warning',
          title: fr ? 'Appel de ban en attente' : 'Pending ban appeal',
          message: `${(a as any).userName || (a as any).userEmail || 'User'}: ${a.message.substring(0, 80)}`,
          icon: 'rate-review',
          color: '#D97706',
          route: '/admin-moderation',
          timestamp: a.createdAt,
          isRead: false,
        });
      });

      // 2. Pending reports
      const { data: reports } = await supabase.from('player_reports').select('id, status, reason, details, created_at, reported_user_id').eq('status', 'pending').order('created_at', { ascending: false }).limit(20);
      (reports || []).forEach((r: any) => {
        notifs.push({
          id: `report-${r.id}`,
          type: 'report',
          severity: (reports || []).length >= 5 ? 'critical' : 'warning',
          title: fr ? 'Signalement en attente' : 'Pending report',
          message: `${r.reason || 'Unknown'}: ${(r.details || '').substring(0, 60)}`,
          icon: 'flag',
          color: '#EF4444',
          route: '/admin-moderation',
          timestamp: r.created_at,
          isRead: false,
        });
      });

      // 3. Unverified clubs (info)
      const { data: unverifiedClubs } = await supabase.from('clubs').select('id, name, city, created_at').eq('is_verified', false).order('created_at', { ascending: false }).limit(10);
      if (unverifiedClubs && unverifiedClubs.length >= 3) {
        notifs.push({
          id: `clubs-unverified-${now.toISOString().slice(0, 10)}`,
          type: 'club',
          severity: 'info',
          title: fr ? `${unverifiedClubs.length} clubs non verifies` : `${unverifiedClubs.length} unverified clubs`,
          message: unverifiedClubs.slice(0, 3).map((c: any) => c.name).join(', ') + (unverifiedClubs.length > 3 ? '...' : ''),
          icon: 'pending',
          color: '#D97706',
          route: '/admin-clubs',
          timestamp: now.toISOString(),
          isRead: false,
        });
      }

      // 4. Smart alerts — match activity decline
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { count: thisWeekMatches } = await supabase.from('matches').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo);
      const { count: lastWeekMatches } = await supabase.from('matches').select('id', { count: 'exact', head: true }).gte('created_at', twoWeeksAgo).lt('created_at', weekAgo);
      const tw = thisWeekMatches || 0;
      const lw = lastWeekMatches || 0;
      if (lw > 0 && tw < lw * 0.7) {
        const decline = Math.round((1 - tw / lw) * 100);
        notifs.push({
          id: `alert-match-decline-${now.toISOString().slice(0, 10)}`,
          type: 'alert',
          severity: 'warning',
          title: fr ? 'Baisse des matchs' : 'Match decline',
          message: fr ? `${tw} matchs cette semaine vs ${lw} la semaine derniere (-${decline}%)` : `${tw} matches this week vs ${lw} last week (-${decline}%)`,
          icon: 'trending-down',
          color: '#EF4444',
          timestamp: now.toISOString(),
          isRead: false,
        });
      }

      // 5. No signups this week
      const { count: newUsers } = await supabase.from('user_profiles').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo);
      if ((newUsers || 0) === 0) {
        notifs.push({
          id: `alert-no-signups-${now.toISOString().slice(0, 10)}`,
          type: 'alert',
          severity: 'info',
          title: fr ? 'Aucune inscription' : 'No signups',
          message: fr ? 'Aucun nouvel utilisateur cette semaine.' : 'No new users this week.',
          icon: 'person-off',
          color: '#94A3B8',
          timestamp: now.toISOString(),
          isRead: false,
        });
      }

      // Sort by severity then timestamp
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      notifs.sort((a, b) => {
        const so = severityOrder[a.severity] - severityOrder[b.severity];
        if (so !== 0) return so;
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });

      setNotifications(notifs);
    } catch (e) {
      console.log('[AdminNotifications] Error:', e);
    } finally {
      setLoading(false);
    }
  }, [fr]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadNotifications();
    setRefreshing(false);
  }, [loadNotifications]);

  const enrichedNotifs = useMemo(() => {
    return notifications.map(n => ({ ...n, isRead: readIds.has(n.id) }));
  }, [notifications, readIds]);

  const filtered = useMemo(() => {
    let items = enrichedNotifs;
    if (filterType === 'unread') items = items.filter(n => !n.isRead);
    else if (filterType === 'critical') items = items.filter(n => n.severity === 'critical');
    else if (filterType === 'appeals') items = items.filter(n => n.type === 'appeal');
    else if (filterType === 'reports') items = items.filter(n => n.type === 'report');
    return items;
  }, [enrichedNotifs, filterType]);

  const unreadCount = useMemo(() => enrichedNotifs.filter(n => !n.isRead).length, [enrichedNotifs]);
  const criticalCount = useMemo(() => enrichedNotifs.filter(n => n.severity === 'critical').length, [enrichedNotifs]);

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return fr ? 'A l\'instant' : 'Just now';
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    return `${days}${fr ? 'j' : 'd'}`;
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{fr ? 'Notifications admin' : 'Admin Notifications'}</Text>
        </View>
        <View style={s.center}><ActivityIndicator size="large" color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <AdminGuard language={language}>
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{fr ? 'Notifications' : 'Notifications'}</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {unreadCount > 0 ? (
            <Pressable style={s.markAllBtn} onPress={markAllAsRead}>
              <MaterialIcons name="done-all" size={18} color="#3B82F6" />
            </Pressable>
          ) : null}
          <Pressable style={[s.markAllBtn, { backgroundColor: showPushManagement ? '#EF444415' : '#F1F5F9', borderColor: showPushManagement ? '#EF444440' : '#E2E8F0' }]} onPress={() => { Haptics.selectionAsync(); setShowPushManagement(!showPushManagement); }}>
            <MaterialIcons name="notifications-off" size={18} color={showPushManagement ? '#EF4444' : '#64748B'} />
          </Pressable>
        </View>
      </View>

      <AdminQuickNav currentRoute="/admin-notifications" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* ====== PUSH TYPE MANAGEMENT ====== */}
        {showPushManagement ? (
          <View>
            <View style={s.pushMgmtHeader}>
              <View style={s.pushMgmtHeaderIcon}>
                <MaterialIcons name="notifications-off" size={22} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.pushMgmtTitle}>{fr ? 'Gestion des notifications push' : 'Push Notification Management'}</Text>
                <Text style={s.pushMgmtSubtitle}>
                  {fr ? `${disabledPushTypes.size} type(s) desactive(s) sur ${PUSH_TYPES.length}` : `${disabledPushTypes.size} type(s) disabled out of ${PUSH_TYPES.length}`}
                  {savingPushConfig ? (fr ? ' • Sauvegarde...' : ' • Saving...') : ''}
                </Text>
              </View>
              {loadingPushConfig ? <ActivityIndicator size="small" color="#EF4444" /> : null}
            </View>

            {PUSH_CATEGORIES.map(cat => {
              const catTypes = PUSH_TYPES.filter(pt => pt.category === cat.id);
              const disabledInCat = catTypes.filter(pt => disabledPushTypes.has(pt.id)).length;
              const allDisabled = disabledInCat === catTypes.length;
              const noneDisabled = disabledInCat === 0;
              return (
                <View key={cat.id} style={s.pushCatBlock}>
                  <View style={s.pushCatHeader}>
                    <View style={[s.pushCatIcon, { backgroundColor: cat.color + '15' }]}>
                      <MaterialIcons name={cat.icon as any} size={16} color={cat.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.pushCatTitle, { color: cat.color }]}>{cat.label[fr ? 'fr' : 'en']}</Text>
                      <Text style={s.pushCatCount}>
                        {noneDisabled
                          ? (fr ? 'Toutes actives' : 'All active')
                          : allDisabled
                            ? (fr ? 'Toutes desactivees' : 'All disabled')
                            : `${disabledInCat}/${catTypes.length} ${fr ? 'desactivee(s)' : 'disabled'}`}
                      </Text>
                    </View>
                    <Pressable
                      style={[s.pushCatToggleAll, allDisabled ? { backgroundColor: '#EF444415', borderColor: '#EF444440' } : { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }]}
                      onPress={() => toggleAllInCategory(cat.id, !allDisabled)}
                    >
                      <MaterialIcons name={allDisabled ? 'notifications-off' : 'notifications-active'} size={14} color={allDisabled ? '#EF4444' : '#10B981'} />
                      <Text style={{ fontSize: 10, fontWeight: '700', color: allDisabled ? '#EF4444' : '#10B981' }}>{allDisabled ? (fr ? 'Tout activer' : 'Enable all') : (fr ? 'Tout desactiver' : 'Disable all')}</Text>
                    </Pressable>
                  </View>
                  {catTypes.map(pt => {
                    const isDisabled = disabledPushTypes.has(pt.id);
                    return (
                      <View key={pt.id} style={[s.pushTypeRow, isDisabled && s.pushTypeRowDisabled]}>
                        <View style={[s.pushTypeIcon, { backgroundColor: isDisabled ? '#F1F5F9' : pt.color + '12' }]}>
                          <MaterialIcons name={pt.icon as any} size={14} color={isDisabled ? '#CBD5E1' : pt.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.pushTypeName, isDisabled && { color: '#94A3B8' }]}>{pt.label[fr ? 'fr' : 'en']}</Text>
                          <Text style={s.pushTypeDesc}>{pt.desc[fr ? 'fr' : 'en']}</Text>
                        </View>
                        <Switch
                          value={!isDisabled}
                          onValueChange={() => togglePushType(pt.id)}
                          trackColor={{ false: '#E2E8F0', true: '#10B98140' }}
                          thumbColor={isDisabled ? '#94A3B8' : '#10B981'}
                        />
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {/* Push History Toggle */}
            <Pressable
              style={s.pushHistoryToggle}
              onPress={() => { Haptics.selectionAsync(); setShowPushHistory(!showPushHistory); }}
            >
              <MaterialIcons name="history" size={16} color="#7C3AED" />
              <Text style={s.pushHistoryToggleText}>{fr ? 'Historique des modifications' : 'Change history'}</Text>
              <View style={{ marginLeft: 'auto' }}>
                <MaterialIcons name={showPushHistory ? 'expand-less' : 'expand-more'} size={18} color="#94A3B8" />
              </View>
            </Pressable>

            {showPushHistory ? (
              <View style={s.pushHistoryBlock}>
                {loadingPushHistory ? (
                  <View style={{ alignItems: 'center', paddingVertical: 16 }}><ActivityIndicator size="small" color="#7C3AED" /></View>
                ) : pushHistory.length === 0 ? (
                  <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                    <MaterialIcons name="history" size={24} color="#CBD5E1" />
                    <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>{fr ? 'Aucune modification' : 'No changes yet'}</Text>
                  </View>
                ) : (
                  pushHistory.slice(0, 20).map((h, hIdx) => {
                    const isDisabled = h.action === 'disabled';
                    const dateStr = new Date(h.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
                    return (
                      <View key={h.id} style={[s.pushHistoryItem, hIdx > 0 && { borderTopWidth: 1, borderTopColor: '#F8FAFC' }]}>
                        <View style={[s.pushHistoryDot, { backgroundColor: isDisabled ? '#EF444420' : '#10B98120' }]}>
                          <MaterialIcons name={isDisabled ? 'notifications-off' : 'notifications-active'} size={10} color={isDisabled ? '#EF4444' : '#10B981'} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.pushHistoryDetail} numberOfLines={2}>{h.detail}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                            <Text style={s.pushHistoryDate}>{dateStr}</Text>
                            {h.adminName ? <Text style={s.pushHistoryAdmin}>{h.adminName}</Text> : null}
                          </View>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}

            {/* Warning banner */}
            {disabledPushTypes.size > 0 ? (
              <View style={s.pushWarning}>
                <MaterialIcons name="warning-amber" size={16} color="#D97706" />
                <Text style={s.pushWarningText}>
                  {fr
                    ? `${disabledPushTypes.size} type(s) de notification desactive(s) globalement. Aucun utilisateur ne recevra ces notifications jusqu'a reactivation.`
                    : `${disabledPushTypes.size} notification type(s) globally disabled. No user will receive these until re-enabled.`}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Summary */}
        <View style={s.summaryRow}>
          <View style={[s.summaryCard, { borderColor: '#DC262620' }]}>
            <Text style={[s.summaryValue, { color: '#DC2626' }]}>{criticalCount}</Text>
            <Text style={s.summaryLabel}>{fr ? 'Critiques' : 'Critical'}</Text>
          </View>
          <View style={[s.summaryCard, { borderColor: '#D9770620' }]}>
            <Text style={[s.summaryValue, { color: '#D97706' }]}>{enrichedNotifs.filter(n => n.severity === 'warning').length}</Text>
            <Text style={s.summaryLabel}>{fr ? 'Attention' : 'Warning'}</Text>
          </View>
          <View style={[s.summaryCard, { borderColor: '#3B82F620' }]}>
            <Text style={[s.summaryValue, { color: '#3B82F6' }]}>{unreadCount}</Text>
            <Text style={s.summaryLabel}>{fr ? 'Non lues' : 'Unread'}</Text>
          </View>
          <View style={[s.summaryCard, { borderColor: '#10B98120' }]}>
            <Text style={[s.summaryValue, { color: '#10B981' }]}>{enrichedNotifs.length}</Text>
            <Text style={s.summaryLabel}>Total</Text>
          </View>
        </View>

        {/* Filters */}
        <View style={s.filterRow}>
          {([
            { key: 'all' as const, label: fr ? 'Tout' : 'All', icon: 'notifications' },
            { key: 'unread' as const, label: fr ? 'Non lues' : 'Unread', icon: 'mark-email-unread' },
            { key: 'critical' as const, label: fr ? 'Critiques' : 'Critical', icon: 'error' },
            { key: 'appeals' as const, label: fr ? 'Appels' : 'Appeals', icon: 'rate-review' },
            { key: 'reports' as const, label: fr ? 'Signalements' : 'Reports', icon: 'flag' },
          ]).map(f => {
            const isActive = filterType === f.key;
            return (
              <Pressable key={f.key} style={[s.filterChip, isActive && s.filterChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterType(f.key); }}>
                <MaterialIcons name={f.icon as any} size={13} color={isActive ? '#FFF' : '#64748B'} />
                <Text style={[s.filterChipText, isActive && { color: '#FFF' }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Notifications list */}
        {filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}><MaterialIcons name="notifications-none" size={40} color="#CBD5E1" /></View>
            <Text style={s.emptyTitle}>{fr ? 'Aucune notification' : 'No notifications'}</Text>
            <Text style={s.emptyDesc}>{fr ? 'Tout est en ordre.' : 'Everything looks good.'}</Text>
          </View>
        ) : (
          filtered.map((notif, idx) => {
            const bgColor = notif.severity === 'critical' ? '#FEF2F2' : notif.severity === 'warning' ? '#FFFBEB' : '#F0F9FF';
            const borderColor = notif.severity === 'critical' ? '#FECACA' : notif.severity === 'warning' ? '#FDE68A' : '#BAE6FD';
            return (
              <View key={notif.id}>
                <Pressable
                  style={[s.notifCard, { backgroundColor: notif.isRead ? '#FFF' : bgColor, borderColor: notif.isRead ? '#F1F5F9' : borderColor }]}
                  onPress={() => {
                    Haptics.selectionAsync();
                    markAsRead(notif.id);
                    if (notif.route) router.push(notif.route as any);
                  }}
                >
                  <View style={[s.notifIcon, { backgroundColor: notif.color + '15' }]}>
                    <MaterialIcons name={notif.icon as any} size={18} color={notif.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={[s.notifTitle, notif.isRead && { color: '#94A3B8' }]} numberOfLines={1}>{notif.title}</Text>
                      {!notif.isRead ? <View style={[s.unreadDot, { backgroundColor: notif.color }]} /> : null}
                      {notif.severity === 'critical' ? (
                        <View style={s.criticalBadge}><Text style={s.criticalBadgeText}>{fr ? 'URGENT' : 'URGENT'}</Text></View>
                      ) : null}
                    </View>
                    <Text style={[s.notifMessage, notif.isRead && { color: '#CBD5E1' }]} numberOfLines={2}>{notif.message}</Text>
                    <Text style={s.notifTime}>{getTimeAgo(notif.timestamp)}</Text>
                  </View>
                  {notif.route ? <MaterialIcons name="chevron-right" size={18} color={notif.isRead ? '#CBD5E1' : notif.color} /> : null}
                </Pressable>
                {/* Quick Actions */}
                {notif.type === 'appeal' && notif.severity === 'critical' ? (
                  <View style={s.quickActions}>
                    <Pressable
                      style={[s.quickActionBtn, { backgroundColor: '#DCFCE7' }]}
                      disabled={processingAction === notif.id}
                      onPress={async () => {
                        const appealId = notif.id.replace('appeal-', '');
                        setProcessingAction(notif.id);
                        try {
                          await respondToAppeal(appealId, 'accepted', fr ? 'Approuve depuis le centre de notifications' : 'Approved from notification center');
                          markAsRead(notif.id);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          showAlert(fr ? 'Appel accepte' : 'Appeal accepted', fr ? 'Le joueur a ete debanni.' : 'Player has been unbanned.');
                          logAdminAction({ actionType: 'appeal_accept', targetType: 'appeal', targetId: appealId, actionDetail: 'Quick accept from notification center' });
                          loadNotifications();
                        } catch { /* silent */ }
                        setProcessingAction(null);
                      }}
                    >
                      {processingAction === notif.id ? <ActivityIndicator size="small" color="#10B981" /> : (
                        <><MaterialIcons name="check" size={14} color="#10B981" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#10B981' }}>{fr ? 'Accepter' : 'Accept'}</Text></>
                      )}
                    </Pressable>
                    <Pressable
                      style={[s.quickActionBtn, { backgroundColor: '#FEF2F2' }]}
                      disabled={processingAction === notif.id}
                      onPress={async () => {
                        const appealId = notif.id.replace('appeal-', '');
                        setProcessingAction(notif.id);
                        try {
                          await respondToAppeal(appealId, 'rejected', fr ? 'Rejete depuis le centre de notifications' : 'Rejected from notification center');
                          markAsRead(notif.id);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                          logAdminAction({ actionType: 'appeal_reject', targetType: 'appeal', targetId: appealId, actionDetail: 'Quick reject from notification center' });
                          loadNotifications();
                        } catch { /* silent */ }
                        setProcessingAction(null);
                      }}
                    >
                      <MaterialIcons name="close" size={14} color="#EF4444" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#EF4444' }}>{fr ? 'Rejeter' : 'Reject'}</Text>
                    </Pressable>
                  </View>
                ) : null}
                {notif.type === 'report' ? (
                  <View style={s.quickActions}>
                    <Pressable
                      style={[s.quickActionBtn, { backgroundColor: '#FEF3C7' }]}
                      disabled={processingAction === notif.id}
                      onPress={async () => {
                        const reportId = notif.id.replace('report-', '');
                        setProcessingAction(notif.id);
                        try {
                          const supabase = getSupabaseClient();
                          await supabase.from('player_reports').update({ status: 'dismissed', updated_at: new Date().toISOString() }).eq('id', reportId);
                          markAsRead(notif.id);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          logAdminAction({ actionType: 'moderation_dismiss', targetType: 'report', targetId: reportId, actionDetail: 'Quick dismiss from notification center' });
                          loadNotifications();
                        } catch { /* silent */ }
                        setProcessingAction(null);
                      }}
                    >
                      {processingAction === notif.id ? <ActivityIndicator size="small" color="#D97706" /> : (
                        <><MaterialIcons name="remove-circle-outline" size={14} color="#D97706" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#D97706' }}>{fr ? 'Rejeter' : 'Dismiss'}</Text></>
                      )}
                    </Pressable>
                  </View>
                ) : null}
                {notif.type === 'club' ? (
                  <View style={s.quickActions}>
                    <Pressable
                      style={[s.quickActionBtn, { backgroundColor: '#DBEAFE' }]}
                      onPress={() => { Haptics.selectionAsync(); markAsRead(notif.id); router.push('/admin-clubs' as any); }}
                    >
                      <MaterialIcons name="verified" size={14} color="#2563EB" /><Text style={{ fontSize: 11, fontWeight: '700', color: '#2563EB' }}>{fr ? 'Verifier' : 'Verify'}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })
        )}
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
  markAllBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#DBEAFE' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  summaryCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1 },
  summaryValue: { fontSize: 20, fontWeight: '800' },
  summaryLabel: { fontSize: 8, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  filterChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  filterChipText: { fontSize: 11, fontWeight: '600', color: '#64748B' },

  notifCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1.5 },
  notifIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1 },
  notifMessage: { fontSize: 11, color: '#64748B', marginTop: 2, lineHeight: 16 },
  notifTime: { fontSize: 9, color: '#94A3B8', marginTop: 3, fontWeight: '600' },

  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  criticalBadge: { backgroundColor: '#DC2626', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  criticalBadgeText: { fontSize: 7, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },

  quickActions: { flexDirection: 'row', gap: 6, marginLeft: 52, marginTop: -4, marginBottom: 8 },
  quickActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },

  emptyWrap: { alignItems: 'center', paddingVertical: 56 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  emptyDesc: { fontSize: 13, color: '#94A3B8', marginTop: 4 },

  // Push Management
  pushMgmtHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: '#FEF2F2', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: '#FECACA' },
  pushMgmtHeaderIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EF444415', alignItems: 'center' as const, justifyContent: 'center' as const },
  pushMgmtTitle: { fontSize: 16, fontWeight: '700' as const, color: '#991B1B' },
  pushMgmtSubtitle: { fontSize: 12, color: '#EF4444', fontWeight: '600' as const, marginTop: 2 },
  pushCatBlock: { backgroundColor: '#FFF', borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden' as const },
  pushCatHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  pushCatIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  pushCatTitle: { fontSize: 14, fontWeight: '700' as const },
  pushCatCount: { fontSize: 10, fontWeight: '600' as const, color: '#94A3B8', marginTop: 1 },
  pushCatToggleAll: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  pushTypeRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  pushTypeRowDisabled: { backgroundColor: '#FAFAFA' },
  pushTypeIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  pushTypeName: { fontSize: 13, fontWeight: '600' as const, color: '#0F172A' },
  pushTypeDesc: { fontSize: 10, color: '#94A3B8', marginTop: 1 },
  pushWarning: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10, backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14, marginBottom: 14, borderWidth: 1.5, borderColor: '#FDE68A' },
  pushWarningText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },
  pushHistoryToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: '#7C3AED08', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: '#7C3AED18' },
  pushHistoryToggleText: { fontSize: 13, fontWeight: '600' as const, color: '#7C3AED' },
  pushHistoryBlock: { backgroundColor: '#FFF', borderRadius: 14, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9', overflow: 'hidden' as const },
  pushHistoryItem: { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 10, paddingVertical: 10, paddingHorizontal: 14 },
  pushHistoryDot: { width: 24, height: 24, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 1 },
  pushHistoryDetail: { fontSize: 12, fontWeight: '600' as const, color: '#0F172A', lineHeight: 16 },
  pushHistoryDate: { fontSize: 10, color: '#94A3B8', fontWeight: '500' as const },
  pushHistoryAdmin: { fontSize: 10, color: '#7C3AED', fontWeight: '600' as const },
});
