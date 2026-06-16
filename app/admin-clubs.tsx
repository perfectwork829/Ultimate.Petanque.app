/**
 * Admin Club Management Page
 *
 * Full club list with search, filters (verified/unverified/public),
 * stats, bulk verification, and detail modal.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';

import * as Haptics from '@/services/haptics';

const NoAnimView = ({ entering, ...props }: any) => <View {...props} />;
const Animated = { View: NoAnimView };
const _noop: any = () => _noop; _noop.duration = _noop; _noop.delay = _noop; _noop.springify = _noop; _noop.damping = _noop;
const FadeInDown = _noop; const FadeIn = _noop;
import theme from '@/constants/theme';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import AdminGuard from '@/components/feature/AdminGuard';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { logAdminAction } from '@/services/adminActivityLogService';
import { detectDuplicateClubs, pickBestClub, getClubMergePreview, mergeClubs, getClubMergeHistory, getClubHealthTrends, ClubDuplicateGroup } from '@/services/adminClubService';
import { getAllPendingClaims, acceptClubClaim, declineClubClaim, ClubClaimRequest, getClaimProcessingStats, sendVerificationDecisionNotification, getClaimHistory } from '@/services/clubClaimService';
import { getAllMergeLogsAdmin, adminUndoMerge, MergeLog } from '@/services/mergeHistoryService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PageErrorBoundary from '@/components/ui/PageErrorBoundary';
import { ClubsSkeleton } from '@/components/ui/AdminSkeleton';

import { Platform } from 'react-native';

let MapViewComponent: React.ComponentType<any> | null = null;
let MarkerComponent: React.ComponentType<any> | null = null;
try {
  if (Platform.OS !== 'web') {
    const Maps = require('react-native-maps');
    MapViewComponent = Maps.default;
    MarkerComponent = Maps.Marker;
  }
} catch { /* silent */ }

interface AdminClub {
  id: string;
  userId: string;
  name: string;
  city: string;
  country: string;
  address: string | null;
  description: string | null;
  membersCount: number;
  foundedYear: number | null;
  contactEmail: string | null;
  contactPhone: string | null;
  website: string | null;
  isPublic: boolean;
  isVerified: boolean;
  location: { latitude: number; longitude: number } | null;
  logo: string | null;
  facilities: string[];
  createdAt: string;
  ownerName?: string;
  ownerEmail?: string;
  coAdminCount: number;
}

export default function AdminClubsScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { showAlert } = useAlert();
  const fr = language === 'fr';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clubs, setClubs] = useState<AdminClub[]>([]);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'verified' | 'unverified' | 'public'>('all');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Detail modal
  const [detailClub, setDetailClub] = useState<AdminClub | null>(null);

  // Bulk selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [clubMatchCounts, setClubMatchCounts] = useState<Map<string, number>>(new Map());
  const [clubHealthScores, setClubHealthScores] = useState<Map<string, { score: number; label: string; color: string; details: { matches30d: number; tournamentCount: number; memberActivity: number; age: number } }>>(new Map());
  const [showInactiveAlert, setShowInactiveAlert] = useState(true);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [sendingBulkPush, setSendingBulkPush] = useState(false);
  const [archivingInactive, setArchivingInactive] = useState(false);

  // Club activity timeline
  const [timelineData, setTimelineData] = useState<{ type: string; date: string; label: string; icon: string; color: string }[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  // Comparison
  const [showComparison, setShowComparison] = useState(false);

  // Map view
  const [showMap, setShowMap] = useState(false);
  const [mapFilter, setMapFilter] = useState<'all' | 'active' | 'verified' | 'inactive'>('all');

  // Comparison trends
  const [comparisonTrends, setComparisonTrends] = useState<Map<string, { month: string; matches: number }[]>>(new Map());
  const [loadingTrends, setLoadingTrends] = useState(false);

  // Club duplicates / merge
  const [clubDuplicates, setClubDuplicates] = useState<ClubDuplicateGroup[]>([]);
  const [showClubDuplicates, setShowClubDuplicates] = useState(false);
  const [showClubMergeModal, setShowClubMergeModal] = useState(false);
  const [clubMergeGroup, setClubMergeGroup] = useState<ClubDuplicateGroup | null>(null);
  const [clubMergeKeepId, setClubMergeKeepId] = useState<string | null>(null);
  const [clubMergeDeleteId, setClubMergeDeleteId] = useState<string | null>(null);
  const [clubMergePreview, setClubMergePreview] = useState<{ players: number; matches: number; tournaments: number; terrains: number; sharedItems: number; claimRequests: number } | null>(null);
  const [loadingClubMergePreview, setLoadingClubMergePreview] = useState(false);
  const [mergingClub, setMergingClub] = useState(false);

  // Merge history
  const [mergeHistory, setMergeHistory] = useState<{ id: string; targetName: string; sourceName: string; createdAt: string; sourceSnapshot: any }[]>([]);
  const [showMergeHistory, setShowMergeHistory] = useState(false);

  // Pending claims/verification requests
  const [pendingClaims, setPendingClaims] = useState<(ClubClaimRequest & { clubName?: string })[]>([]);
  const [showPendingClaims, setShowPendingClaims] = useState(false);
  const [processingClaimId, setProcessingClaimId] = useState<string | null>(null);
  const [claimFilter, setClaimFilter] = useState<'all' | 'verification' | 'claim'>('all');
  const [claimStats, setClaimStats] = useState<{ processedThisMonth: number; acceptedThisMonth: number; declinedThisMonth: number; avgResponseTimeHours: number; pendingCount: number; oldestPendingDays: number } | null>(null);

  // Health trends
  const [healthTrends, setHealthTrends] = useState<{ month: string; score: number; matches: number; members: number; color: string }[]>([]);
  const [healthDirection, setHealthDirection] = useState<'improving' | 'declining' | 'stable'>('stable');
  const [loadingTrends2, setLoadingTrends2] = useState(false);

  // Claim history (processed)
  const [claimHistory, setClaimHistory] = useState<(ClubClaimRequest & { clubName?: string })[]>([]);
  const [showClaimHistory, setShowClaimHistory] = useState(false);
  const [claimHistoryTab, setClaimHistoryTab] = useState<'pending' | 'history'>('pending');

  // Admin merge logs (all users)
  const [adminMergeLogs, setAdminMergeLogs] = useState<MergeLog[]>([]);
  const [showAdminMergeLogs, setShowAdminMergeLogs] = useState(false);
  const [undoingMergeId, setUndoingMergeId] = useState<string | null>(null);

  // Deleting club state
  const [deletingClubId, setDeletingClubId] = useState<string | null>(null);

  // Load match counts for enhanced verification
  const loadClubMatchCounts = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const { data: matches } = await supabase.from('matches').select('user_id');
      const { data: allPlayers } = await supabase.from('players').select('user_id, club_id');
      const playerClubMap = new Map<string, string>();
      (allPlayers || []).forEach((p: any) => { if (p.club_id) playerClubMap.set(p.user_id, p.club_id); });
      const countMap = new Map<string, number>();
      (matches || []).forEach((m: any) => {
        const cid = playerClubMap.get(m.user_id);
        if (cid) countMap.set(cid, (countMap.get(cid) || 0) + 1);
      });
      setClubMatchCounts(countMap);
    } catch { /* silent */ }
  }, []);

  const loadClubs = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .order('name', { ascending: true })
        .limit(500);

      if (error) { console.log('[AdminClubs] Error:', error); return; }

      const userIds = [...new Set((data || []).map((c: any) => c.user_id))];
      const ownerMap = new Map<string, { name: string; email: string }>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, username, email')
          .in('id', userIds);
        (profiles || []).forEach((p: any) => {
          ownerMap.set(p.id, { name: p.username || 'Unknown', email: p.email || '' });
        });
      }

      setClubs((data || []).map((c: any) => ({
        id: c.id,
        userId: c.user_id,
        name: c.name,
        city: c.city || '',
        country: c.country || 'France',
        address: c.address,
        description: c.description,
        membersCount: c.members_count || 0,
        foundedYear: c.founded_year,
        contactEmail: c.contact_email,
        contactPhone: c.contact_phone,
        website: c.website,
        isPublic: c.is_public || false,
        isVerified: c.is_verified || false,
        logo: c.logo,
        facilities: c.facilities || [],
        createdAt: c.created_at,
        ownerName: ownerMap.get(c.user_id)?.name,
        ownerEmail: ownerMap.get(c.user_id)?.email,
        coAdminCount: (c.admin_user_ids || []).length,
        location: c.location && c.location.latitude ? { latitude: c.location.latitude, longitude: c.location.longitude } : null,
      })));
    } catch (e) {
      console.log('[AdminClubs] Load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Compute club health scores
  const computeHealthScores = useCallback(async () => {
    try {
      const supabase = getSupabaseClient();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentMatches } = await supabase.from('matches').select('user_id, date').gte('date', thirtyDaysAgo);
      const { data: allPlayers } = await supabase.from('players').select('user_id, club_id');
      const { data: tournamentsData } = await supabase.from('tournaments').select('club_id').not('club_id', 'is', null);

      const playerClubMap = new Map<string, string>();
      (allPlayers || []).forEach((p: any) => { if (p.club_id) playerClubMap.set(p.user_id, p.club_id); });

      const matchesByClub = new Map<string, number>();
      (recentMatches || []).forEach((m: any) => {
        const cid = playerClubMap.get(m.user_id);
        if (cid) matchesByClub.set(cid, (matchesByClub.get(cid) || 0) + 1);
      });

      const tournamentsByClub = new Map<string, number>();
      (tournamentsData || []).forEach((t: any) => {
        if (t.club_id) tournamentsByClub.set(t.club_id, (tournamentsByClub.get(t.club_id) || 0) + 1);
      });

      const scores = new Map<string, any>();
      clubs.forEach(club => {
        const matches30d = matchesByClub.get(club.id) || 0;
        const tournamentCount = tournamentsByClub.get(club.id) || 0;
        const memberActivity = Math.min(club.membersCount * 2, 30);
        const ageMonths = Math.floor((Date.now() - new Date(club.createdAt).getTime()) / (30 * 24 * 60 * 60 * 1000));
        const age = Math.min(ageMonths * 2, 20);

        const rawScore = Math.min(100, matches30d * 3 + tournamentCount * 10 + memberActivity + age);
        const score = Math.round(rawScore);
        const label = score >= 70 ? (fr ? 'Actif' : 'Active') : score >= 40 ? (fr ? 'Modere' : 'Moderate') : score >= 15 ? (fr ? 'Faible' : 'Low') : (fr ? 'Inactif' : 'Inactive');
        const color = score >= 70 ? '#10B981' : score >= 40 ? '#D97706' : score >= 15 ? '#EF4444' : '#94A3B8';
        scores.set(club.id, { score, label, color, details: { matches30d, tournamentCount, memberActivity, age } });
      });
      setClubHealthScores(scores);
    } catch { /* silent */ }
  }, [clubs, fr]);

  // Load club activity timeline for detail modal
  const loadClubTimeline = useCallback(async (clubId: string) => {
    setLoadingTimeline(true);
    setTimelineData([]);
    try {
      const supabase = getSupabaseClient();
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
      const { data: allPlayers } = await supabase.from('players').select('user_id, club_id, name, created_at').eq('club_id', clubId);
      const playerUserIds = (allPlayers || []).map((p: any) => p.user_id);
      const events: { type: string; date: string; label: string; icon: string; color: string }[] = [];
      if (playerUserIds.length > 0) {
        const { data: recentMatches } = await supabase.from('matches').select('id, date, team_a, team_b, winner, format').in('user_id', playerUserIds).gte('date', sixMonthsAgo).order('date', { ascending: false }).limit(15);
        (recentMatches || []).forEach((m: any) => {
          events.push({ type: 'match', date: m.date, label: `${m.format || 'Match'} — ${m.winner === 'A' ? 'Victoire' : m.winner === 'B' ? 'Defaite' : 'Egalite'}`, icon: 'sports', color: m.winner === 'A' ? '#10B981' : m.winner === 'B' ? '#EF4444' : '#D97706' });
        });
      }
      const { data: clubTournaments } = await supabase.from('tournaments').select('id, name, date, status, format').eq('club_id', clubId).gte('date', sixMonthsAgo.slice(0, 10)).order('date', { ascending: false }).limit(10);
      (clubTournaments || []).forEach((t: any) => {
        events.push({ type: 'tournament', date: t.date, label: `${t.name} (${t.format})`, icon: 'emoji-events', color: '#7C3AED' });
      });
      (allPlayers || []).forEach((p: any) => {
        if (p.created_at && p.created_at >= sixMonthsAgo) {
          events.push({ type: 'member', date: p.created_at, label: `${p.name} ${fr ? 'a rejoint' : 'joined'}`, icon: 'person-add', color: '#3B82F6' });
        }
      });
      events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTimelineData(events.slice(0, 20));
    } catch { /* silent */ }
    setLoadingTimeline(false);
  }, [fr]);

  useEffect(() => {
    if (detailClub) {
      loadClubTimeline(detailClub.id);
      // Load health trends
      setLoadingTrends2(true);
      setHealthTrends([]);
      getClubHealthTrends(detailClub.id, language).then(({ trends, direction }) => {
        setHealthTrends(trends);
        setHealthDirection(direction);
      }).finally(() => setLoadingTrends2(false));
    }
  }, [detailClub, loadClubTimeline, language]);

  // Load comparison trends when modal opens
  useEffect(() => {
    if (!showComparison || selectedIds.size < 2) return;
    const loadTrends = async () => {
      setLoadingTrends(true);
      try {
        const supabase = getSupabaseClient();
        const compClubs = clubs.filter(c => selectedIds.has(c.id));
        const { data: allPlayers } = await supabase.from('players').select('user_id, club_id');
        const playerClubMap = new Map<string, string>();
        (allPlayers || []).forEach((p: any) => { if (p.club_id) playerClubMap.set(p.user_id, p.club_id); });
        const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentMatches } = await supabase.from('matches').select('user_id, date').gte('date', sixMonthsAgo);
        const trends = new Map<string, { month: string; matches: number }[]>();
        for (const club of compClubs) {
          const monthMap = new Map<string, number>();
          for (let i = 5; i >= 0; i--) {
            const d = new Date(); d.setMonth(d.getMonth() - i);
            const key = d.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { month: 'short' });
            monthMap.set(key, 0);
          }
          (recentMatches || []).forEach((m: any) => {
            const cid = playerClubMap.get(m.user_id);
            if (cid !== club.id) return;
            const d = new Date(m.date);
            const key = d.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { month: 'short' });
            if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) || 0) + 1);
          });
          trends.set(club.id, [...monthMap.entries()].map(([month, matches]) => ({ month, matches })));
        }
        setComparisonTrends(trends);
      } catch { /* silent */ }
      setLoadingTrends(false);
    };
    loadTrends();
  }, [showComparison, selectedIds, clubs, fr]);

  // Load merge history
  const loadMergeHistory = useCallback(async () => {
    const { logs } = await getClubMergeHistory();
    setMergeHistory(logs);
  }, []);

  // Load pending claims
  const loadPendingClaims = useCallback(async () => {
    const { claims } = await getAllPendingClaims();
    const enriched = claims.map(c => {
      const club = clubs.find(cl => cl.id === c.clubId);
      return { ...c, clubName: club?.name || c.clubId.substring(0, 8) };
    });
    setPendingClaims(enriched);
  }, [clubs]);

  // Load claim history (processed)
  const loadClaimHistory = useCallback(async () => {
    const { claims } = await getClaimHistory();
    const enriched = claims.map(c => {
      const club = clubs.find(cl => cl.id === c.clubId);
      return { ...c, clubName: club?.name || c.clubId.substring(0, 8) };
    });
    setClaimHistory(enriched);
  }, [clubs]);

  // Load all merge logs for admin
  const loadAdminMergeLogs = useCallback(async () => {
    const { logs } = await getAllMergeLogsAdmin();
    setAdminMergeLogs(logs);
  }, []);

  // Delete club handler
  const handleAdminDeleteClub = useCallback(async (club: AdminClub) => {
    Alert.alert(
      fr ? 'Supprimer le club' : 'Delete Club',
      fr ? `Supprimer definitivement "${club.name}" ? Cette action est irreversible.` : `Permanently delete "${club.name}"? This action is irreversible.`,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        { text: fr ? 'Supprimer' : 'Delete', style: 'destructive', onPress: async () => {
          setDeletingClubId(club.id);
          const supabase = getSupabaseClient();
          const { error } = await supabase.from('clubs').delete().eq('id', club.id);
          setDeletingClubId(null);
          if (error) { showAlert(fr ? 'Erreur' : 'Error', error.message); return; }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setClubs(prev => prev.filter(c => c.id !== club.id));
          if (detailClub?.id === club.id) setDetailClub(null);
          logAdminAction({ actionType: 'club_unverify', targetType: 'club', targetId: club.id, targetName: club.name, actionDetail: `Deleted club: ${club.name} (${club.city})` });
        }},
      ]
    );
  }, [fr, showAlert, detailClub]);

  // Load claim stats
  const loadClaimStats = useCallback(async () => {
    const stats = await getClaimProcessingStats();
    setClaimStats(stats);
  }, []);

  useEffect(() => { loadClubs(); loadClubMatchCounts(); loadMergeHistory(); loadClaimStats(); loadAdminMergeLogs(); }, [loadClubs, loadClubMatchCounts, loadMergeHistory, loadClaimStats, loadAdminMergeLogs]);
  useEffect(() => { if (clubs.length > 0) { loadPendingClaims(); loadClaimHistory(); } }, [clubs.length, loadPendingClaims, loadClaimHistory]);
  useEffect(() => { if (clubs.length > 0) computeHealthScores(); }, [clubs, computeHealthScores]);

  // Detect club duplicates when clubs load
  useEffect(() => {
    if (clubs.length > 0) {
      const dupes = detectDuplicateClubs(clubs.map(c => ({
        id: c.id, name: c.name, city: c.city, membersCount: c.membersCount,
        isVerified: c.isVerified, isPublic: c.isPublic, description: c.description,
        logo: c.logo, address: c.address, contactEmail: c.contactEmail,
        facilities: c.facilities, foundedYear: c.foundedYear, createdAt: c.createdAt, userId: c.userId,
      })));
      setClubDuplicates(dupes);
    }
  }, [clubs]);

  const handleOpenClubMerge = useCallback(async (group: ClubDuplicateGroup) => {
    if (group.clubs.length < 2) return;
    const a = group.clubs[0];
    const b = group.clubs[1];
    const { keepId, deleteId } = pickBestClub(a, b);
    setClubMergeGroup(group);
    setClubMergeKeepId(keepId);
    setClubMergeDeleteId(deleteId);
    setShowClubMergeModal(true);
    setLoadingClubMergePreview(true);
    const { preview } = await getClubMergePreview(keepId, deleteId);
    setClubMergePreview(preview);
    setLoadingClubMergePreview(false);
  }, []);

  const executeClubMerge = useCallback(async () => {
    if (!clubMergeKeepId || !clubMergeDeleteId || !clubMergeGroup) return;
    setMergingClub(true);
    const keepClub = clubMergeGroup.clubs.find(c => c.id === clubMergeKeepId);
    const delClub = clubMergeGroup.clubs.find(c => c.id === clubMergeDeleteId);
    const { error } = await mergeClubs(clubMergeKeepId, clubMergeDeleteId);
    if (error) {
      showAlert(fr ? 'Erreur' : 'Error', error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setClubs(prev => prev.filter(c => c.id !== clubMergeDeleteId));
      setClubDuplicates(prev => prev.filter(g => g !== clubMergeGroup));
      showAlert(fr ? 'Fusion reussie' : 'Merge successful', fr ? `${delClub?.name} a ete fusionne dans ${keepClub?.name}` : `${delClub?.name} merged into ${keepClub?.name}`);
      logAdminAction({ actionType: 'club_merge' as any, targetType: 'club', targetId: clubMergeKeepId, targetName: keepClub?.name || '', actionDetail: `Merged ${delClub?.name} into ${keepClub?.name}`, metadata: { deletedId: clubMergeDeleteId, deletedName: delClub?.name, preview: clubMergePreview } });
      loadMergeHistory();
    }
    setMergingClub(false);
    setShowClubMergeModal(false);
    setClubMergePreview(null);
    setClubMergeGroup(null);
  }, [clubMergeKeepId, clubMergeDeleteId, clubMergeGroup, clubMergePreview, fr, showAlert]);

  const inactiveClubs = useMemo(() => {
    return clubs.filter(c => {
      const hs = clubHealthScores.get(c.id);
      return hs && hs.score < 15;
    });
  }, [clubs, clubHealthScores]);

  const handleExportCsv = useCallback(async () => {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const headers = 'Name,City,Country,Members,Verified,Public,Health Score,Owner,Email,Created';
      const rows = filteredClubs.map(c => {
        const hs = clubHealthScores.get(c.id);
        return `"${c.name}","${c.city}","${c.country}",${c.membersCount},${c.isVerified},${c.isPublic},${hs?.score || 0},"${c.ownerName || ''}","${c.ownerEmail || ''}",${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : ''}`;
      });
      const csv = [headers, ...rows].join('\n');
      if (typeof document !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `clubs-export-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
        URL.revokeObjectURL(url);
      } else {
        const FS = require('expo-file-system');
        const SharingMod = require('expo-sharing');
        const path = `${FS.cacheDirectory}clubs-export-${new Date().toISOString().slice(0, 10)}.csv`;
        await FS.writeAsStringAsync(path, csv, { encoding: FS.EncodingType.UTF8 });
        const canShare = await SharingMod.isAvailableAsync();
        if (canShare) await SharingMod.shareAsync(path, { mimeType: 'text/csv', dialogTitle: fr ? 'Exporter clubs' : 'Export clubs' });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) { console.log('[AdminClubs] Export error:', e); }
    setExportingCsv(false);
  }, [filteredClubs, clubHealthScores, fr, exportingCsv]);

  const handleBulkPushOwners = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setSendingBulkPush(true);
    try {
      const supabase = getSupabaseClient();
      const targetClubs = clubs.filter(c => ids.includes(c.id));
      for (const club of targetClubs) {
        try {
          await supabase.functions.invoke('send-push', {
            body: { type: 'club_verification', payload: { targetUserId: club.userId, clubName: club.name, clubId: club.id } },
          });
        } catch { /* silent */ }
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(fr ? 'Push envoyes' : 'Push sent', fr ? `${targetClubs.length} notification(s) envoyee(s)` : `${targetClubs.length} notification(s) sent`);
      logAdminAction({ actionType: 'club_verify', actionDetail: `Bulk push to ${targetClubs.length} club owners`, metadata: { clubIds: ids } });
    } catch { /* silent */ }
    setSendingBulkPush(false);
  }, [selectedIds, clubs, fr, showAlert]);

  const handleArchiveInactive = useCallback(async () => {
    if (inactiveClubs.length === 0) return;
    Alert.alert(
      fr ? 'Archiver les clubs inactifs' : 'Archive Inactive Clubs',
      fr ? `Rendre ${inactiveClubs.length} club(s) prives ?` : `Make ${inactiveClubs.length} club(s) private?`,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        { text: fr ? 'Archiver' : 'Archive', style: 'destructive', onPress: async () => {
          setArchivingInactive(true);
          const supabase = getSupabaseClient();
          const ids = inactiveClubs.map(c => c.id);
          await supabase.from('clubs').update({ is_public: false, updated_at: new Date().toISOString() }).in('id', ids);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setClubs(prev => prev.map(c => ids.includes(c.id) ? { ...c, isPublic: false } : c));
          logAdminAction({ actionType: 'club_unverify', actionDetail: `Archived ${ids.length} inactive clubs`, metadata: { clubIds: ids } });
          setArchivingInactive(false);
        }},
      ]
    );
  }, [inactiveClubs, fr]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadClubs();
    setRefreshing(false);
  }, [loadClubs]);

  const filteredClubs = useMemo(() => {
    let items = clubs;
    if (filterType === 'verified') items = items.filter(c => c.isVerified);
    else if (filterType === 'unverified') items = items.filter(c => !c.isVerified);
    else if (filterType === 'public') items = items.filter(c => c.isPublic);
    if (search.trim()) {
      const s = search.toLowerCase();
      items = items.filter(c =>
        c.name.toLowerCase().includes(s) ||
        c.city.toLowerCase().includes(s) ||
        c.ownerName?.toLowerCase().includes(s) ||
        c.ownerEmail?.toLowerCase().includes(s)
      );
    }
    return items;
  }, [clubs, search, filterType]);

  // Enhanced verification criteria helper
  const getClubCriteria = useCallback((club: AdminClub) => {
    const matchCount = clubMatchCounts.get(club.id) || 0;
    return [
      { key: 'address', met: !!club.address, label: fr ? 'Adresse' : 'Address', icon: 'place', weight: 15 },
      { key: 'members', met: club.membersCount >= 2, label: fr ? '2+ membres' : '2+ members', icon: 'people', weight: 15 },
      { key: 'desc', met: !!club.description, label: 'Description', icon: 'description', weight: 15 },
      { key: 'public', met: club.isPublic, label: 'Public', icon: 'public', weight: 10 },
      { key: 'logo', met: !!club.logo, label: 'Logo', icon: 'image', weight: 15 },
      { key: 'matches', met: matchCount >= 5, label: fr ? `${matchCount}/5 matchs` : `${matchCount}/5 matches`, icon: 'sports', weight: 20 },
      { key: 'contact', met: !!(club.contactEmail || club.contactPhone), label: 'Contact', icon: 'contact-phone', weight: 10 },
    ];
  }, [fr, clubMatchCounts]);

  const getCompletenessScore = useCallback((club: AdminClub) => {
    const criteria = getClubCriteria(club);
    return criteria.reduce((sum, c) => sum + (c.met ? c.weight : 0), 0);
  }, [getClubCriteria]);

  // City distribution stats
  const cityDistribution = useMemo(() => {
    const cityMap = new Map<string, number>();
    clubs.forEach(c => { if (c.city) cityMap.set(c.city, (cityMap.get(c.city) || 0) + 1); });
    return [...cityMap.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count).slice(0, 8);
  }, [clubs]);

  // Monthly club creation
  const monthlyCreation = useMemo(() => {
    const monthMap = new Map<string, number>();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
      monthMap.set(key, 0);
    }
    clubs.forEach(c => {
      if (!c.createdAt) return;
      const d = new Date(c.createdAt);
      const key = d.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
      if (monthMap.has(key)) monthMap.set(key, (monthMap.get(key) || 0) + 1);
    });
    return [...monthMap.entries()].map(([month, count]) => ({ month, count }));
  }, [clubs, fr]);

  const avgMembers = useMemo(() => {
    if (clubs.length === 0) return 0;
    return Math.round(clubs.reduce((sum, c) => sum + c.membersCount, 0) / clubs.length * 10) / 10;
  }, [clubs]);

  const stats = useMemo(() => ({
    total: clubs.length,
    verified: clubs.filter(c => c.isVerified).length,
    unverified: clubs.filter(c => !c.isVerified).length,
    public: clubs.filter(c => c.isPublic).length,
    totalMembers: clubs.reduce((sum, c) => sum + c.membersCount, 0),
  }), [clubs]);

  const handleVerify = useCallback(async (club: AdminClub) => {
    const newVal = !club.isVerified;
    setVerifyingId(club.id);
    Haptics.selectionAsync();
    const supabase = getSupabaseClient();
    const { error } = await supabase.from('clubs').update({ is_verified: newVal, updated_at: new Date().toISOString() }).eq('id', club.id);
    setVerifyingId(null);
    if (error) { showAlert(fr ? 'Erreur' : 'Error', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setClubs(prev => prev.map(c => c.id === club.id ? { ...c, isVerified: newVal } : c));
    if (detailClub?.id === club.id) setDetailClub(prev => prev ? { ...prev, isVerified: newVal } : null);
    logAdminAction({
      actionType: newVal ? 'club_verify' : 'club_unverify',
      targetType: 'club',
      targetId: club.id,
      targetName: club.name,
      actionDetail: `${newVal ? 'Verified' : 'Unverified'} club: ${club.name} (${club.city})`,
    });
    // Send push on verify
    if (newVal) {
      try {
        supabase.functions.invoke('send-push', { body: { type: 'club_verification', payload: { targetUserId: club.userId, clubName: club.name, clubId: club.id } } });
      } catch { /* silent */ }
    }
  }, [fr, showAlert, detailClub]);

  const toggleSelection = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleBulkVerify = useCallback(async () => {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      fr ? 'Verification en masse' : 'Bulk Verify',
      fr ? `Verifier ${count} club(s) ?` : `Verify ${count} club(s)?`,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        { text: fr ? 'Verifier' : 'Verify', onPress: async () => {
          setBulkProcessing(true);
          const supabase = getSupabaseClient();
          const ids = [...selectedIds];
          const { error } = await supabase.from('clubs').update({ is_verified: true, updated_at: new Date().toISOString() }).in('id', ids);
          if (error) { showAlert(fr ? 'Erreur' : 'Error', error.message); }
          else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setClubs(prev => prev.map(c => ids.includes(c.id) ? { ...c, isVerified: true } : c));
            logAdminAction({ actionType: 'club_verify', actionDetail: `Bulk verified ${count} clubs`, metadata: { clubIds: ids, count } });
            // Push to all owners
            ids.forEach(cid => {
              const club = clubs.find(c => c.id === cid);
              if (club) {
                try { supabase.functions.invoke('send-push', { body: { type: 'club_verification', payload: { targetUserId: club.userId, clubName: club.name, clubId: club.id } } }); } catch { /* silent */ }
              }
            });
            setSelectedIds(new Set());
            setSelectionMode(false);
          }
          setBulkProcessing(false);
        }},
      ]
    );
  }, [selectedIds, fr, showAlert, clubs]);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{fr ? 'Gestion Clubs' : 'Club Management'}</Text>
        </View>
        <AdminQuickNav currentRoute="/admin-clubs" />
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
          <ClubsSkeleton />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <PageErrorBoundary pageName="Clubs">
    <AdminGuard language={language} requiredPermission="clubs">
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Text style={s.headerTitle}>{fr ? 'Gestion Clubs' : 'Club Management'}</Text>
        <Pressable
          style={[s.selectBtn, selectionMode && s.selectBtnActive]}
          onPress={() => { Haptics.selectionAsync(); setSelectionMode(!selectionMode); if (selectionMode) setSelectedIds(new Set()); }}
        >
          <MaterialIcons name={selectionMode ? 'close' : 'checklist'} size={20} color={selectionMode ? '#FFF' : '#64748B'} />
        </Pressable>
      </View>

      <AdminQuickNav currentRoute="/admin-clubs" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: selectionMode ? insets.bottom + 120 : insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Stats */}
        <View style={s.statsGrid}>
          {[
            { value: stats.total, label: 'Total', icon: 'home', color: '#7C3AED', bg: '#EDE9FE' },
            { value: stats.verified, label: fr ? 'Verifies' : 'Verified', icon: 'verified', color: '#2563EB', bg: '#DBEAFE' },
            { value: stats.unverified, label: fr ? 'Non verifies' : 'Unverified', icon: 'pending', color: '#D97706', bg: '#FEF3C7' },
            { value: stats.totalMembers, label: fr ? 'Membres' : 'Members', icon: 'people', color: '#10B981', bg: '#DCFCE7' },
          ].map((st, i) => (
            <View key={i} style={[s.statCard, { borderColor: st.color + '20' }]}>
              <View style={[s.statIcon, { backgroundColor: st.bg }]}><MaterialIcons name={st.icon as any} size={16} color={st.color} /></View>
              <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Search */}
        <View style={s.searchWrap}>
          <MaterialIcons name="search" size={18} color="#94A3B8" />
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder={fr ? 'Rechercher club, ville, proprietaire...' : 'Search club, city, owner...'} placeholderTextColor="#94A3B8" />
          {search ? <Pressable onPress={() => setSearch('')} hitSlop={8}><MaterialIcons name="close" size={16} color="#94A3B8" /></Pressable> : null}
        </View>

        {/* Filters */}
        <View style={s.filterRow}>
          {([
            { key: 'all' as const, label: fr ? 'Tout' : 'All', icon: 'home', count: stats.total },
            { key: 'verified' as const, label: fr ? 'Verifies' : 'Verified', icon: 'verified', count: stats.verified },
            { key: 'unverified' as const, label: fr ? 'Non verifies' : 'Unverified', icon: 'pending', count: stats.unverified },
            { key: 'public' as const, label: 'Public', icon: 'public', count: stats.public },
          ]).map(f => {
            const isActive = filterType === f.key;
            return (
              <Pressable key={f.key} style={[s.filterChip, isActive && s.filterChipActive]} onPress={() => { Haptics.selectionAsync(); setFilterType(f.key); }}>
                <MaterialIcons name={f.icon as any} size={13} color={isActive ? '#FFF' : '#64748B'} />
                <Text style={[s.filterChipText, isActive && { color: '#FFF' }]}>{f.label}</Text>
                <View style={[s.filterBadge, isActive && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={[s.filterBadgeText, isActive && { color: '#FFF' }]}>{f.count}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Stats Dashboard */}
        {showStats ? (
          <Animated.View entering={FadeInDown.duration(200)}>
            {/* City Distribution */}
            {cityDistribution.length > 0 ? (
              <View style={s.statsCard}>
                <Text style={s.statsCardTitle}>{fr ? 'DISTRIBUTION PAR VILLE' : 'CITY DISTRIBUTION'}</Text>
                {(() => {
                  const maxVal = Math.max(...cityDistribution.map(c => c.count), 1);
                  return cityDistribution.map((c, idx) => (
                    <View key={idx} style={s.chartRow}>
                      <Text style={s.chartLabel} numberOfLines={1}>{c.city}</Text>
                      <View style={s.chartBarBg}>
                        <View style={[s.chartBarFill, { width: `${Math.max(3, (c.count / maxVal) * 100)}%`, backgroundColor: '#7C3AED' }]} />
                      </View>
                      <Text style={s.chartValue}>{c.count}</Text>
                    </View>
                  ));
                })()}
              </View>
            ) : null}
            {/* Monthly Creation */}
            {monthlyCreation.length > 0 ? (
              <View style={s.statsCard}>
                <Text style={s.statsCardTitle}>{fr ? 'CREATION MENSUELLE' : 'MONTHLY CREATION'}</Text>
                {(() => {
                  const maxVal = Math.max(...monthlyCreation.map(m => m.count), 1);
                  return monthlyCreation.map((m, idx) => (
                    <View key={idx} style={s.chartRow}>
                      <Text style={s.chartLabel}>{m.month}</Text>
                      <View style={s.chartBarBg}>
                        <View style={[s.chartBarFill, { width: `${Math.max(3, (m.count / maxVal) * 100)}%`, backgroundColor: idx === monthlyCreation.length - 1 ? '#3B82F6' : '#93C5FD' }]} />
                      </View>
                      <Text style={s.chartValue}>{m.count}</Text>
                    </View>
                  ));
                })()}
              </View>
            ) : null}
            {/* Averages */}
            <View style={s.statsCard}>
              <Text style={s.statsCardTitle}>{fr ? 'MOYENNES' : 'AVERAGES'}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={[s.avgCard, { borderColor: '#3B82F620' }]}>
                  <Text style={[s.avgValue, { color: '#3B82F6' }]}>{avgMembers}</Text>
                  <Text style={s.avgLabel}>{fr ? 'Membres/club' : 'Members/club'}</Text>
                </View>
                <View style={[s.avgCard, { borderColor: '#10B98120' }]}>
                  <Text style={[s.avgValue, { color: '#10B981' }]}>{stats.verified}</Text>
                  <Text style={s.avgLabel}>{fr ? 'Verifies' : 'Verified'}</Text>
                </View>
                <View style={[s.avgCard, { borderColor: '#7C3AED20' }]}>
                  <Text style={[s.avgValue, { color: '#7C3AED' }]}>{stats.public}</Text>
                  <Text style={s.avgLabel}>Public</Text>
                </View>
              </View>
            </View>
          </Animated.View>
        ) : null}

        {/* Pending Claims / Verification Requests — Enhanced Dashboard */}
        {pendingClaims.length > 0 || claimHistory.length > 0 || (claimStats && claimStats.processedThisMonth > 0) ? (
          <Animated.View entering={FadeInDown.duration(300).delay(10)}>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#EFF6FF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#BFDBFE' }}
              onPress={() => { setShowPendingClaims(!showPendingClaims); Haptics.selectionAsync(); }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#2563EB15', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="verified-user" size={18} color="#2563EB" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1E40AF' }}>
                  {pendingClaims.length > 0 ? (fr ? `${pendingClaims.length} demande(s) en attente` : `${pendingClaims.length} pending request(s)`) : (fr ? 'Demandes de verification' : 'Verification Requests')}
                </Text>
                <Text style={{ fontSize: 11, color: '#3B82F6', marginTop: 2 }}>
                  {fr ? 'Verifications, reclamations et historique' : 'Verifications, claims and history'}
                </Text>
              </View>
              <MaterialIcons name={showPendingClaims ? 'expand-less' : 'expand-more'} size={22} color="#94A3B8" />
            </Pressable>

            {showPendingClaims ? (
              <View style={{ gap: 8, marginBottom: 14 }}>
                {/* Tabs: Pending / History */}
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                  <Pressable
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12, backgroundColor: claimHistoryTab === 'pending' ? '#2563EB' : '#F8FAFC', borderWidth: 1.5, borderColor: claimHistoryTab === 'pending' ? '#2563EB' : '#E2E8F0' }}
                    onPress={() => { Haptics.selectionAsync(); setClaimHistoryTab('pending'); }}
                  >
                    <MaterialIcons name="pending" size={14} color={claimHistoryTab === 'pending' ? '#FFF' : '#64748B'} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: claimHistoryTab === 'pending' ? '#FFF' : '#64748B' }}>{fr ? 'En attente' : 'Pending'}</Text>
                    {pendingClaims.length > 0 ? <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: claimHistoryTab === 'pending' ? 'rgba(255,255,255,0.3)' : '#EF444420', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ fontSize: 9, fontWeight: '800', color: claimHistoryTab === 'pending' ? '#FFF' : '#EF4444' }}>{pendingClaims.length}</Text></View> : null}
                  </Pressable>
                  <Pressable
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12, backgroundColor: claimHistoryTab === 'history' ? '#7C3AED' : '#F8FAFC', borderWidth: 1.5, borderColor: claimHistoryTab === 'history' ? '#7C3AED' : '#E2E8F0' }}
                    onPress={() => { Haptics.selectionAsync(); setClaimHistoryTab('history'); }}
                  >
                    <MaterialIcons name="history" size={14} color={claimHistoryTab === 'history' ? '#FFF' : '#64748B'} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: claimHistoryTab === 'history' ? '#FFF' : '#64748B' }}>{fr ? 'Historique' : 'History'}</Text>
                    {claimHistory.length > 0 ? <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: claimHistoryTab === 'history' ? 'rgba(255,255,255,0.3)' : '#7C3AED20', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}><Text style={{ fontSize: 9, fontWeight: '800', color: claimHistoryTab === 'history' ? '#FFF' : '#7C3AED' }}>{claimHistory.length}</Text></View> : null}
                  </Pressable>
                </View>

                {/* Claim History Tab Content */}
                {claimHistoryTab === 'history' ? (
                  <View style={{ gap: 8 }}>
                    {claimHistory.length === 0 ? (
                      <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', gap: 6 }}>
                        <MaterialIcons name="history" size={28} color="#CBD5E1" />
                        <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600' }}>{fr ? 'Aucune demande traitee' : 'No processed requests'}</Text>
                      </View>
                    ) : claimHistory.map(claim => {
                      const isAccepted = claim.status === 'accepted';
                      const isOwnerVerification = claim.requesterUserId === claim.currentOwnerId;
                      const respondedDate = claim.respondedAt ? new Date(claim.respondedAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
                      return (
                        <View key={claim.id} style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: isAccepted ? '#10B98130' : '#EF444430', borderLeftWidth: 3, borderLeftColor: isAccepted ? '#10B981' : '#EF4444' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <MaterialIcons name={isAccepted ? 'check-circle' : 'cancel'} size={16} color={isAccepted ? '#10B981' : '#EF4444'} />
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                                {isOwnerVerification ? (fr ? 'Verification' : 'Verification') : (fr ? 'Reclamation' : 'Claim')}: {claim.clubName}
                              </Text>
                              <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                                {fr ? 'Par' : 'By'} {claim.requesterName || claim.requesterEmail || claim.requesterUserId.substring(0, 8)}
                              </Text>
                            </View>
                            <View style={{ backgroundColor: isAccepted ? '#DCFCE7' : '#FEF2F2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                              <Text style={{ fontSize: 10, fontWeight: '800', color: isAccepted ? '#10B981' : '#EF4444' }}>{isAccepted ? (fr ? 'Accepte' : 'Accepted') : (fr ? 'Refuse' : 'Declined')}</Text>
                            </View>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 10, color: '#94A3B8' }}>{fr ? 'Soumis le' : 'Submitted'} {new Date(claim.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text>
                            {respondedDate ? <Text style={{ fontSize: 10, color: '#94A3B8' }}>• {fr ? 'Traite le' : 'Processed'} {respondedDate}</Text> : null}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                <View style={{ gap: 8 }}>
                {/* Stats Banner */}
                {claimStats ? (
                  <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#F0FDF4', borderRadius: 10, paddingVertical: 10, gap: 2 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#10B981' }}>{claimStats.processedThisMonth}</Text>
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Traites ce mois' : 'This month'}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#DCFCE7', borderRadius: 10, paddingVertical: 10, gap: 2 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#22C55E' }}>{claimStats.acceptedThisMonth}</Text>
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Acceptes' : 'Accepted'}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#FEF2F2', borderRadius: 10, paddingVertical: 10, gap: 2 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#EF4444' }}>{claimStats.declinedThisMonth}</Text>
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Refuses' : 'Declined'}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#EFF6FF', borderRadius: 10, paddingVertical: 10, gap: 2 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#3B82F6' }}>{claimStats.avgResponseTimeHours < 24 ? `${Math.round(claimStats.avgResponseTimeHours)}h` : `${Math.round(claimStats.avgResponseTimeHours / 24)}j`}</Text>
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Temps moy.' : 'Avg time'}</Text>
                      </View>
                    </View>
                    {claimStats.oldestPendingDays > 2 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                        <MaterialIcons name="warning-amber" size={14} color="#D97706" />
                        <Text style={{ fontSize: 11, color: '#92400E' }}>
                          {fr ? `Demande la plus ancienne : ${claimStats.oldestPendingDays} jour(s)` : `Oldest request: ${claimStats.oldestPendingDays} day(s)`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Filter Tabs */}
                {pendingClaims.length > 0 ? (
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                    {([
                      { key: 'all' as const, label: fr ? 'Tout' : 'All', color: '#64748B', count: pendingClaims.length },
                      { key: 'verification' as const, label: fr ? 'Verifications' : 'Verifications', color: '#F59E0B', count: pendingClaims.filter(c => c.requesterUserId === c.currentOwnerId).length },
                      { key: 'claim' as const, label: fr ? 'Reclamations' : 'Claims', color: '#3B82F6', count: pendingClaims.filter(c => c.requesterUserId !== c.currentOwnerId).length },
                    ]).map(f => {
                      const isActive = claimFilter === f.key;
                      return (
                        <Pressable
                          key={f.key}
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: isActive ? f.color + '15' : '#F8FAFC', borderWidth: 1.5, borderColor: isActive ? f.color + '40' : '#E2E8F0' }}
                          onPress={() => { Haptics.selectionAsync(); setClaimFilter(f.key); }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '700', color: isActive ? f.color : '#94A3B8' }}>{f.label}</Text>
                          <View style={{ minWidth: 18, height: 18, borderRadius: 9, backgroundColor: isActive ? f.color + '25' : '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                            <Text style={{ fontSize: 9, fontWeight: '800', color: isActive ? f.color : '#94A3B8' }}>{f.count}</Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {/* Filtered Claims List */}
                {pendingClaims
                  .filter(claim2 => {
                    if (claimFilter === 'all') return true;
                    const isOwnerVerification2 = claim2.requesterUserId === claim2.currentOwnerId;
                    if (claimFilter === 'verification') return isOwnerVerification2;
                    return !isOwnerVerification2;
                  })
                  .map(claim => {
                  const isOwnerVerification = claim.requesterUserId === claim.currentOwnerId;
                  return (
                    <View key={claim.id} style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: isOwnerVerification ? '#F59E0B30' : '#3B82F630', borderLeftWidth: 3, borderLeftColor: isOwnerVerification ? '#F59E0B' : '#3B82F6' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <MaterialIcons name={isOwnerVerification ? 'verified' : 'assignment-ind'} size={16} color={isOwnerVerification ? '#F59E0B' : '#3B82F6'} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                            {isOwnerVerification ? (fr ? 'Verification' : 'Verification') : (fr ? 'Reclamation' : 'Claim')}: {claim.clubName}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                            {fr ? 'Par' : 'By'} {claim.requesterName || claim.requesterEmail || claim.requesterUserId.substring(0, 8)}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 10, color: '#94A3B8' }}>
                          {new Date(claim.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                        </Text>
                      </View>
                      {claim.message ? (
                        <View style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8, marginBottom: 8 }}>
                          <Text style={{ fontSize: 11, color: '#475569', fontStyle: 'italic' }}>{claim.message}</Text>
                        </View>
                      ) : null}
                      {/* Inline Proof Preview */}
                      {claim.proofUrl ? (
                        <Pressable style={{ borderRadius: 10, overflow: 'hidden', marginBottom: 10, borderWidth: 1, borderColor: '#2563EB20' }} onPress={() => Linking.openURL(claim.proofUrl!)}>
                          {claim.proofUrl.toLowerCase().endsWith('.pdf') ? (
                            <View style={{ width: '100%', height: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FEF2F2', flexDirection: 'row', gap: 8 }}>
                              <MaterialIcons name="picture-as-pdf" size={28} color="#EF4444" />
                              <View>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#0F172A' }}>PDF</Text>
                                <Text style={{ fontSize: 10, color: '#94A3B8' }}>{fr ? 'Appuyez pour ouvrir' : 'Tap to open'}</Text>
                              </View>
                            </View>
                          ) : (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, backgroundColor: '#F8FAFC' }}>
                              <Image source={{ uri: claim.proofUrl }} style={{ width: 64, height: 64, borderRadius: 8 }} contentFit="cover" transition={200} />
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#2563EB' }}>{fr ? 'Preuve jointe' : 'Attached proof'}</Text>
                                <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{fr ? 'Appuyez pour agrandir' : 'Tap to enlarge'}</Text>
                              </View>
                              <MaterialIcons name="open-in-new" size={16} color="#2563EB" />
                            </View>
                          )}
                        </Pressable>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', borderRadius: 8, padding: 8, marginBottom: 10 }}>
                          <MaterialIcons name="warning-amber" size={14} color="#D97706" />
                          <Text style={{ fontSize: 10, fontWeight: '600', color: '#92400E' }}>{fr ? 'Aucune preuve fournie' : 'No proof provided'}</Text>
                        </View>
                      )}
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }}
                          onPress={() => {
                            Alert.alert(
                              fr ? 'Refuser' : 'Decline',
                              fr ? 'Refuser cette demande ?' : 'Decline this request?',
                              [
                                { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
                                { text: fr ? 'Refuser' : 'Decline', style: 'destructive', onPress: async () => {
                                  setProcessingClaimId(claim.id);
                                  await declineClubClaim(claim.id);
                                  setPendingClaims(prev => prev.filter(c => c.id !== claim.id));
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  logAdminAction({ actionType: 'club_unverify', actionDetail: `Declined ${isOwnerVerification ? 'verification' : 'claim'} for ${claim.clubName}`, targetType: 'club', targetId: claim.clubId, targetName: claim.clubName || '' });
                                  // Send detailed decision notification
                                  sendVerificationDecisionNotification({
                                    targetUserId: claim.requesterUserId,
                                    clubName: claim.clubName || '',
                                    clubId: claim.clubId,
                                    decision: 'declined',
                                    requestType: isOwnerVerification ? 'verification' : 'claim',
                                  });
                                  loadClaimStats();
                                  setProcessingClaimId(null);
                                }},
                              ]
                            );
                          }}
                          disabled={processingClaimId === claim.id}
                        >
                          <MaterialIcons name="close" size={14} color="#EF4444" />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#EF4444' }}>{fr ? 'Refuser' : 'Decline'}</Text>
                        </Pressable>
                        <Pressable
                          style={{ flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#2563EB' }}
                          onPress={() => {
                            Alert.alert(
                              fr ? 'Accepter' : 'Accept',
                              isOwnerVerification
                                ? (fr ? 'Verifier ce club et donner acces a l\'Analytique ?' : 'Verify this club and grant Analytics access?')
                                : (fr ? 'Transferer la propriete et verifier ce club ?' : 'Transfer ownership and verify this club?'),
                              [
                                { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
                                { text: fr ? 'Accepter' : 'Accept', onPress: async () => {
                                  setProcessingClaimId(claim.id);
                                  if (isOwnerVerification) {
                                    // Just verify the club
                                    const supabase = getSupabaseClient();
                                    await supabase.from('clubs').update({ is_verified: true, updated_at: new Date().toISOString() }).eq('id', claim.clubId);
                                    await supabase.from('club_claim_requests').update({ status: 'accepted', responded_at: new Date().toISOString() }).eq('id', claim.id);
                                    setClubs(prev => prev.map(c => c.id === claim.clubId ? { ...c, isVerified: true } : c));
                                  } else {
                                    // Transfer ownership + verify
                                    await acceptClubClaim(claim.id);
                                    setClubs(prev => prev.map(c => c.id === claim.clubId ? { ...c, isVerified: true, userId: claim.requesterUserId } : c));
                                  }
                                  setPendingClaims(prev => prev.filter(c => c.id !== claim.id));
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  logAdminAction({ actionType: 'club_verify', actionDetail: `Accepted ${isOwnerVerification ? 'verification' : 'claim'} for ${claim.clubName}`, targetType: 'club', targetId: claim.clubId, targetName: claim.clubName || '' });
                                  // Send detailed decision notification
                                  sendVerificationDecisionNotification({
                                    targetUserId: claim.requesterUserId,
                                    clubName: claim.clubName || '',
                                    clubId: claim.clubId,
                                    decision: 'accepted',
                                    requestType: isOwnerVerification ? 'verification' : 'claim',
                                  });
                                  loadClaimStats();
                                  setProcessingClaimId(null);
                                }},
                              ]
                            );
                          }}
                          disabled={processingClaimId === claim.id}
                        >
                          {processingClaimId === claim.id ? <ActivityIndicator size="small" color="#FFF" /> : (
                            <>
                              <MaterialIcons name="check" size={14} color="#FFF" />
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>{fr ? 'Accepter' : 'Accept'}</Text>
                            </>
                          )}
                        </Pressable>
                      </View>
                    </View>
                  );
                })}
              </View>
              )}
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {/* Admin Merge Logs — Compact Button */}
        {adminMergeLogs.length > 0 ? (
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEF3C7', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, borderWidth: 1.5, borderColor: '#FDE68A' }}
            onPress={() => { setShowAdminMergeLogs(true); Haptics.selectionAsync(); }}
          >
            <MaterialIcons name="manage-history" size={18} color="#D97706" />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#92400E' }}>
              {fr ? `${adminMergeLogs.length} fusion(s) globale(s)` : `${adminMergeLogs.length} global merge(s)`}
            </Text>
            <MaterialIcons name="chevron-right" size={18} color="#D97706" />
          </Pressable>
        ) : null}

        {/* Admin Merge Logs Modal */}
        <Modal visible={showAdminMergeLogs} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAdminMergeLogs(false)}>
          <SafeAreaView style={s.modalContainer}>
            <View style={s.modalHeader}>
              <Pressable style={s.backBtn} onPress={() => setShowAdminMergeLogs(false)}><MaterialIcons name="close" size={24} color="#0F172A" /></Pressable>
              <Text style={s.headerTitle}>{fr ? 'Fusions globales' : 'Global Merges'}</Text>
              <View style={{ width: 40 }} />
            </View>
            <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
              {adminMergeLogs.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 48, gap: 8 }}>
                  <MaterialIcons name="merge-type" size={40} color="#CBD5E1" />
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#94A3B8' }}>{fr ? 'Aucune fusion' : 'No merges'}</Text>
                </View>
              ) : adminMergeLogs.map(log => {
                const dateStr = new Date(log.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                return (
                  <View key={log.id} style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#FDE68A', borderLeftWidth: 3, borderLeftColor: '#D97706' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <MaterialIcons name="merge-type" size={16} color="#D97706" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                          <Text style={{ color: '#EF4444', textDecorationLine: 'line-through' }}>{log.sourceName}</Text>
                          {' \u2192 '}
                          <Text style={{ color: '#10B981' }}>{log.targetName}</Text>
                        </Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{dateStr}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <MaterialIcons name="person" size={9} color="#64748B" />
                        <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B' }}>{log.userId.substring(0, 8)}</Text>
                      </View>
                    </View>
                    <Pressable
                      style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#DC2626' }, undoingMergeId === log.id && { opacity: 0.5 }]}
                      onPress={() => {
                        Alert.alert(
                          fr ? 'Annuler la fusion' : 'Undo Merge',
                          fr ? `Recree "${log.sourceName}" et inverse les transferts ?` : `Re-create "${log.sourceName}" and reverse transfers?`,
                          [
                            { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
                            { text: fr ? 'Confirmer' : 'Confirm', style: 'destructive', onPress: async () => {
                              setUndoingMergeId(log.id);
                              const { error } = await adminUndoMerge(log);
                              setUndoingMergeId(null);
                              if (error) {
                                showAlert(fr ? 'Erreur' : 'Error', error);
                              } else {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                showAlert(fr ? 'Fusion annulee' : 'Merge undone', fr ? `"${log.sourceName}" a ete recree.` : `"${log.sourceName}" has been re-created.`);
                                setAdminMergeLogs(prev => prev.filter(l => l.id !== log.id));
                                logAdminAction({ actionType: 'club_verify', actionDetail: `Admin undo merge: re-created ${log.sourceName}`, targetType: log.mergeType as any, targetId: log.sourceId, targetName: log.sourceName });
                                loadClubs();
                              }
                            }},
                          ]
                        );
                      }}
                      disabled={undoingMergeId === log.id}
                    >
                      {undoingMergeId === log.id ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="undo" size={14} color="#FFF" />}
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>{fr ? 'Annuler la fusion' : 'Undo Merge'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </SafeAreaView>
        </Modal>

        {/* Club Duplicates Detection */}
        {clubDuplicates.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(20)}>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F5F3FF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#DDD6FE' }}
              onPress={() => { setShowClubDuplicates(!showClubDuplicates); Haptics.selectionAsync(); }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#7C3AED15', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="content-copy" size={18} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#5B21B6' }}>
                  {fr ? `${clubDuplicates.length} doublon(s) detecte(s)` : `${clubDuplicates.length} duplicate(s) detected`}
                </Text>
                <Text style={{ fontSize: 11, color: '#7C3AED', marginTop: 2 }}>
                  {fr ? 'Clubs avec noms similaires dans la meme ville' : 'Clubs with similar names in the same city'}
                </Text>
              </View>
              <MaterialIcons name={showClubDuplicates ? 'expand-less' : 'expand-more'} size={22} color="#94A3B8" />
            </Pressable>

            {showClubDuplicates ? (
              <View style={{ gap: 8, marginBottom: 14 }}>
                {clubDuplicates.map((group, gIdx) => (
                  <View key={gIdx} style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#DDD6FE', borderLeftWidth: 3, borderLeftColor: '#7C3AED' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <MaterialIcons name="warning" size={14} color="#7C3AED" />
                      <Text style={{ fontSize: 11, fontWeight: '600', color: '#7C3AED' }}>
                        {group.sameCity ? (fr ? 'Meme ville' : 'Same city') : ''} {"•"} {Math.round(group.nameSimilarity * 100)}% {fr ? 'similaire' : 'similar'}
                      </Text>
                    </View>
                    {group.clubs.map((c, cIdx) => {
                      const best = group.clubs.length >= 2 ? pickBestClub(group.clubs[0], group.clubs[1]) : null;
                      const isKept = best && best.keepId === c.id;
                      return (
                        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: cIdx > 0 ? 1 : 0, borderTopColor: '#F5F3FF' }}>
                          <View style={[{ width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center' }, isKept ? { backgroundColor: '#DCFCE7' } : { backgroundColor: '#F1F5F9' }]}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: isKept ? '#10B981' : '#64748B' }}>{isKept ? '\u2713' : String(cIdx + 1)}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 13, fontWeight: '600', color: '#0F172A' }}>{c.name}</Text>
                            <Text style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                              {c.city} {"•"} {c.membersCount} {fr ? 'membres' : 'members'}
                              {c.isVerified ? ' • \u2705' : ''}
                              {isKept ? (fr ? ' (conserve)' : ' (kept)') : ''}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                    {group.clubs.length >= 2 ? (
                      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                        <Pressable
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE' }}
                          onPress={() => handleOpenClubMerge(group)}
                        >
                          <MaterialIcons name="merge-type" size={14} color="#7C3AED" />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#7C3AED' }}>{fr ? 'Fusionner' : 'Merge'}</Text>
                        </Pressable>
                        <Pressable
                          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' }}
                          onPress={async () => {
                            Haptics.selectionAsync();
                            const best = pickBestClub(group.clubs[0], group.clubs[1]);
                            const swapped = best.keepId === group.clubs[0].id
                              ? { keepId: group.clubs[1].id, deleteId: group.clubs[0].id }
                              : { keepId: group.clubs[0].id, deleteId: group.clubs[1].id };
                            setClubMergeGroup(group);
                            setClubMergeKeepId(swapped.keepId);
                            setClubMergeDeleteId(swapped.deleteId);
                            setShowClubMergeModal(true);
                            setLoadingClubMergePreview(true);
                            const { preview } = await getClubMergePreview(swapped.keepId, swapped.deleteId);
                            setClubMergePreview(preview);
                            setLoadingClubMergePreview(false);
                          }}
                        >
                          <MaterialIcons name="swap-horiz" size={14} color="#D97706" />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>{fr ? 'Inverser' : 'Swap'}</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {/* Inactive Clubs Alert */}
        {showInactiveAlert && inactiveClubs.length > 0 ? (
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1.5, borderColor: '#FECACA' }}
            onPress={() => setShowInactiveAlert(false)}
          >
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EF444415', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="warning-amber" size={18} color="#EF4444" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: '#991B1B' }}>{inactiveClubs.length} {fr ? 'club(s) inactif(s)' : 'inactive club(s)'}</Text>
              <Text style={{ fontSize: 11, color: '#DC2626', marginTop: 1 }}>{fr ? 'Aucune activite depuis 30+ jours' : 'No activity for 30+ days'}</Text>
            </View>
            <Pressable
              style={{ paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#EF4444', borderRadius: 8 }}
              onPress={handleArchiveInactive}
              disabled={archivingInactive}
            >
              {archivingInactive ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={{ fontSize: 11, fontWeight: '700', color: '#FFF' }}>{fr ? 'Archiver' : 'Archive'}</Text>}
            </Pressable>
          </Pressable>
        ) : null}

        {/* Merge History */}
        {mergeHistory.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(30)}>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#BBF7D0' }}
              onPress={() => { setShowMergeHistory(!showMergeHistory); Haptics.selectionAsync(); }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#10B98115', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="history" size={18} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: '#065F46' }}>
                  {fr ? `${mergeHistory.length} fusion(s) recente(s)` : `${mergeHistory.length} recent merge(s)`}
                </Text>
                <Text style={{ fontSize: 11, color: '#10B981', marginTop: 2 }}>
                  {fr ? 'Historique des fusions de clubs' : 'Club merge history'}
                </Text>
              </View>
              <MaterialIcons name={showMergeHistory ? 'expand-less' : 'expand-more'} size={22} color="#94A3B8" />
            </Pressable>

            {showMergeHistory ? (
              <View style={{ gap: 6, marginBottom: 14 }}>
                {mergeHistory.map((log) => {
                  const d = new Date(log.createdAt);
                  const dateStr = d.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                  const snapshot = log.sourceSnapshot || {};
                  return (
                    <View key={log.id} style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#BBF7D0', borderLeftWidth: 3, borderLeftColor: '#10B981' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <MaterialIcons name="merge-type" size={16} color="#10B981" />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                            <Text style={{ color: '#EF4444', textDecorationLine: 'line-through' }}>{log.sourceName}</Text>
                            {' \u2192 '}
                            <Text style={{ color: '#10B981' }}>{log.targetName}</Text>
                          </Text>
                          <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>{dateStr}</Text>
                        </View>
                      </View>
                      {snapshot.city || snapshot.members_count ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                          {snapshot.city ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                              <MaterialIcons name="place" size={9} color="#64748B" />
                              <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B' }}>{snapshot.city}</Text>
                            </View>
                          ) : null}
                          {snapshot.members_count ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F1F5F9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                              <MaterialIcons name="people" size={9} color="#64748B" />
                              <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B' }}>{snapshot.members_count} {fr ? 'membres' : 'members'}</Text>
                            </View>
                          ) : null}
                          {snapshot.is_verified ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#DBEAFE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                              <MaterialIcons name="verified" size={9} color="#2563EB" />
                              <Text style={{ fontSize: 9, fontWeight: '600', color: '#2563EB' }}>{fr ? 'Verifie' : 'Verified'}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </Animated.View>
        ) : null}

        {/* Batch Actions Bar */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <Pressable
            style={[s.statsToggle, { flex: 1, minWidth: 90 }]}
            onPress={() => { Haptics.selectionAsync(); setShowStats(!showStats); }}
          >
            <MaterialIcons name="bar-chart" size={16} color="#3B82F6" />
            <Text style={s.statsToggleText}>{showStats ? (fr ? 'Masquer' : 'Hide') : 'Stats'}</Text>
          </Pressable>
          <Pressable
            style={[s.statsToggle, { flex: 1, minWidth: 80, borderColor: '#7C3AED40', backgroundColor: '#F5F3FF' }]}
            onPress={() => { Haptics.selectionAsync(); setShowMap(true); }}
          >
            <MaterialIcons name="map" size={16} color="#7C3AED" />
            <Text style={[s.statsToggleText, { color: '#7C3AED' }]}>{fr ? 'Carte' : 'Map'}</Text>
          </Pressable>
          <Pressable
            style={[s.statsToggle, { flex: 1, minWidth: 80, borderColor: '#10B98140', backgroundColor: '#F0FDF4' }, exportingCsv && { opacity: 0.5 }]}
            onPress={handleExportCsv}
            disabled={exportingCsv}
          >
            {exportingCsv ? <ActivityIndicator size="small" color="#10B981" /> : <MaterialIcons name="file-download" size={16} color="#10B981" />}
            <Text style={[s.statsToggleText, { color: '#10B981' }]}>CSV</Text>
          </Pressable>
        </View>

      {/* Club list */}
        {filteredClubs.length === 0 ? (
          <View style={s.emptyWrap}>
            <View style={s.emptyIcon}><MaterialIcons name="search-off" size={40} color="#CBD5E1" /></View>
            <Text style={s.emptyTitle}>{fr ? 'Aucun club trouve' : 'No clubs found'}</Text>
          </View>
        ) : (
          filteredClubs.map((club, idx) => {
            const isSelected = selectedIds.has(club.id);
            const criteria = [!!club.address, club.membersCount >= 2, !!club.description, club.isPublic];
            const metCount = criteria.filter(Boolean).length;
            return (
              <Animated.View key={club.id} entering={FadeInDown.duration(200).delay(Math.min(idx * 15, 300))}>
                <Pressable
                  style={[s.clubCard, isSelected && s.clubCardSelected]}
                  onPress={() => {
                    if (selectionMode) { toggleSelection(club.id); return; }
                    Haptics.selectionAsync();
                    setDetailClub(club);
                  }}
                >
                  {selectionMode ? (
                    <View style={[s.checkbox, isSelected && s.checkboxActive]}>
                      {isSelected ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
                    </View>
                  ) : null}
                  <View style={s.clubHeader}>
                    {club.logo ? (
                      <Image source={{ uri: club.logo }} style={s.clubLogo} contentFit="cover" transition={200} />
                    ) : (
                      <View style={s.clubLogoPlaceholder}><MaterialIcons name="home" size={22} color="#7C3AED" /></View>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={s.clubNameRow}>
                        <Text style={s.clubName} numberOfLines={1}>{club.name}</Text>
                        {club.isVerified ? <MaterialIcons name="verified" size={16} color="#2563EB" /> : null}
                      </View>
                      <Text style={s.clubCity} numberOfLines={1}>{club.city}{club.country !== 'France' ? ` • ${club.country}` : ''}</Text>
                      <View style={s.clubMetaRow}>
                        <View style={s.clubMeta}><MaterialIcons name="people" size={10} color="#64748B" /><Text style={s.clubMetaText}>{club.membersCount}</Text></View>
                        {club.isPublic ? <View style={[s.clubMeta, { backgroundColor: '#DCFCE7' }]}><MaterialIcons name="public" size={10} color="#10B981" /><Text style={[s.clubMetaText, { color: '#10B981' }]}>Public</Text></View> : null}
                        {club.coAdminCount > 0 ? <View style={s.clubMeta}><MaterialIcons name="group" size={10} color="#7C3AED" /><Text style={[s.clubMetaText, { color: '#7C3AED' }]}>{club.coAdminCount}</Text></View> : null}
                        {(() => {
                          const score = getCompletenessScore(club);
                          const scoreColor = score >= 80 ? '#10B981' : score >= 50 ? '#D97706' : '#EF4444';
                          return (
                            <View style={[s.clubMeta, { backgroundColor: scoreColor + '15' }]}>
                              <Text style={[s.clubMetaText, { color: scoreColor }]}>{score}%</Text>
                            </View>
                          );
                        })()}
                        {(() => {
                          const hs = clubHealthScores.get(club.id);
                          if (!hs) return null;
                          return (
                            <View style={[s.clubMeta, { backgroundColor: hs.color + '15' }]}>
                              <MaterialIcons name="favorite" size={8} color={hs.color} />
                              <Text style={[s.clubMetaText, { color: hs.color }]}>{hs.score}</Text>
                            </View>
                          );
                        })()}
                      </View>
                    </View>
                    {!selectionMode ? (
                      <View style={{ alignItems: 'center', gap: 2 }}>
                        <Pressable
                          style={[s.verifyBtn, club.isVerified ? { backgroundColor: '#DCFCE7' } : { backgroundColor: '#EFF6FF' }]}
                          onPress={() => handleVerify(club)}
                          disabled={verifyingId === club.id}
                        >
                          {verifyingId === club.id ? <ActivityIndicator size="small" color="#2563EB" /> : (
                            <MaterialIcons name={club.isVerified ? 'verified' : 'add-task'} size={18} color={club.isVerified ? '#10B981' : '#2563EB'} />
                          )}
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              </Animated.View>
            );
          })
        )}
      </ScrollView>

      {/* Bulk Action Bar */}
      {selectionMode && selectedIds.size > 0 ? (
        <Animated.View entering={FadeIn.duration(200)} style={[s.bulkBar, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={s.bulkBarText}>{selectedIds.size} {fr ? 'selectionne(s)' : 'selected'}</Text>
          <View style={s.bulkActions}>
            <Pressable style={[s.bulkBtn, { backgroundColor: '#2563EB' }]} onPress={handleBulkVerify} disabled={bulkProcessing}>
              {bulkProcessing ? <ActivityIndicator size="small" color="#FFF" /> : (
                <><MaterialIcons name="verified" size={16} color="#FFF" /><Text style={s.bulkBtnText}>{fr ? 'Verifier' : 'Verify'}</Text></>
              )}
            </Pressable>
            <Pressable style={[s.bulkBtn, { backgroundColor: '#7C3AED' }]} onPress={handleBulkPushOwners} disabled={sendingBulkPush}>
              {sendingBulkPush ? <ActivityIndicator size="small" color="#FFF" /> : (
                <><MaterialIcons name="notifications" size={16} color="#FFF" /><Text style={s.bulkBtnText}>Push</Text></>
              )}
            </Pressable>
            {selectedIds.size >= 2 && selectedIds.size <= 3 ? (
              <Pressable style={[s.bulkBtn, { backgroundColor: '#0EA5E9' }]} onPress={() => { Haptics.selectionAsync(); setShowComparison(true); }}>
                <MaterialIcons name="compare-arrows" size={16} color="#FFF" /><Text style={s.bulkBtnText}>{fr ? 'Comparer' : 'Compare'}</Text>
              </Pressable>
            ) : null}
            <Pressable style={[s.bulkBtn, { backgroundColor: '#64748B', flex: 0, paddingHorizontal: 14 }]} onPress={() => { setSelectedIds(new Set()); setSelectionMode(false); }}>
              <MaterialIcons name="close" size={16} color="#FFF" />
            </Pressable>
          </View>
        </Animated.View>
      ) : null}

      {/* Comparison Modal */}
      <Modal visible={showComparison} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowComparison(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.backBtn} onPress={() => setShowComparison(false)}><MaterialIcons name="close" size={24} color="#0F172A" /></Pressable>
            <Text style={s.headerTitle}>{fr ? 'Comparaison' : 'Comparison'}</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
            {(() => {
              const compClubs = clubs.filter(c => selectedIds.has(c.id)).slice(0, 3);
              if (compClubs.length < 2) return <Text style={{ textAlign: 'center', color: '#94A3B8', marginTop: 40 }}>{fr ? 'Selectionnez 2-3 clubs' : 'Select 2-3 clubs'}</Text>;
              const colors = ['#3B82F6', '#10B981', '#7C3AED'];
              const metrics = [
                { key: 'members', label: fr ? 'Membres' : 'Members', icon: 'people', getValue: (c: AdminClub) => c.membersCount },
                { key: 'health', label: fr ? 'Score sante' : 'Health Score', icon: 'favorite', getValue: (c: AdminClub) => clubHealthScores.get(c.id)?.score || 0 },
                { key: 'completeness', label: fr ? 'Completude' : 'Completeness', icon: 'check-circle', getValue: (c: AdminClub) => getCompletenessScore(c) },
                { key: 'matches', label: fr ? 'Matchs' : 'Matches', icon: 'sports', getValue: (c: AdminClub) => clubMatchCounts.get(c.id) || 0 },
                { key: 'coAdmins', label: 'Co-admins', icon: 'group', getValue: (c: AdminClub) => c.coAdminCount },
              ];
              return (
                <>
                  {/* Club headers */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    {compClubs.map((c, i) => (
                      <View key={c.id} style={{ flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 2, borderColor: colors[i] + '30' }}>
                        {c.logo ? <Image source={{ uri: c.logo }} style={{ width: 40, height: 40, borderRadius: 12, marginBottom: 6 }} contentFit="cover" transition={200} /> : <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors[i] + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}><MaterialIcons name="home" size={20} color={colors[i]} /></View>}
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A', textAlign: 'center' }} numberOfLines={1}>{c.name}</Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8' }}>{c.city}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[i] }} />
                          {c.isVerified ? <MaterialIcons name="verified" size={12} color="#2563EB" /> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                  {/* Metrics comparison */}
                  {metrics.map(metric => {
                    const values = compClubs.map(c => metric.getValue(c));
                    const maxVal = Math.max(...values, 1);
                    return (
                      <View key={metric.key} style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                          <MaterialIcons name={metric.icon as any} size={14} color="#64748B" />
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{metric.label}</Text>
                        </View>
                        {compClubs.map((c, i) => (
                          <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors[i] }} />
                            <View style={{ flex: 1, height: 22, backgroundColor: '#F1F5F9', borderRadius: 6, overflow: 'hidden' }}>
                              <View style={{ height: '100%', width: `${Math.max(3, (values[i] / maxVal) * 100)}%`, backgroundColor: colors[i], borderRadius: 6 }} />
                            </View>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: colors[i], width: 36, textAlign: 'right' }}>{values[i]}</Text>
                          </View>
                        ))}
                      </View>
                    );
                  })}
                  {/* Comparison Trends */}
                  <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <MaterialIcons name="trending-up" size={14} color="#64748B" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Tendances (6 mois)' : 'Trends (6 months)'}</Text>
                    </View>
                    {loadingTrends ? (
                      <ActivityIndicator size="small" color="#3B82F6" style={{ paddingVertical: 16 }} />
                    ) : (() => {
                      const allMonths = compClubs.length > 0 && comparisonTrends.has(compClubs[0].id)
                        ? comparisonTrends.get(compClubs[0].id)!.map(t => t.month)
                        : [];
                      if (allMonths.length === 0) return <Text style={{ fontSize: 11, color: '#94A3B8', textAlign: 'center', paddingVertical: 12 }}>{fr ? 'Aucune donnee' : 'No data'}</Text>;
                      const maxTrendVal = Math.max(1, ...compClubs.flatMap(c => (comparisonTrends.get(c.id) || []).map(t => t.matches)));
                      return allMonths.map((month, mIdx) => (
                        <View key={mIdx} style={{ marginBottom: 8 }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: '#94A3B8', marginBottom: 3 }}>{month}</Text>
                          {compClubs.map((c, i) => {
                            const trend = comparisonTrends.get(c.id);
                            const val = trend ? trend[mIdx]?.matches || 0 : 0;
                            return (
                              <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors[i] }} />
                                <View style={{ flex: 1, height: 14, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                                  <View style={{ height: '100%', width: `${Math.max(3, (val / maxTrendVal) * 100)}%`, backgroundColor: colors[i] + '90', borderRadius: 4 }} />
                                </View>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: colors[i], width: 20, textAlign: 'right' }}>{val}</Text>
                              </View>
                            );
                          })}
                        </View>
                      ));
                    })()}
                  </View>
                  {/* Export Comparison CSV */}
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EFF6FF', borderRadius: 12, paddingVertical: 12, marginBottom: 8, borderWidth: 1, borderColor: '#DBEAFE' }}
                    onPress={async () => {
                      try {
                        const compClubs = clubs.filter(c => selectedIds.has(c.id)).slice(0, 3);
                        const headers = 'Club,City,Members,Health Score,Completeness,Matches,Co-admins,Verified,Public';
                        const rows = compClubs.map(c => {
                          const hs = clubHealthScores.get(c.id);
                          return `"${c.name}","${c.city}",${c.membersCount},${hs?.score || 0},${getCompletenessScore(c)},${clubMatchCounts.get(c.id) || 0},${c.coAdminCount},${c.isVerified},${c.isPublic}`;
                        });
                        const csv = [headers, ...rows].join('\n');
                        if (typeof document !== 'undefined') {
                          const blob = new Blob([csv], { type: 'text/csv' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a'); a.href = url;
                          a.download = `club-comparison-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
                          URL.revokeObjectURL(url);
                        } else {
                          const FS2 = require('expo-file-system');
                          const SharingMod2 = require('expo-sharing');
                          const path = `${FS2.cacheDirectory}club-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
                          await FS2.writeAsStringAsync(path, csv, { encoding: FS2.EncodingType.UTF8 });
                          const canShare = await SharingMod2.isAvailableAsync();
                          if (canShare) await SharingMod2.shareAsync(path, { mimeType: 'text/csv' });
                        }
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      } catch { /* silent */ }
                    }}
                  >
                    <MaterialIcons name="file-download" size={16} color="#2563EB" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#2563EB' }}>{fr ? 'Exporter comparaison' : 'Export comparison'}</Text>
                  </Pressable>
                  {/* Verification status */}
                  <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0F172A', marginBottom: 10 }}>Status</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {compClubs.map((c, i) => (
                        <View key={c.id} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center' }}>
                            {c.isVerified ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#DBEAFE', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}><MaterialIcons name="verified" size={9} color="#2563EB" /><Text style={{ fontSize: 8, fontWeight: '700', color: '#2563EB' }}>{fr ? 'Verifie' : 'Verified'}</Text></View> : null}
                            {c.isPublic ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}><MaterialIcons name="public" size={9} color="#10B981" /><Text style={{ fontSize: 8, fontWeight: '700', color: '#10B981' }}>Public</Text></View> : null}
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                </>
              );
            })()}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Map Modal */}
      <Modal visible={showMap} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowMap(false)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.backBtn} onPress={() => setShowMap(false)}><MaterialIcons name="close" size={24} color="#0F172A" /></Pressable>
            <Text style={s.headerTitle}>{fr ? 'Carte des clubs' : 'Club Map'}</Text>
            <View style={{ width: 40 }} />
          </View>
          {/* Map Filters */}
          <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }}>
            {([
              { key: 'all' as const, label: fr ? 'Tout' : 'All', color: '#64748B' },
              { key: 'active' as const, label: fr ? 'Actifs' : 'Active', color: '#10B981' },
              { key: 'verified' as const, label: fr ? 'Verifies' : 'Verified', color: '#2563EB' },
              { key: 'inactive' as const, label: fr ? 'Inactifs' : 'Inactive', color: '#EF4444' },
            ]).map(f => {
              const isActive = mapFilter === f.key;
              return (
                <Pressable key={f.key} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 8, borderRadius: 10, backgroundColor: isActive ? f.color + '15' : '#F8FAFC', borderWidth: 1.5, borderColor: isActive ? f.color + '40' : '#E2E8F0' }} onPress={() => { Haptics.selectionAsync(); setMapFilter(f.key); }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isActive ? f.color : '#CBD5E1' }} />
                  <Text style={{ fontSize: 10, fontWeight: '700', color: isActive ? f.color : '#94A3B8' }}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flex: 1 }}>
            {MapViewComponent && MarkerComponent ? (() => {
              const clubsWithLoc = clubs.filter(c => {
                if (!c.location) return false;
                if (mapFilter === 'verified') return c.isVerified;
                if (mapFilter === 'active') { const hs = clubHealthScores.get(c.id); return hs && hs.score >= 40; }
                if (mapFilter === 'inactive') { const hs = clubHealthScores.get(c.id); return hs && hs.score < 15; }
                return true;
              });
              if (clubsWithLoc.length === 0) return (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <MaterialIcons name="location-off" size={48} color="#CBD5E1" />
                  <Text style={{ fontSize: 14, color: '#94A3B8', fontWeight: '600' }}>{fr ? 'Aucun club geolocalisee' : 'No geolocated clubs'}</Text>
                </View>
              );
              const avgLat = clubsWithLoc.reduce((s, c) => s + (c.location?.latitude || 0), 0) / clubsWithLoc.length;
              const avgLng = clubsWithLoc.reduce((s, c) => s + (c.location?.longitude || 0), 0) / clubsWithLoc.length;

              // Grid-based clustering
              const gridSize = 0.35; // ~35km grid cells
              const clusterMap = new Map<string, AdminClub[]>();
              clubsWithLoc.forEach(club => {
                const gLat = Math.floor((club.location!.latitude) / gridSize);
                const gLng = Math.floor((club.location!.longitude) / gridSize);
                const key = `${gLat}_${gLng}`;
                if (!clusterMap.has(key)) clusterMap.set(key, []);
                clusterMap.get(key)!.push(club);
              });

              const clusters: { key: string; clubs: AdminClub[]; lat: number; lng: number; count: number; avgHealth: number; avgHealthColor: string; hasVerified: boolean }[] = [];
              const singles: AdminClub[] = [];
              clusterMap.forEach((groupClubs, key) => {
                if (groupClubs.length === 1) {
                  singles.push(groupClubs[0]);
                } else {
                  const cLat = groupClubs.reduce((s, c) => s + c.location!.latitude, 0) / groupClubs.length;
                  const cLng = groupClubs.reduce((s, c) => s + c.location!.longitude, 0) / groupClubs.length;
                  let totalHealth = 0;
                  let healthCount = 0;
                  let hasVerified = false;
                  groupClubs.forEach(c => {
                    const hs = clubHealthScores.get(c.id);
                    if (hs) { totalHealth += hs.score; healthCount++; }
                    if (c.isVerified) hasVerified = true;
                  });
                  const avgH = healthCount > 0 ? Math.round(totalHealth / healthCount) : 50;
                  const avgHColor = avgH >= 70 ? '#10B981' : avgH >= 40 ? '#D97706' : avgH >= 15 ? '#EF4444' : '#94A3B8';
                  clusters.push({ key, clubs: groupClubs, lat: cLat, lng: cLng, count: groupClubs.length, avgHealth: avgH, avgHealthColor: avgHColor, hasVerified });
                }
              });

              return (
                <MapViewComponent
                  style={{ flex: 1 }}
                  initialRegion={{ latitude: avgLat || 46.6, longitude: avgLng || 2.3, latitudeDelta: 6, longitudeDelta: 6 }}
                  showsUserLocation
                >
                  {/* Cluster markers */}
                  {clusters.map(cluster => (
                    <MarkerComponent
                      key={`cluster-${cluster.key}`}
                      coordinate={{ latitude: cluster.lat, longitude: cluster.lng }}
                      tracksViewChanges={false}
                    >
                      <View style={{ alignItems: 'center' }}>
                        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: cluster.avgHealthColor, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 }}>
                          <Text style={{ fontSize: 14, fontWeight: '900', color: '#FFF' }}>{cluster.count}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.92)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 2, borderWidth: 1, borderColor: cluster.avgHealthColor + '40' }}>
                          <MaterialIcons name="favorite" size={8} color={cluster.avgHealthColor} />
                          <Text style={{ fontSize: 8, fontWeight: '800', color: cluster.avgHealthColor }}>{cluster.avgHealth}</Text>
                          {cluster.hasVerified ? <MaterialIcons name="verified" size={8} color="#2563EB" /> : null}
                        </View>
                      </View>
                    </MarkerComponent>
                  ))}
                  {/* Individual markers */}
                  {singles.map(club => {
                    const hs = clubHealthScores.get(club.id);
                    const markerColor = hs ? hs.color : '#94A3B8';
                    return (
                      <MarkerComponent
                        key={club.id}
                        coordinate={{ latitude: club.location!.latitude, longitude: club.location!.longitude }}
                        onPress={() => { setShowMap(false); setTimeout(() => setDetailClub(club), 300); }}
                        tracksViewChanges={false}
                      >
                        <View style={{ alignItems: 'center' }}>
                          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: markerColor, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#FFF' }}>
                            <MaterialIcons name="home" size={14} color="#FFF" />
                          </View>
                          {club.isVerified ? (
                            <View style={{ position: 'absolute', bottom: -3, right: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF' }}>
                              <MaterialIcons name="verified" size={8} color="#FFF" />
                            </View>
                          ) : null}
                        </View>
                      </MarkerComponent>
                    );
                  })}
                </MapViewComponent>
              );
            })() : (
              <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
                <Text style={{ fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 20, marginBottom: 16 }}>{fr ? 'Carte disponible sur mobile' : 'Map available on mobile'}</Text>
                {clubs.filter(c => {
                  if (!c.location) return false;
                  if (mapFilter === 'verified') return c.isVerified;
                  if (mapFilter === 'active') { const hs = clubHealthScores.get(c.id); return hs && hs.score >= 40; }
                  if (mapFilter === 'inactive') { const hs = clubHealthScores.get(c.id); return hs && hs.score < 15; }
                  return true;
                }).map(club => {
                  const hs = clubHealthScores.get(club.id);
                  return (
                    <Pressable key={club.id} style={[s.clubCard, { marginBottom: 6 }]} onPress={() => { setShowMap(false); setTimeout(() => setDetailClub(club), 200); }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: hs?.color || '#94A3B8' }} />
                        <Text style={s.clubName} numberOfLines={1}>{club.name}</Text>
                        {club.isVerified ? <MaterialIcons name="verified" size={14} color="#2563EB" /> : null}
                        <Text style={{ fontSize: 11, color: '#94A3B8', marginLeft: 'auto' }}>{club.city}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {/* Map Legend */}
            <View style={{ position: 'absolute', bottom: insets.bottom + 16, left: 16, right: 16, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 14, padding: 12, flexDirection: 'row', justifyContent: 'space-around', borderWidth: 1, borderColor: '#F1F5F9' }}>
              {[
                { color: '#10B981', label: fr ? 'Actif' : 'Active' },
                { color: '#D97706', label: fr ? 'Modere' : 'Moderate' },
                { color: '#EF4444', label: fr ? 'Faible' : 'Low' },
                { color: '#94A3B8', label: fr ? 'Inactif' : 'Inactive' },
              ].map(l => (
                <View key={l.color} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: l.color }} />
                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B' }}>{l.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Club Merge Preview Modal */}
      <Modal visible={showClubMergeModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!mergingClub) { setShowClubMergeModal(false); setClubMergePreview(null); } }}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.backBtn} onPress={() => { if (!mergingClub) { setShowClubMergeModal(false); setClubMergePreview(null); } }} disabled={mergingClub}>
              <MaterialIcons name="close" size={24} color="#0F172A" />
            </Pressable>
            <Text style={s.headerTitle}>{fr ? 'Fusion de clubs' : 'Club Merge'}</Text>
            <View style={{ width: 40 }} />
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            {clubMergeGroup && clubMergeKeepId && clubMergeDeleteId ? (() => {
              const keepC = clubMergeGroup.clubs.find(c => c.id === clubMergeKeepId);
              const delC = clubMergeGroup.clubs.find(c => c.id === clubMergeDeleteId);
              if (!keepC || !delC) return null;
              return (
                <>
                  {/* Keep/Delete cards */}
                  <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                    <View style={{ flex: 1, backgroundColor: '#DCFCE7', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#BBF7D0' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <MaterialIcons name="check-circle" size={16} color="#10B981" />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#10B981', letterSpacing: 0.5 }}>{fr ? 'CONSERVER' : 'KEEP'}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{keepC.name}</Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{keepC.city} {"•"} {keepC.membersCount} {fr ? 'membres' : 'members'}</Text>
                      {keepC.isVerified ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}><MaterialIcons name="verified" size={12} color="#2563EB" /><Text style={{ fontSize: 10, fontWeight: '700', color: '#2563EB' }}>{fr ? 'Verifie' : 'Verified'}</Text></View> : null}
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#FECACA' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <MaterialIcons name="delete" size={16} color="#EF4444" />
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#EF4444', letterSpacing: 0.5 }}>{fr ? 'SUPPRIMER' : 'DELETE'}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{delC.name}</Text>
                      <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{delC.city} {"•"} {delC.membersCount} {fr ? 'membres' : 'members'}</Text>
                      {delC.isVerified ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 }}><MaterialIcons name="verified" size={12} color="#2563EB" /><Text style={{ fontSize: 10, fontWeight: '700', color: '#2563EB' }}>{fr ? 'Verifie' : 'Verified'}</Text></View> : null}
                    </View>
                  </View>

                  {/* Swap button */}
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: '#FEF3C7', borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 16 }}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setClubMergeKeepId(clubMergeDeleteId);
                      setClubMergeDeleteId(clubMergeKeepId);
                      setLoadingClubMergePreview(true);
                      getClubMergePreview(clubMergeDeleteId!, clubMergeKeepId!).then(({ preview }) => { setClubMergePreview(preview); setLoadingClubMergePreview(false); });
                    }}
                    disabled={loadingClubMergePreview || mergingClub}
                  >
                    <MaterialIcons name="swap-horiz" size={18} color="#D97706" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#D97706' }}>{fr ? 'Inverser' : 'Swap'}</Text>
                  </Pressable>

                  {/* Impact Preview */}
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 10 }}>{fr ? 'IMPACT DE LA FUSION' : 'MERGE IMPACT'}</Text>
                  {loadingClubMergePreview ? (
                    <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 32, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' }}>
                      <ActivityIndicator size="large" color={theme.primary} />
                      <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 8 }}>{fr ? 'Analyse en cours...' : 'Analyzing...'}</Text>
                    </View>
                  ) : clubMergePreview ? (
                    <View style={{ backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 16 }}>
                      {[
                        { icon: 'person', label: fr ? 'Joueurs a transferer' : 'Players to transfer', count: clubMergePreview.players, color: '#3B82F6' },
                        { icon: 'sports', label: fr ? 'Matchs des membres' : 'Member matches', count: clubMergePreview.matches, color: '#D97706' },
                        { icon: 'emoji-events', label: fr ? 'Tournois a transferer' : 'Tournaments to transfer', count: clubMergePreview.tournaments, color: '#7C3AED' },
                        { icon: 'sports-soccer', label: fr ? 'Terrains lies' : 'Linked terrains', count: clubMergePreview.terrains, color: '#10B981' },
                        { icon: 'share', label: fr ? 'Partages' : 'Shared items', count: clubMergePreview.sharedItems, color: '#0EA5E9' },
                        { icon: 'assignment', label: fr ? 'Demandes de transfert' : 'Claim requests', count: clubMergePreview.claimRequests, color: '#EF4444' },
                      ].map((item, idx) => (
                        <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F1F5F9' }}>
                          <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: item.color + '12', alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialIcons name={item.icon as any} size={16} color={item.color} />
                          </View>
                          <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: '#0F172A' }}>{item.label}</Text>
                          <View style={{ minWidth: 28, height: 24, borderRadius: 8, backgroundColor: item.count > 0 ? item.color + '15' : '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: item.count > 0 ? item.color : '#CBD5E1' }}>{item.count}</Text>
                          </View>
                        </View>
                      ))}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Total des references' : 'Total references'}</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#0F172A' }}>
                          {(clubMergePreview.players + clubMergePreview.tournaments + clubMergePreview.terrains + clubMergePreview.sharedItems + clubMergePreview.claimRequests)}
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Warning */}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 16 }}>
                    <MaterialIcons name="warning-amber" size={18} color="#D97706" />
                    <Text style={{ flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 }}>
                      {fr
                        ? 'Cette action est irreversible. Tous les joueurs, tournois et references seront transferes au club conserve, puis le club supprime sera efface. Les membres seront fusionnes.'
                        : 'This action is irreversible. All players, tournaments and references will be transferred to the kept club, then the deleted club will be removed. Members will be merged.'}
                    </Text>
                  </View>

                  {/* Merge Button */}
                  <Pressable
                    style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, borderRadius: 14, backgroundColor: '#DC2626' }, (mergingClub || loadingClubMergePreview) && { opacity: 0.5 }]}
                    onPress={executeClubMerge}
                    disabled={mergingClub || loadingClubMergePreview}
                  >
                    {mergingClub ? <ActivityIndicator size="small" color="#FFF" /> : (
                      <>
                        <MaterialIcons name="merge-type" size={20} color="#FFF" />
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#FFF' }}>{fr ? 'Confirmer la fusion' : 'Confirm Merge'}</Text>
                      </>
                    )}
                  </Pressable>
                </>
              );
            })() : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Detail Modal */}
      <Modal visible={!!detailClub} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailClub(null)}>
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <Pressable style={s.backBtn} onPress={() => setDetailClub(null)}><MaterialIcons name="close" size={24} color="#0F172A" /></Pressable>
            <Text style={s.headerTitle}>{fr ? 'Detail club' : 'Club Detail'}</Text>
            <View style={{ width: 40 }} />
          </View>
          {detailClub ? (
            <ScrollView style={s.scroll} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
              {/* Hero */}
              <View style={s.detailHero}>
                {detailClub.logo ? (
                  <Image source={{ uri: detailClub.logo }} style={s.detailLogo} contentFit="cover" transition={200} />
                ) : (
                  <View style={s.detailLogoPlaceholder}><MaterialIcons name="home" size={36} color="#7C3AED" /></View>
                )}
                <View style={s.detailNameRow}>
                  <Text style={s.detailName}>{detailClub.name}</Text>
                  {detailClub.isVerified ? <MaterialIcons name="verified" size={20} color="#2563EB" /> : null}
                </View>
                <Text style={s.detailCity}>{detailClub.address ? `${detailClub.address}, ` : ''}{detailClub.city}</Text>
                {detailClub.description ? <Text style={s.detailDesc}>{detailClub.description}</Text> : null}
                <View style={s.detailBadges}>
                  {detailClub.isPublic ? <View style={[s.detailBadge, { backgroundColor: '#DCFCE7', borderColor: '#BBF7D0' }]}><MaterialIcons name="public" size={12} color="#10B981" /><Text style={[s.detailBadgeText, { color: '#10B981' }]}>Public</Text></View> : null}
                  {detailClub.isVerified ? <View style={[s.detailBadge, { backgroundColor: '#DBEAFE', borderColor: '#BFDBFE' }]}><MaterialIcons name="verified" size={12} color="#2563EB" /><Text style={[s.detailBadgeText, { color: '#2563EB' }]}>{fr ? 'Verifie' : 'Verified'}</Text></View> : null}
                  {detailClub.coAdminCount > 0 ? <View style={[s.detailBadge, { backgroundColor: '#EDE9FE', borderColor: '#DDD6FE' }]}><MaterialIcons name="group" size={12} color="#7C3AED" /><Text style={[s.detailBadgeText, { color: '#7C3AED' }]}>{detailClub.coAdminCount} co-admin(s)</Text></View> : null}
                </View>
              </View>

              {/* Stats */}
              <View style={s.detailStats}>
                {[
                  { value: detailClub.membersCount, label: fr ? 'Membres' : 'Members', icon: 'people', color: '#3B82F6' },
                  { value: detailClub.foundedYear || '-', label: fr ? 'Fonde' : 'Founded', icon: 'event', color: '#10B981' },
                  { value: detailClub.facilities.length, label: fr ? 'Equip.' : 'Facilities', icon: 'sports-soccer', color: '#D97706' },
                ].map((st, i) => (
                  <View key={i} style={s.detailStatItem}>
                    <MaterialIcons name={st.icon as any} size={16} color={st.color} />
                    <Text style={[s.detailStatValue, { color: st.color }]}>{st.value}</Text>
                    <Text style={s.detailStatLabel}>{st.label}</Text>
                  </View>
                ))}
              </View>

              {/* Owner info */}
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>{fr ? 'PROPRIETAIRE' : 'OWNER'}</Text>
                <View style={s.infoCard}>
                  <View style={s.infoRow}>
                    <View style={[s.infoIcon, { backgroundColor: '#3B82F612' }]}><MaterialIcons name="person" size={16} color="#3B82F6" /></View>
                    <Text style={s.infoLabel}>{fr ? 'Nom' : 'Name'}</Text>
                    <Text style={s.infoValue}>{detailClub.ownerName || '-'}</Text>
                  </View>
                  <View style={[s.infoRow, s.infoRowBorder]}>
                    <View style={[s.infoIcon, { backgroundColor: '#10B98112' }]}><MaterialIcons name="email" size={16} color="#10B981" /></View>
                    <Text style={s.infoLabel}>Email</Text>
                    <Text style={s.infoValue} numberOfLines={1}>{detailClub.ownerEmail || '-'}</Text>
                  </View>
                </View>
              </View>

              {/* Contact info */}
              {(detailClub.contactEmail || detailClub.contactPhone || detailClub.website) ? (
                <View style={s.detailSection}>
                  <Text style={s.detailSectionTitle}>CONTACT</Text>
                  <View style={s.infoCard}>
                    {detailClub.contactEmail ? (
                      <Pressable style={s.infoRow} onPress={() => Linking.openURL(`mailto:${detailClub.contactEmail}`)}>
                        <View style={[s.infoIcon, { backgroundColor: '#3B82F612' }]}><MaterialIcons name="email" size={16} color="#3B82F6" /></View>
                        <Text style={[s.infoValue, { color: '#3B82F6', flex: 1 }]} numberOfLines={1}>{detailClub.contactEmail}</Text>
                        <MaterialIcons name="open-in-new" size={14} color="#3B82F6" />
                      </Pressable>
                    ) : null}
                    {detailClub.contactPhone ? (
                      <Pressable style={[s.infoRow, s.infoRowBorder]} onPress={() => Linking.openURL(`tel:${detailClub.contactPhone}`)}>
                        <View style={[s.infoIcon, { backgroundColor: '#10B98112' }]}><MaterialIcons name="phone" size={16} color="#10B981" /></View>
                        <Text style={[s.infoValue, { color: '#10B981', flex: 1 }]}>{detailClub.contactPhone}</Text>
                        <MaterialIcons name="open-in-new" size={14} color="#10B981" />
                      </Pressable>
                    ) : null}
                    {detailClub.website ? (
                      <Pressable style={[s.infoRow, s.infoRowBorder]} onPress={() => { const url = detailClub.website!.startsWith('http') ? detailClub.website! : `https://${detailClub.website}`; Linking.openURL(url); }}>
                        <View style={[s.infoIcon, { backgroundColor: '#7C3AED12' }]}><MaterialIcons name="language" size={16} color="#7C3AED" /></View>
                        <Text style={[s.infoValue, { color: '#7C3AED', flex: 1 }]} numberOfLines={1}>{detailClub.website}</Text>
                        <MaterialIcons name="open-in-new" size={14} color="#7C3AED" />
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {/* Facilities */}
              {detailClub.facilities.length > 0 ? (
                <View style={s.detailSection}>
                  <Text style={s.detailSectionTitle}>{fr ? 'EQUIPEMENTS' : 'FACILITIES'}</Text>
                  <View style={s.facilitiesRow}>
                    {detailClub.facilities.map((f, i) => (
                      <View key={i} style={s.facilityChip}>
                        <MaterialIcons name="check-circle" size={12} color="#10B981" />
                        <Text style={s.facilityText}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Health Score */}
              {detailClub ? (() => {
                const hs = clubHealthScores.get(detailClub.id);
                if (!hs) return null;
                return (
                  <View style={s.detailSection}>
                    <Text style={s.detailSectionTitle}>{fr ? 'SCORE DE SANTE' : 'HEALTH SCORE'}</Text>
                    <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F1F5F9' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <MaterialIcons name="favorite" size={16} color={hs.color} />
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{hs.label}</Text>
                        </View>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: hs.color }}>{hs.score}/100</Text>
                      </View>
                      <View style={{ height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                        <View style={{ height: '100%', width: `${Math.max(3, hs.score)}%`, backgroundColor: hs.color, borderRadius: 4 }} />
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {[
                          { label: fr ? `${hs.details.matches30d} matchs/30j` : `${hs.details.matches30d} matches/30d`, icon: 'sports', value: hs.details.matches30d },
                          { label: fr ? `${hs.details.tournamentCount} tournoi(s)` : `${hs.details.tournamentCount} tournament(s)`, icon: 'emoji-events', value: hs.details.tournamentCount },
                          { label: `${detailClub.membersCount} ${fr ? 'membres' : 'members'}`, icon: 'people', value: detailClub.membersCount },
                        ].map((item, i) => (
                          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: item.value > 0 ? '#DCFCE7' : '#FEF2F2', borderWidth: 1, borderColor: item.value > 0 ? '#BBF7D0' : '#FECACA' }}>
                            <MaterialIcons name={item.icon as any} size={10} color={item.value > 0 ? '#10B981' : '#EF4444'} />
                            <Text style={{ fontSize: 9, fontWeight: '700', color: item.value > 0 ? '#10B981' : '#EF4444' }}>{item.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                );
              })() : null}

              {/* Health Score Trends */}
              {detailClub ? (() => {
                const hs = clubHealthScores.get(detailClub.id);
                return (
                  <View style={s.detailSection}>
                    <Text style={s.detailSectionTitle}>{fr ? 'EVOLUTION SANTE (6 MOIS)' : 'HEALTH TRENDS (6 MONTHS)'}</Text>
                    {loadingTrends2 ? (
                      <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' }}>
                        <ActivityIndicator size="small" color="#3B82F6" />
                      </View>
                    ) : healthTrends.length > 0 ? (
                      <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F1F5F9' }}>
                        {/* Direction indicator */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <MaterialIcons name="show-chart" size={16} color={healthDirection === 'improving' ? '#10B981' : healthDirection === 'declining' ? '#EF4444' : '#D97706'} />
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Tendance' : 'Trend'}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: healthDirection === 'improving' ? '#DCFCE7' : healthDirection === 'declining' ? '#FEF2F2' : '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                            <MaterialIcons name={healthDirection === 'improving' ? 'trending-up' : healthDirection === 'declining' ? 'trending-down' : 'trending-flat'} size={14} color={healthDirection === 'improving' ? '#10B981' : healthDirection === 'declining' ? '#EF4444' : '#D97706'} />
                            <Text style={{ fontSize: 11, fontWeight: '800', color: healthDirection === 'improving' ? '#10B981' : healthDirection === 'declining' ? '#EF4444' : '#D97706' }}>
                              {healthDirection === 'improving' ? (fr ? 'En hausse' : 'Improving') : healthDirection === 'declining' ? (fr ? 'En baisse' : 'Declining') : (fr ? 'Stable' : 'Stable')}
                            </Text>
                          </View>
                        </View>
                        {/* Monthly bars */}
                        {(() => {
                          const maxScore = Math.max(...healthTrends.map(t => t.score), 1);
                          return healthTrends.map((t, idx) => {
                            const isLast = idx === healthTrends.length - 1;
                            return (
                              <View key={idx} style={{ marginBottom: 6 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                  <Text style={{ width: 36, fontSize: 10, fontWeight: isLast ? '800' : '600', color: isLast ? '#0F172A' : '#94A3B8' }}>{t.month}</Text>
                                  <View style={{ flex: 1, height: 18, backgroundColor: '#F1F5F9', borderRadius: 5, overflow: 'hidden' }}>
                                    <View style={{ height: '100%' as any, width: `${Math.max(3, (t.score / 100) * 100)}%`, backgroundColor: t.color, borderRadius: 5 }} />
                                  </View>
                                  <Text style={{ width: 28, fontSize: 12, fontWeight: '800', color: t.color, textAlign: 'right' }}>{t.score}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8, marginLeft: 44, marginTop: 2 }}>
                                  <Text style={{ fontSize: 8, color: '#94A3B8' }}>{t.matches} {fr ? 'matchs' : 'matches'}</Text>
                                  <Text style={{ fontSize: 8, color: '#94A3B8' }}>{t.members} {fr ? 'membres' : 'members'}</Text>
                                </View>
                              </View>
                            );
                          });
                        })()}
                        {/* Declining alert */}
                        {healthDirection === 'declining' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, marginTop: 8, borderWidth: 1, borderColor: '#FECACA' }}>
                            <MaterialIcons name="warning-amber" size={14} color="#EF4444" />
                            <Text style={{ flex: 1, fontSize: 10, color: '#991B1B', lineHeight: 14 }}>
                              {fr ? 'Le score de sante de ce club est en baisse. Verifiez l\'activite des membres et encouragez la participation.' : 'This club\'s health score is declining. Check member activity and encourage participation.'}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', gap: 6 }}>
                        <MaterialIcons name="show-chart" size={28} color="#CBD5E1" />
                        <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600' }}>{fr ? 'Pas assez de donnees' : 'Not enough data'}</Text>
                      </View>
                    )}
                  </View>
                );
              })() : null}

              {/* Activity Timeline */}
              {detailClub ? (
                <View style={s.detailSection}>
                  <Text style={s.detailSectionTitle}>{fr ? 'ACTIVITE RECENTE' : 'RECENT ACTIVITY'}</Text>
                  {loadingTimeline ? (
                    <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9' }}>
                      <ActivityIndicator size="small" color="#3B82F6" />
                    </View>
                  ) : timelineData.length === 0 ? (
                    <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', gap: 6 }}>
                      <MaterialIcons name="history" size={28} color="#CBD5E1" />
                      <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600' }}>{fr ? 'Aucune activite recente' : 'No recent activity'}</Text>
                    </View>
                  ) : (
                    <View style={{ backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' }}>
                      {timelineData.map((ev, idx) => {
                        const d = new Date(ev.date);
                        const dateStr = d.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
                        return (
                          <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: idx > 0 ? 1 : 0, borderTopColor: '#F1F5F9' }}>
                            <View style={{ alignItems: 'center', width: 28 }}>
                              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: ev.color + '15', alignItems: 'center', justifyContent: 'center' }}>
                                <MaterialIcons name={ev.icon as any} size={14} color={ev.color} />
                              </View>
                              {idx < timelineData.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: '#F1F5F9', marginTop: 4, minHeight: 8 }} /> : null}
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: '#0F172A' }} numberOfLines={1}>{ev.label}</Text>
                              <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>{dateStr}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : null}

              {/* Enhanced Verification Criteria */}
              {detailClub ? (() => {
                const criteria = getClubCriteria(detailClub);
                const score = getCompletenessScore(detailClub);
                const scoreColor = score >= 80 ? '#10B981' : score >= 50 ? '#D97706' : '#EF4444';
                const suggestions = criteria.filter(c => !c.met);
                return (
                  <View style={s.detailSection}>
                    <Text style={s.detailSectionTitle}>{fr ? 'SCORE DE COMPLETUDE' : 'COMPLETENESS SCORE'}</Text>
                    <View style={{ backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F1F5F9' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#0F172A' }}>{fr ? 'Verification' : 'Verification'}</Text>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: scoreColor }}>{score}%</Text>
                      </View>
                      <View style={{ height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                        <View style={{ height: '100%', width: `${Math.max(3, score)}%`, backgroundColor: scoreColor, borderRadius: 4 }} />
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                        {criteria.map(c => (
                          <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: c.met ? '#DCFCE7' : '#FEF2F2', borderWidth: 1, borderColor: c.met ? '#BBF7D0' : '#FECACA' }}>
                            <MaterialIcons name={c.met ? 'check-circle' : 'cancel'} size={10} color={c.met ? '#10B981' : '#EF4444'} />
                            <Text style={{ fontSize: 9, fontWeight: '700', color: c.met ? '#10B981' : '#EF4444' }}>{c.label}</Text>
                          </View>
                        ))}
                      </View>
                      {suggestions.length > 0 ? (
                        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8', marginBottom: 6, letterSpacing: 0.5 }}>{fr ? 'AMELIORATIONS' : 'IMPROVEMENTS'}</Text>
                          {suggestions.slice(0, 3).map(s => (
                            <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <MaterialIcons name={s.icon as any} size={12} color="#D97706" />
                              <Text style={{ fontSize: 11, color: '#64748B' }}>{fr ? 'Ajouter' : 'Add'} {s.label.toLowerCase()}</Text>
                              <Text style={{ fontSize: 9, color: '#94A3B8', marginLeft: 'auto' }}>+{s.weight}%</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })() : null}

              {/* Actions */}
              <View style={s.detailSection}>
                <Text style={s.detailSectionTitle}>ACTIONS</Text>
                <View style={s.detailActionsRow}>
                  <Pressable
                    style={[s.detailActionBtn, { backgroundColor: detailClub.isVerified ? '#94A3B8' : '#2563EB' }]}
                    onPress={() => handleVerify(detailClub)}
                    disabled={verifyingId === detailClub.id}
                  >
                    {verifyingId === detailClub.id ? <ActivityIndicator size="small" color="#FFF" /> : (
                      <><MaterialIcons name={detailClub.isVerified ? 'remove-circle' : 'verified'} size={18} color="#FFF" /><Text style={s.detailActionText}>{detailClub.isVerified ? (fr ? 'Retirer' : 'Unverify') : (fr ? 'Verifier' : 'Verify')}</Text></>
                    )}
                  </Pressable>
                  <Pressable
                    style={[s.detailActionBtn, { backgroundColor: '#10B981' }]}
                    onPress={() => { setDetailClub(null); router.push(`/club/${detailClub.id}` as any); }}
                  >
                    <MaterialIcons name="open-in-new" size={18} color="#FFF" />
                    <Text style={s.detailActionText}>{fr ? 'Voir' : 'View'}</Text>
                  </Pressable>
                </View>
                {/* Edit & Delete buttons */}
                <View style={[s.detailActionsRow, { marginTop: 8 }]}>
                  <Pressable
                    style={[s.detailActionBtn, { backgroundColor: '#F59E0B' }]}
                    onPress={() => { setDetailClub(null); router.push(`/club/edit/${detailClub.id}` as any); }}
                  >
                    <MaterialIcons name="edit" size={18} color="#FFF" />
                    <Text style={s.detailActionText}>{fr ? 'Modifier' : 'Edit'}</Text>
                  </Pressable>
                  <Pressable
                    style={[s.detailActionBtn, { backgroundColor: '#EF4444' }]}
                    onPress={() => handleAdminDeleteClub(detailClub)}
                    disabled={deletingClubId === detailClub.id}
                  >
                    {deletingClubId === detailClub.id ? <ActivityIndicator size="small" color="#FFF" /> : (
                      <><MaterialIcons name="delete" size={18} color="#FFF" /><Text style={s.detailActionText}>{fr ? 'Supprimer' : 'Delete'}</Text></>
                    )}
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          ) : null}
        </SafeAreaView>
      </Modal>
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
  selectBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#E2E8F0' },
  selectBtnActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  modalContainer: { flex: 1, backgroundColor: '#F8FAFC' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },

  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 10, alignItems: 'center', borderWidth: 1 },
  statIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: { fontSize: 8, fontWeight: '600', color: '#94A3B8', marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.3 },

  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, paddingHorizontal: 14, gap: 8, marginBottom: 12, borderWidth: 1.5, borderColor: '#E2E8F0' },
  searchInput: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 12 },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  filterChipActive: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  filterBadge: { minWidth: 20, height: 18, borderRadius: 9, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  filterBadgeText: { fontSize: 9, fontWeight: '800', color: '#94A3B8' },

  clubCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  clubCardSelected: { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },
  clubHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clubLogo: { width: 48, height: 48, borderRadius: 14, overflow: 'hidden' as const },
  clubLogoPlaceholder: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center' },
  clubNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  clubName: { fontSize: 15, fontWeight: '700', color: '#0F172A', flex: 1 },
  clubCity: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  clubMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  clubMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F8FAFC', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  clubMetaText: { fontSize: 10, fontWeight: '600', color: '#64748B' },
  verifyBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  // Stats Dashboard
  statsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginBottom: 12, backgroundColor: '#EFF6FF', borderRadius: 12, borderWidth: 1, borderColor: '#DBEAFE' },
  statsToggleText: { fontSize: 12, fontWeight: '700', color: '#3B82F6' },
  statsCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F1F5F9' },
  statsCardTitle: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 10 },
  chartRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  chartLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', width: 56 },
  chartBarBg: { flex: 1, height: 16, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' },
  chartBarFill: { height: '100%', borderRadius: 4 },
  chartValue: { fontSize: 11, fontWeight: '800', color: '#0F172A', width: 24, textAlign: 'right' },
  avgCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1 },
  avgValue: { fontSize: 18, fontWeight: '800' },
  avgLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' },

  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  checkboxActive: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },

  bulkBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingHorizontal: 16, paddingTop: 12, shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 8 },
  bulkBarText: { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 8 },
  bulkActions: { flexDirection: 'row', gap: 8 },
  bulkBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, flex: 1, justifyContent: 'center' },
  bulkBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },

  emptyWrap: { alignItems: 'center', paddingVertical: 56 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },

  // Detail
  detailHero: { alignItems: 'center', backgroundColor: '#FFF', borderRadius: 20, padding: 24, marginBottom: 16 },
  detailLogo: { width: 80, height: 80, borderRadius: 24, marginBottom: 12 },
  detailLogoPlaceholder: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  detailNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  detailName: { fontSize: 20, fontWeight: '800', color: '#0F172A' },
  detailCity: { fontSize: 13, color: '#94A3B8', marginBottom: 8 },
  detailDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 19, marginBottom: 10 },
  detailBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  detailBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  detailBadgeText: { fontSize: 11, fontWeight: '700' },

  detailStats: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  detailStatItem: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 14, alignItems: 'center', gap: 4 },
  detailStatValue: { fontSize: 18, fontWeight: '800' },
  detailStatLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' },

  detailSection: { marginBottom: 16 },
  detailSectionTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1, marginBottom: 10, paddingHorizontal: 4 },

  infoCard: { backgroundColor: '#FFF', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#F1F5F9' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 14 },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  infoIcon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 13, fontWeight: '600', color: '#64748B', flex: 1 },
  infoValue: { fontSize: 14, fontWeight: '700', color: '#0F172A' },

  facilitiesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  facilityChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#DCFCE7', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  facilityText: { fontSize: 12, fontWeight: '600', color: '#10B981' },

  detailActionsRow: { flexDirection: 'row', gap: 8 },
  detailActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12 },
  detailActionText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
