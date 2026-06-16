/**
 * Admin Announcements Page
 *
 * Allows admins to send targeted push notifications with:
 * - FR/EN title + message inputs
 * - Target selector: All / City / Club / Level
 * - Real-time message preview
 * - Push send with confirmation
 * - Announcement history log
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
  FlatList,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
const NoAnimView = ({ entering, ...props }: any) => <View {...props} />;
const Animated = { View: NoAnimView };
const _noop: any = () => _noop; _noop.duration = _noop; _noop.delay = _noop; _noop.springify = _noop; _noop.damping = _noop;
const FadeInDown = _noop; const FadeIn = _noop;
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import AdminQuickNav from '@/components/feature/AdminQuickNav';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert } from '@/template';
import {
  sendAnnouncement,
  getAnnouncementHistory,
  getTargetCities,
  getTargetClubs,
  cancelScheduledAnnouncement,
  sendScheduledAnnouncementNow,
  resendWinningVariant,
  Announcement,
  CustomTemplate,
} from '@/services/announcementService';
import { useAdminCache } from '@/hooks/useAdminCache';
import AsyncStorage from '@react-native-async-storage/async-storage';

type TargetType = 'all' | 'city' | 'club' | 'rank' | 'account_age' | 'match_count' | 'last_active';

interface AnnouncementTemplate {
  id: string;
  icon: string;
  color: string;
  labelFr: string;
  labelEn: string;
  titleFr: string;
  titleEn: string;
  messageFr: string;
  messageEn: string;
  targetType: TargetType;
}

const ANNOUNCEMENT_TEMPLATES: AnnouncementTemplate[] = [
  {
    id: 'new_tournament', icon: 'emoji-events', color: '#F59E0B',
    labelFr: 'Nouveau tournoi', labelEn: 'New tournament',
    titleFr: 'Nouveau tournoi a venir !', titleEn: 'New tournament coming!',
    messageFr: 'Un nouveau tournoi est disponible. Inscrivez-vous maintenant pour ne pas rater ca !',
    messageEn: 'A new tournament is available. Register now so you do not miss it!',
    targetType: 'all',
  },
  {
    id: 'app_update', icon: 'system-update', color: '#3B82F6',
    labelFr: 'Mise a jour app', labelEn: 'App update',
    titleFr: 'Nouvelle mise a jour disponible', titleEn: 'New update available',
    messageFr: 'Une nouvelle version de Ultimate Petanque est disponible avec des ameliorations et corrections. Mettez a jour maintenant !',
    messageEn: 'A new version of Ultimate Petanque is available with improvements and fixes. Update now!',
    targetType: 'all',
  },
  {
    id: 'community_event', icon: 'celebration', color: '#7C3AED',
    labelFr: 'Evenement communautaire', labelEn: 'Community event',
    titleFr: 'Evenement special ce week-end !', titleEn: 'Special event this weekend!',
    messageFr: 'Rejoignez-nous pour un evenement communautaire exceptionnel. Defis, recompenses et bonne ambiance !',
    messageEn: 'Join us for an exceptional community event. Challenges, rewards and great vibes!',
    targetType: 'all',
  },
  {
    id: 'season_start', icon: 'stars', color: '#10B981',
    labelFr: 'Debut de saison', labelEn: 'Season start',
    titleFr: 'La nouvelle saison commence !', titleEn: 'New season starts!',
    messageFr: 'La nouvelle saison ELO demarre. Tous les classements ont ete comprimes. A vous de jouer !',
    messageEn: 'New ELO season starts. All rankings have been compressed. Time to play!',
    targetType: 'all',
  },
  {
    id: 'maintenance_warning', icon: 'construction', color: '#D97706',
    labelFr: 'Maintenance planifiee', labelEn: 'Scheduled maintenance',
    titleFr: 'Maintenance prevue', titleEn: 'Scheduled maintenance',
    messageFr: 'Une maintenance est prevue prochainement. L\'application pourrait etre temporairement indisponible.',
    messageEn: 'Maintenance is scheduled soon. The app may be temporarily unavailable.',
    targetType: 'all',
  },
];

const TARGET_OPTIONS: { key: TargetType; icon: string; color: string; labelFr: string; labelEn: string }[] = [
  { key: 'all', icon: 'public', color: '#10B981', labelFr: 'Tous', labelEn: 'All users' },
  { key: 'city', icon: 'location-city', color: '#2563EB', labelFr: 'Par ville', labelEn: 'By city' },
  { key: 'club', icon: 'home', color: '#7C3AED', labelFr: 'Par club', labelEn: 'By club' },
  { key: 'rank', icon: 'leaderboard', color: '#D97706', labelFr: 'Par rang ELO', labelEn: 'By ELO rank' },
  { key: 'account_age', icon: 'person-add', color: '#0EA5E9', labelFr: 'Nouveaux comptes', labelEn: 'New accounts' },
  { key: 'match_count', icon: 'sports', color: '#EC4899', labelFr: 'Nb de matchs', labelEn: 'Match count' },
  { key: 'last_active', icon: 'schedule', color: '#6366F1', labelFr: 'Inactifs', labelEn: 'Inactive users' },
];

const RANK_OPTIONS = [
  { id: 'bronze', labelFr: 'Bronze', labelEn: 'Bronze', icon: 'shield', color: '#CD7F32', minElo: 0, maxElo: 1099 },
  { id: 'silver', labelFr: 'Argent', labelEn: 'Silver', icon: 'workspace-premium', color: '#94A3B8', minElo: 1100, maxElo: 1199 },
  { id: 'gold', labelFr: 'Or', labelEn: 'Gold', icon: 'emoji-events', color: '#F59E0B', minElo: 1200, maxElo: 1499 },
  { id: 'diamond', labelFr: 'Diamant', labelEn: 'Diamond', icon: 'diamond', color: '#06B6D4', minElo: 1500, maxElo: 1799 },
  { id: 'master', labelFr: 'Maitre', labelEn: 'Master', icon: 'military-tech', color: '#9333EA', minElo: 1800, maxElo: 1999 },
  { id: 'grand_master', labelFr: 'Grand Maitre', labelEn: 'Grand Master', icon: 'auto-awesome', color: '#FFD700', minElo: 2000, maxElo: 99999 },
];

export default function AdminAnnouncementsScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const fr = language === 'fr';
  const adminCache = useAdminCache();

  // Form state
  const [titleFr, setTitleFr] = useState('');
  const [titleEn, setTitleEn] = useState('');
  const [messageFr, setMessageFr] = useState('');
  const [messageEn, setMessageEn] = useState('');
  const [targetType, setTargetType] = useState<TargetType>('all');
  const [targetValue, setTargetValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Loading state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [history, setHistory] = useState<Announcement[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [clubs, setClubs] = useState<{ id: string; name: string; city: string }[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // Search for city/club picker
  const [valueSearch, setValueSearch] = useState('');
  const [showValuePicker, setShowValuePicker] = useState(false);

  // Multi-select for rank
  const [selectedRanks, setSelectedRanks] = useState<string[]>([]);

  // Account age targeting
  const [accountAgeDays, setAccountAgeDays] = useState('7');
  const [accountAgeCount, setAccountAgeCount] = useState(0);

  // Match count targeting
  const [matchCountMin, setMatchCountMin] = useState('0');
  const [matchCountMax, setMatchCountMax] = useState('5');
  const [matchCountPlayerCount, setMatchCountPlayerCount] = useState(0);

  // Last active targeting
  const [inactiveDays, setInactiveDays] = useState('30');
  const [inactiveCount, setInactiveCount] = useState(0);

  // Rank distribution preview
  const [rankDistribution, setRankDistribution] = useState<Record<string, number>>({});
  const [rankDistLoading, setRankDistLoading] = useState(false);

  // Templates
  const [showTemplates, setShowTemplates] = useState(false);

  // Scheduling
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');

  // Analytics
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Retention campaign builder
  const [showRetentionBuilder, setShowRetentionBuilder] = useState(false);
  const [retentionSegment, setRetentionSegment] = useState<'welcome' | 'reactivation' | 'encouragement' | 'combined' | null>(null);

  // A/B testing
  const [abTestMode, setAbTestMode] = useState(false);
  const [variantBTitleFr, setVariantBTitleFr] = useState('');
  const [variantBTitleEn, setVariantBTitleEn] = useState('');
  const [variantBMessageFr, setVariantBMessageFr] = useState('');
  const [variantBMessageEn, setVariantBMessageEn] = useState('');

  // Custom templates
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Smart scheduler
  const [smartScheduleLoading, setSmartScheduleLoading] = useState(false);
  const [smartSlots, setSmartSlots] = useState<{ hour: number; score: number }[]>([]);
  const [showSmartSlots, setShowSmartSlots] = useState(false);

  // Preview platform toggle
  const [previewPlatform, setPreviewPlatform] = useState<'ios' | 'android'>('ios');

  // Combined segmentation
  const [combinedFilters, setCombinedFilters] = useState<Record<string, string>>({});
  const [combinedCount, setCombinedCount] = useState(0);
  const [combinedCountLoading, setCombinedCountLoading] = useState(false);

  // Load custom templates from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem('admin_custom_templates').then(val => {
      if (val) try { setCustomTemplates(JSON.parse(val)); } catch { /* silent */ }
    }).catch(() => {});
  }, []);

  // Derived state (must be before useCallbacks that reference them)
  const hasMessage = (titleFr.trim() || titleEn.trim()) && (messageFr.trim() || messageEn.trim());
  const hasTarget = targetType === 'all'
    || (targetType === 'rank' ? selectedRanks.length > 0 : false)
    || (targetType === 'city' || targetType === 'club' ? targetValue.length > 0 : false)
    || targetType === 'account_age'
    || targetType === 'match_count'
    || targetType === 'last_active';

  const saveCustomTemplate = useCallback(async () => {
    if (!templateName.trim() || !hasMessage) return;
    setSavingTemplate(true);
    const newTemplate: CustomTemplate = {
      id: Date.now().toString(),
      name: templateName.trim(),
      titleFr, titleEn, messageFr, messageEn,
      targetType,
      targetValue: targetType === 'rank' ? selectedRanks.join(',') : targetType === 'account_age' ? accountAgeDays : targetType === 'match_count' ? `${matchCountMin}-${matchCountMax}` : targetType === 'last_active' ? inactiveDays : targetValue,
      createdAt: new Date().toISOString(),
    };
    const updated = [...customTemplates, newTemplate];
    setCustomTemplates(updated);
    await AsyncStorage.setItem('admin_custom_templates', JSON.stringify(updated)).catch(() => {});
    setTemplateName('');
    setShowSaveTemplate(false);
    setSavingTemplate(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [templateName, hasMessage, titleFr, titleEn, messageFr, messageEn, targetType, targetValue, selectedRanks, accountAgeDays, matchCountMin, matchCountMax, inactiveDays, customTemplates]);

  const deleteCustomTemplate = useCallback(async (id: string) => {
    Haptics.selectionAsync();
    const updated = customTemplates.filter(t => t.id !== id);
    setCustomTemplates(updated);
    await AsyncStorage.setItem('admin_custom_templates', JSON.stringify(updated)).catch(() => {});
  }, [customTemplates]);

  const applyCustomTemplate = useCallback((tpl: CustomTemplate) => {
    Haptics.selectionAsync();
    setTitleFr(tpl.titleFr); setTitleEn(tpl.titleEn);
    setMessageFr(tpl.messageFr); setMessageEn(tpl.messageEn);
    setTargetType(tpl.targetType as TargetType);
    if (tpl.targetType === 'rank' && tpl.targetValue) setSelectedRanks(tpl.targetValue.split(',').filter(Boolean));
    else if (tpl.targetType === 'account_age' && tpl.targetValue) setAccountAgeDays(tpl.targetValue);
    else if (tpl.targetType === 'match_count' && tpl.targetValue) { const p = tpl.targetValue.split('-'); setMatchCountMin(p[0] || '0'); setMatchCountMax(p[1] || '5'); }
    else if (tpl.targetType === 'last_active' && tpl.targetValue) setInactiveDays(tpl.targetValue);
    else setTargetValue(tpl.targetValue || '');
    setShowTemplates(false);
  }, []);

  const handleResendWinner = useCallback(async (ann: Announcement, winner: 'A' | 'B') => {
    if (resendingId) return;
    setResendingId(ann.id);
    Haptics.selectionAsync();
    const result = await resendWinningVariant(ann, winner);
    if (result.error) showAlert(fr ? 'Erreur' : 'Error', result.error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(fr ? 'Gagnant renvoye' : 'Winner resent', fr ? `${result.pushSent || 0} envoyes` : `${result.pushSent || 0} sent`);
      await loadData();
    }
    setResendingId(null);
  }, [resendingId, fr, showAlert, loadData]);

  const loadData = useCallback(async () => {
    try {
      const [historyResult, citiesResult, clubsResult] = await Promise.all([
        getAnnouncementHistory(30),
        getTargetCities(),
        getTargetClubs(),
      ]);
      setHistory(historyResult.announcements);
      setCities(citiesResult);
      setClubs(clubsResult);
      adminCache.setCached('admin-announcements', { history: historyResult.announcements, cities: citiesResult, clubs: clubsResult }, 30000);
    } catch (e) {
      console.log('Error loading announcement data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = adminCache.getCached<any>('admin-announcements');
    if (cached) {
      setHistory(cached.history || []);
      setCities(cached.cities || []);
      setClubs(cached.clubs || []);
      setLoading(false);
      loadData(); // Background refresh
    } else {
      loadData();
    }
  }, [loadData]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  // Filtered picker items
  const filteredPickerItems = useMemo(() => {
    const search = valueSearch.toLowerCase().trim();
    if (targetType === 'city') {
      return cities.filter(c => !search || c.toLowerCase().includes(search));
    }
    if (targetType === 'club') {
      return clubs.filter(c => !search || c.name.toLowerCase().includes(search) || c.city.toLowerCase().includes(search));
    }
    return [];
  }, [targetType, cities, clubs, valueSearch]);

  // Load rank distribution when rank target selected
  useEffect(() => {
    if (targetType !== 'rank') return;
    setRankDistLoading(true);
    (async () => {
      try {
        const supabase = (await import('@/template')).getSupabaseClient();
        const { data: allPlayers } = await supabase.from('players').select('elo_rating');
        const dist: Record<string, number> = {};
        for (const rank of RANK_OPTIONS) dist[rank.id] = 0;
        for (const p of allPlayers || []) {
          const elo = p.elo_rating || 1000;
          for (const rank of RANK_OPTIONS) {
            if (elo >= rank.minElo && elo <= rank.maxElo) { dist[rank.id]++; break; }
          }
        }
        setRankDistribution(dist);
      } catch { /* silent */ }
      setRankDistLoading(false);
    })();
  }, [targetType]);

  // Load counts for advanced targeting
  useEffect(() => {
    if (targetType !== 'account_age' && targetType !== 'match_count' && targetType !== 'last_active') return;
    (async () => {
      try {
        const supabase = (await import('@/template')).getSupabaseClient();
        if (targetType === 'account_age') {
          const days = parseInt(accountAgeDays) || 7;
          const cutoff = new Date(Date.now() - days * 86400000).toISOString();
          const { count } = await supabase.from('user_profiles').select('id', { count: 'exact', head: true }).gte('created_at', cutoff);
          setAccountAgeCount(count || 0);
        } else if (targetType === 'match_count') {
          const { data: allPlayers } = await supabase.from('players').select('stats');
          const min = parseInt(matchCountMin) || 0;
          const max = parseInt(matchCountMax) || 999999;
          const matched = (allPlayers || []).filter((p: any) => {
            const mc = p.stats?.matchesPlayed || 0;
            return mc >= min && mc <= max;
          }).length;
          setMatchCountPlayerCount(matched);
        } else if (targetType === 'last_active') {
          const days = parseInt(inactiveDays) || 30;
          const cutoff = new Date(Date.now() - days * 86400000).toISOString();
          const { count: inactiveC } = await supabase.from('players').select('user_id', { count: 'exact', head: true }).lt('last_match_date', cutoff);
          const { count: noMatchC } = await supabase.from('players').select('user_id', { count: 'exact', head: true }).is('last_match_date', null);
          setInactiveCount((inactiveC || 0) + (noMatchC || 0));
        }
      } catch { /* silent */ }
    })();
  }, [targetType, accountAgeDays, matchCountMin, matchCountMax, inactiveDays]);

  // Duplicate announcement handler
  const handleDuplicate = useCallback((ann: Announcement) => {
    Haptics.selectionAsync();
    setTitleFr(ann.titleFr);
    setTitleEn(ann.titleEn);
    setMessageFr(ann.messageFr);
    setMessageEn(ann.messageEn);
    setTargetType(ann.targetType as TargetType);
    if (ann.targetType === 'rank' && ann.targetValue) {
      setSelectedRanks(ann.targetValue.split(',').filter(Boolean));
    } else if (ann.targetType === 'account_age' && ann.targetValue) {
      setAccountAgeDays(ann.targetValue);
    } else if (ann.targetType === 'match_count' && ann.targetValue) {
      const parts = ann.targetValue.split('-');
      setMatchCountMin(parts[0] || '0');
      setMatchCountMax(parts[1] || '5');
    } else if (ann.targetType === 'last_active' && ann.targetValue) {
      setInactiveDays(ann.targetValue);
    } else {
      setTargetValue(ann.targetValue || '');
    }
    setShowHistory(false);
  }, []);

  // Combined segmentation: load intersected count
  useEffect(() => {
    if (Object.keys(combinedFilters).length < 2) { setCombinedCount(0); return; }
    setCombinedCountLoading(true);
    (async () => {
      try {
        const supabase = (await import('@/template')).getSupabaseClient();
        const sets: Set<string>[] = [];
        for (const [cType, cValue] of Object.entries(combinedFilters)) {
          if (!cValue) continue;
          const cSet = new Set<string>();
          if (cType === 'account_age') {
            const days = parseInt(cValue) || 7;
            const cutoff = new Date(Date.now() - days * 86400000).toISOString();
            const { data } = await supabase.from('user_profiles').select('id').gte('created_at', cutoff);
            (data || []).forEach((u: any) => cSet.add(u.id));
          } else if (cType === 'match_count') {
            const parts = cValue.split('-');
            const min = parseInt(parts[0]) || 0;
            const max = parseInt(parts[1]) || 999999;
            const { data } = await supabase.from('players').select('user_id, stats');
            (data || []).forEach((p: any) => { const mc = p.stats?.matchesPlayed || 0; if (mc >= min && mc <= max) cSet.add(p.user_id); });
          } else if (cType === 'last_active') {
            const days = parseInt(cValue) || 30;
            const cutoff = new Date(Date.now() - days * 86400000).toISOString();
            const { data: ip } = await supabase.from('players').select('user_id').lt('last_match_date', cutoff);
            (ip || []).forEach((p: any) => cSet.add(p.user_id));
            const { data: nm } = await supabase.from('players').select('user_id').is('last_match_date', null);
            (nm || []).forEach((p: any) => cSet.add(p.user_id));
          } else if (cType === 'rank') {
            const rankRanges: Record<string, { min: number; max: number }> = { bronze: { min: 0, max: 1099 }, silver: { min: 1100, max: 1199 }, gold: { min: 1200, max: 1499 }, diamond: { min: 1500, max: 1799 }, master: { min: 1800, max: 1999 }, grand_master: { min: 2000, max: 99999 } };
            const ranks = cValue.split(',').filter(Boolean);
            for (const r of ranks) { const range = rankRanges[r]; if (range) { const { data } = await supabase.from('players').select('user_id').gte('elo_rating', range.min).lte('elo_rating', range.max); (data || []).forEach((p: any) => cSet.add(p.user_id)); } }
          }
          if (cSet.size > 0) sets.push(cSet);
        }
        if (sets.length >= 2) {
          let intersection = sets[0];
          for (let i = 1; i < sets.length; i++) intersection = new Set([...intersection].filter(uid => sets[i].has(uid)));
          setCombinedCount(intersection.size);
        } else if (sets.length === 1) {
          setCombinedCount(sets[0].size);
        }
      } catch { setCombinedCount(0); }
      setCombinedCountLoading(false);
    })();
  }, [combinedFilters]);

  // Retention campaign templates
  const RETENTION_CAMPAIGNS = useMemo(() => [
    {
      id: 'welcome', icon: 'waving-hand', color: '#0EA5E9',
      labelFr: 'Bienvenue', labelEn: 'Welcome',
      descFr: 'Cible les nouveaux inscrits < 7 jours sans matchs',
      descEn: 'Target new signups < 7 days with no matches',
      targetType: 'account_age' as TargetType, accountAge: '7',
      titleFr: 'Bienvenue sur Ultimate Petanque !', titleEn: 'Welcome to Ultimate Petanque!',
      messageFr: 'Commencez votre aventure ! Enregistrez votre premier match et decouvrez vos statistiques personnalisees.',
      messageEn: 'Start your adventure! Record your first match and discover your personalized stats.',
    },
    {
      id: 'reactivation', icon: 'refresh', color: '#6366F1',
      labelFr: 'Reactivation', labelEn: 'Reactivation',
      descFr: 'Cible les joueurs inactifs depuis 30+ jours',
      descEn: 'Target players inactive for 30+ days',
      targetType: 'last_active' as TargetType, inactiveDays: '30',
      titleFr: 'Vos boules vous manquent !', titleEn: 'Your boules miss you!',
      messageFr: 'Cela fait un moment que vous n\'avez pas joue. Votre classement ELO risque de baisser. Revenez et montrez votre talent !',
      messageEn: 'It has been a while since you last played. Your ELO ranking may decrease. Come back and show your talent!',
    },
    {
      id: 'encouragement', icon: 'trending-up', color: '#EC4899',
      labelFr: 'Encouragement', labelEn: 'Encouragement',
      descFr: 'Cible les joueurs avec 1-5 matchs (debutants)',
      descEn: 'Target players with 1-5 matches (beginners)',
      targetType: 'match_count' as TargetType, matchMin: '1', matchMax: '5',
      titleFr: 'Continuez comme ca !', titleEn: 'Keep it up!',
      messageFr: 'Vous avez fait vos premiers pas ! Jouez encore pour debloquer des badges et grimper dans le classement ELO.',
      messageEn: 'You have made your first steps! Play more to unlock badges and climb the ELO ranking.',
    },
    {
      id: 'combined', icon: 'tune', color: '#0F172A',
      labelFr: 'Combine (multi-criteres)', labelEn: 'Combined (multi-criteria)',
      descFr: 'Croisez compte + matchs + rang + inactivite simultanement',
      descEn: 'Cross account age + matches + rank + inactivity simultaneously',
      targetType: 'all' as TargetType,
      titleFr: '', titleEn: '', messageFr: '', messageEn: '',
    },
  ], []);

  const handleApplyRetentionCampaign = useCallback((campaign: any) => {
    Haptics.selectionAsync();
    if (campaign.id === 'combined') {
      setCombinedFilters({});
      setRetentionSegment('combined');
      setShowRetentionBuilder(false);
      return;
    }
    setTitleFr(campaign.titleFr);
    setTitleEn(campaign.titleEn);
    setMessageFr(campaign.messageFr);
    setMessageEn(campaign.messageEn);
    setTargetType(campaign.targetType);
    if (campaign.targetType === 'account_age') setAccountAgeDays(campaign.accountAge || '7');
    else if (campaign.targetType === 'last_active') setInactiveDays(campaign.inactiveDays || '30');
    else if (campaign.targetType === 'match_count') { setMatchCountMin(campaign.matchMin || '0'); setMatchCountMax(campaign.matchMax || '5'); }
    setShowRetentionBuilder(false);
    setRetentionSegment(campaign.id);
  }, []);

  const hasValidSchedule = useMemo(() => {
    if (!scheduleMode) return true;
    if (scheduleDate.length !== 10 || scheduleTime.length !== 5) return false;
    const schedMs = new Date(`${scheduleDate}T${scheduleTime}:00`).getTime();
    if (isNaN(schedMs)) return false;
    if (schedMs <= Date.now()) return false;
    return true;
  }, [scheduleMode, scheduleDate, scheduleTime]);
  const hasValidAB = !abTestMode || ((variantBTitleFr.trim() || variantBTitleEn.trim()) && (variantBMessageFr.trim() || variantBMessageEn.trim()));
  const hasCombinedTarget = retentionSegment === 'combined' && Object.keys(combinedFilters).length >= 2;
  const canSend = hasMessage && (hasTarget || hasCombinedTarget) && hasValidSchedule && hasValidAB && !submitting;

  // Computed analytics
  const analytics = useMemo(() => {
    if (history.length === 0) return null;
    const totalSent = history.filter(a => a.status === 'sent').length;
    const totalScheduled = history.filter(a => a.status === 'scheduled').length;
    const totalCancelled = history.filter(a => a.status === 'cancelled').length;
    const totalPushSent = history.reduce((s, a) => s + a.pushSentCount, 0);
    const totalPushErrors = history.reduce((s, a) => s + a.pushErrorCount, 0);
    const deliveryRate = totalPushSent > 0 ? Math.round(((totalPushSent - totalPushErrors) / totalPushSent) * 100) : 0;
    const avgPerAnnouncement = totalSent > 0 ? Math.round(totalPushSent / totalSent) : 0;
    // Target type breakdown
    const targetBreakdown: Record<string, number> = {};
    history.forEach(a => { targetBreakdown[a.targetType] = (targetBreakdown[a.targetType] || 0) + 1; });
    // Weekly send volume (last 4 weeks)
    const weeklyVolume: { week: string; count: number }[] = [];
    const now = Date.now();
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now - i * 7 * 86400000);
      const weekEnd = new Date(now - (i - 1) * 7 * 86400000);
      const label = weekStart.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
      const count = history.filter(a => {
        const d = new Date(a.createdAt).getTime();
        return d >= weekStart.getTime() && d < weekEnd.getTime() && a.status === 'sent';
      }).length;
      weeklyVolume.push({ week: label, count });
    }
    return { totalSent, totalScheduled, totalCancelled, totalPushSent, totalPushErrors, deliveryRate, avgPerAnnouncement, targetBreakdown, weeklyVolume };
  }, [history, fr]);

  // Scheduled announcements that are due
  const pendingScheduled = useMemo(() => {
    return history.filter(a => a.status === 'scheduled' && a.scheduledAt);
  }, [history]);

  const handleSend = useCallback(async () => {
    if (!canSend) return;

    const isCombinedMode = retentionSegment === 'combined' && Object.keys(combinedFilters).length >= 2;
    const effectiveTargetValue = isCombinedMode ? JSON.stringify(combinedFilters)
      : targetType === 'rank' ? selectedRanks.join(',')
      : targetType === 'account_age' ? accountAgeDays
      : targetType === 'match_count' ? `${matchCountMin}-${matchCountMax}`
      : targetType === 'last_active' ? inactiveDays
      : targetValue;
    const targetLabel = isCombinedMode
      ? `${fr ? 'combine' : 'combined'}: ${Object.keys(combinedFilters).join('+')} (${combinedCount})`
      : targetType === 'all'
      ? (fr ? 'tous les utilisateurs' : 'all users')
      : targetType === 'rank'
        ? `${fr ? 'rangs' : 'ranks'}: ${selectedRanks.map(r => RANK_OPTIONS.find(ro => ro.id === r)?.[fr ? 'labelFr' : 'labelEn'] || r).join(', ')}`
        : targetType === 'account_age'
          ? `${fr ? 'comptes < ' : 'accounts < '}${accountAgeDays}${fr ? ' jours' : ' days'} (${accountAgeCount})`
          : targetType === 'match_count'
            ? `${matchCountMin}-${matchCountMax} ${fr ? 'matchs' : 'matches'} (${matchCountPlayerCount})`
            : targetType === 'last_active'
              ? `${fr ? 'inactifs > ' : 'inactive > '}${inactiveDays}${fr ? 'j' : 'd'} (${inactiveCount})`
              : `${targetType}: ${targetValue}`;

    // Build scheduled_at if in schedule mode
    let scheduledAt: string | null = null;
    if (scheduleMode && scheduleDate && scheduleTime) {
      const parsedDate = new Date(`${scheduleDate}T${scheduleTime}:00`);
      if (isNaN(parsedDate.getTime()) || parsedDate.getTime() <= Date.now()) {
        showAlert(fr ? 'Erreur' : 'Error', fr ? 'La date de planification doit etre dans le futur et au format valide (AAAA-MM-JJ / HH:MM)' : 'Schedule date must be in the future and in valid format (YYYY-MM-DD / HH:MM)');
        return;
      }
      scheduledAt = parsedDate.toISOString();
    }

    const actionLabel = scheduledAt
      ? (fr ? `Planifier pour le ${scheduleDate} a ${scheduleTime}` : `Schedule for ${scheduleDate} at ${scheduleTime}`)
      : (fr ? `Push envoye a ${targetLabel}. Cette action est irreversible.` : `Push sent to ${targetLabel}. This action is irreversible.`);

    Alert.alert(
      scheduledAt ? (fr ? 'Planifier l\'annonce ?' : 'Schedule announcement?') : (fr ? 'Envoyer l\'annonce ?' : 'Send announcement?'),
      actionLabel,
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        {
          text: scheduledAt ? (fr ? 'Planifier' : 'Schedule') : (fr ? 'Envoyer' : 'Send'),
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            const result = await sendAnnouncement({
              titleFr: titleFr.trim() || titleEn.trim(),
              titleEn: titleEn.trim() || titleFr.trim(),
              messageFr: messageFr.trim() || messageEn.trim(),
              messageEn: messageEn.trim() || messageFr.trim(),
              targetType: isCombinedMode ? 'all' : targetType,
              targetValue: (isCombinedMode || targetType === 'all') ? undefined : effectiveTargetValue.trim(),
              adminName: user?.username || user?.email || 'Admin',
              scheduledAt,
              abTest: abTestMode,
              variantBTitleFr: variantBTitleFr.trim() || undefined,
              variantBTitleEn: variantBTitleEn.trim() || undefined,
              variantBMessageFr: variantBMessageFr.trim() || undefined,
              variantBMessageEn: variantBMessageEn.trim() || undefined,
              combinedFilters: isCombinedMode ? combinedFilters : undefined,
            });

            if (result.error) {
              showAlert(fr ? 'Erreur' : 'Error', result.error);
            } else {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              if (result.scheduled) {
                showAlert(
                  fr ? 'Annonce planifiee' : 'Announcement scheduled',
                  fr ? `Envoi prevu le ${scheduleDate} a ${scheduleTime}` : `Scheduled for ${scheduleDate} at ${scheduleTime}`
                );
              } else {
                showAlert(
                  fr ? 'Annonce envoyee' : 'Announcement sent',
                  fr
                    ? `${result.pushSent || 0} envoyes, ${result.pushErrors || 0} erreur(s)`
                    : `${result.pushSent || 0} sent, ${result.pushErrors || 0} error(s)`
                );
              }
              // Reset form
              setTitleFr('');
              setTitleEn('');
              setMessageFr('');
              setMessageEn('');
              setTargetType('all');
              setTargetValue('');
              setSelectedRanks([]);
              setScheduleMode(false);
              setScheduleDate('');
              setScheduleTime('');
              setAbTestMode(false);
              setVariantBTitleFr('');
              setVariantBTitleEn('');
              setVariantBMessageFr('');
              setVariantBMessageEn('');
              setCombinedFilters({});
              setRetentionSegment(null);
              await loadData();
            }
            setSubmitting(false);
          },
        },
      ]
    );
  }, [canSend, titleFr, titleEn, messageFr, messageEn, targetType, targetValue, fr, user, showAlert, loadData, scheduleMode, scheduleDate, scheduleTime]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(fr ? 'fr-FR' : 'en-US', {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

  const getTargetIcon = (type: string) => TARGET_OPTIONS.find(t => t.key === type)?.icon || 'public';
  const getTargetColor = (type: string) => TARGET_OPTIONS.find(t => t.key === type)?.color || '#10B981';

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Text style={s.headerTitle}>{fr ? 'Annonces' : 'Announcements'}</Text>
        </View>
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>{fr ? 'Annonces' : 'Announcements'}</Text>
      </View>

      <AdminQuickNav currentRoute="/admin-announcements" />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        {/* Stats summary */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <View style={s.statsRow}>
            <View style={s.statCard}>
              <Text style={s.statValue}>{history.length}</Text>
              <Text style={s.statLabel}>{fr ? 'Total' : 'Total'}</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statValue, { color: '#10B981' }]}>
                {history.reduce((sum, a) => sum + a.pushSentCount, 0)}
              </Text>
              <Text style={s.statLabel}>{fr ? 'Envoyes' : 'Sent'}</Text>
            </View>
            <View style={s.statCard}>
              <Text style={[s.statValue, { color: '#EF4444' }]}>
                {history.reduce((sum, a) => sum + a.pushErrorCount, 0)}
              </Text>
              <Text style={s.statLabel}>{fr ? 'Erreurs' : 'Errors'}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Form */}
        <Animated.View entering={FadeInDown.duration(300).delay(50)}>
          <View style={s.formCard}>
            <View style={s.formHeader}>
              <View style={[s.formHeaderIcon, { backgroundColor: '#7C3AED12' }]}>
                <MaterialIcons name="campaign" size={20} color="#7C3AED" />
              </View>
              <Text style={s.formHeaderTitle}>{fr ? 'Nouvelle annonce' : 'New announcement'}</Text>
            </View>

            {/* Retention Campaign Builder */}
            <View style={s.fieldWrap}>
              <Pressable style={[s.templateToggle, { marginBottom: 0 }]} onPress={() => { Haptics.selectionAsync(); setShowRetentionBuilder(!showRetentionBuilder); }}>
                <MaterialIcons name="campaign" size={16} color="#EC4899" />
                <Text style={[s.templateToggleText, { color: '#EC4899' }]}>{fr ? 'Campagne de retention' : 'Retention Campaign'}</Text>
                <MaterialIcons name={showRetentionBuilder ? 'expand-less' : 'expand-more'} size={18} color="#94A3B8" />
              </Pressable>
              {showRetentionBuilder ? (
                <View style={{ gap: 8, marginTop: 8, marginBottom: 12 }}>
                  {RETENTION_CAMPAIGNS.map((c: any) => (
                    <Pressable
                      key={c.id}
                      style={[{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#E2E8F0' }, retentionSegment === c.id && { borderColor: c.color, borderWidth: 2 }]}
                      onPress={() => handleApplyRetentionCampaign(c)}
                    >
                      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: c.color + '12', alignItems: 'center' as const, justifyContent: 'center' as const }}>
                        <MaterialIcons name={c.icon as any} size={18} color={c.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700' as const, color: c.color }}>{fr ? c.labelFr : c.labelEn}</Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2, lineHeight: 14 }}>{fr ? c.descFr : c.descEn}</Text>
                      </View>
                      <MaterialIcons name="arrow-forward" size={14} color={c.color} />
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>

            {/* Templates */}
            <View style={s.fieldWrap}>
              <Pressable style={s.templateToggle} onPress={() => { Haptics.selectionAsync(); setShowTemplates(!showTemplates); }}>
                <MaterialIcons name="auto-awesome" size={16} color="#7C3AED" />
                <Text style={s.templateToggleText}>{fr ? 'Modeles' : 'Templates'}</Text>
                <MaterialIcons name={showTemplates ? 'expand-less' : 'expand-more'} size={18} color="#94A3B8" />
              </Pressable>
              {showTemplates ? (
                <>
                <View style={s.templateGrid}>
                  {ANNOUNCEMENT_TEMPLATES.map(tpl => (
                    <Pressable
                      key={tpl.id}
                      style={[s.templateCard, { borderColor: tpl.color + '30' }]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setTitleFr(tpl.titleFr);
                        setTitleEn(tpl.titleEn);
                        setMessageFr(tpl.messageFr);
                        setMessageEn(tpl.messageEn);
                        setTargetType(tpl.targetType);
                        setShowTemplates(false);
                      }}
                    >
                      <View style={[s.templateIcon, { backgroundColor: tpl.color + '12' }]}>
                        <MaterialIcons name={tpl.icon as any} size={16} color={tpl.color} />
                      </View>
                      <Text style={s.templateLabel} numberOfLines={1}>{fr ? tpl.labelFr : tpl.labelEn}</Text>
                    </Pressable>
                  ))}
                </View>
                {/* Custom saved templates */}
                {customTemplates.length > 0 ? (
                  <View style={{ marginTop: 10, gap: 6 }}>
                    <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 4 }}>
                      <MaterialIcons name="bookmark" size={14} color="#0EA5E9" />
                      <Text style={{ fontSize: 12, fontWeight: '700' as const, color: '#0EA5E9' }}>{fr ? 'Mes modeles' : 'My Templates'}</Text>
                      <View style={{ backgroundColor: '#0EA5E915', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 9, fontWeight: '800' as const, color: '#0EA5E9' }}>{customTemplates.length}</Text>
                      </View>
                    </View>
                    {customTemplates.map(ct => (
                      <View key={ct.id} style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: '#F0F9FF', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#BAE6FD' }}>
                        <Pressable style={{ flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 }} onPress={() => applyCustomTemplate(ct)}>
                          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#0EA5E912', alignItems: 'center' as const, justifyContent: 'center' as const }}>
                            <MaterialIcons name="bookmark" size={14} color="#0EA5E9" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 12, fontWeight: '700' as const, color: '#0F172A' }} numberOfLines={1}>{ct.name}</Text>
                            <Text style={{ fontSize: 9, color: '#94A3B8', marginTop: 1 }} numberOfLines={1}>{ct.titleFr || ct.titleEn} | {ct.targetType}</Text>
                          </View>
                        </Pressable>
                        <Pressable onPress={() => deleteCustomTemplate(ct.id)} hitSlop={8}>
                          <MaterialIcons name="close" size={16} color="#94A3B8" />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
                </>
              ) : null}
            </View>

            {/* Target selector */}
            <View style={s.fieldWrap}>
              <View style={s.fieldLabel}>
                <MaterialIcons name="people" size={16} color="#64748B" />
                <Text style={s.fieldLabelText}>{fr ? 'Destinataires' : 'Recipients'}</Text>
              </View>
              <View style={s.targetGrid}>
                {TARGET_OPTIONS.map(opt => {
                  const isActive = targetType === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      style={[s.targetChip, isActive && { backgroundColor: opt.color, borderColor: opt.color }]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        setTargetType(opt.key);
                        setTargetValue('');
                        setShowValuePicker(opt.key !== 'all');
                      }}
                    >
                      <MaterialIcons name={opt.icon as any} size={14} color={isActive ? '#FFF' : '#64748B'} />
                      <Text style={[s.targetChipText, isActive && { color: '#FFF' }]}>
                        {fr ? opt.labelFr : opt.labelEn}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Target value selector */}
              {/* Advanced targeting: Account Age */}
              {targetType === 'account_age' ? (
                <View style={s.levelGrid}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <MaterialIcons name="info-outline" size={14} color="#0EA5E9" />
                    <Text style={{ fontSize: 11, color: '#64748B', flex: 1 }}>
                      {fr ? 'Cible les comptes crees dans les N derniers jours' : 'Target accounts created within the last N days'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {['3', '7', '14', '30'].map(d => {
                      const isActive = accountAgeDays === d;
                      return (
                        <Pressable
                          key={d}
                          style={[s.levelChip, isActive && { backgroundColor: '#0EA5E9', borderColor: '#0EA5E9' }]}
                          onPress={() => { Haptics.selectionAsync(); setAccountAgeDays(d); }}
                        >
                          <Text style={[s.levelChipText, isActive && { color: '#FFF' }]}>{d}{fr ? 'j' : 'd'}</Text>
                        </Pressable>
                      );
                    })}
                    <View style={[s.levelChip, { borderColor: '#0EA5E930' }]}>
                      <TextInput
                        style={{ fontSize: 12, fontWeight: '600', color: '#0F172A', width: 40, textAlign: 'center', padding: 0 }}
                        value={accountAgeDays}
                        onChangeText={setAccountAgeDays}
                        keyboardType="number-pad"
                        maxLength={3}
                        placeholder="N"
                        placeholderTextColor="#CBD5E1"
                      />
                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>{fr ? 'jours' : 'days'}</Text>
                    </View>
                  </View>
                  <View style={s.rankPreviewInfo}>
                    <MaterialIcons name="people" size={12} color="#0EA5E9" />
                    <Text style={[s.rankPreviewText, { color: '#0EA5E9' }]}>
                      {accountAgeCount} {fr ? 'utilisateur(s) cible(s)' : 'user(s) targeted'}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Advanced targeting: Match Count */}
              {targetType === 'match_count' ? (
                <View style={s.levelGrid}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <MaterialIcons name="info-outline" size={14} color="#EC4899" />
                    <Text style={{ fontSize: 11, color: '#64748B', flex: 1 }}>
                      {fr ? 'Cible les joueurs avec N a M matchs joues' : 'Target players with N to M matches played'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    {[{ label: '0', min: '0', max: '0' }, { label: '1-5', min: '1', max: '5' }, { label: '6-20', min: '6', max: '20' }, { label: '21-50', min: '21', max: '50' }, { label: '50+', min: '50', max: '999999' }].map(preset => {
                      const isActive = matchCountMin === preset.min && matchCountMax === preset.max;
                      return (
                        <Pressable
                          key={preset.label}
                          style={[s.levelChip, isActive && { backgroundColor: '#EC4899', borderColor: '#EC4899' }]}
                          onPress={() => { Haptics.selectionAsync(); setMatchCountMin(preset.min); setMatchCountMax(preset.max); }}
                        >
                          <Text style={[s.levelChipText, isActive && { color: '#FFF' }]}>{preset.label}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[s.levelChip, { borderColor: '#EC489930' }]}>
                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>Min</Text>
                      <TextInput
                        style={{ fontSize: 12, fontWeight: '600', color: '#0F172A', width: 36, textAlign: 'center', padding: 0 }}
                        value={matchCountMin}
                        onChangeText={setMatchCountMin}
                        keyboardType="number-pad"
                        maxLength={5}
                      />
                    </View>
                    <Text style={{ fontSize: 12, color: '#94A3B8' }}>-</Text>
                    <View style={[s.levelChip, { borderColor: '#EC489930' }]}>
                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>Max</Text>
                      <TextInput
                        style={{ fontSize: 12, fontWeight: '600', color: '#0F172A', width: 36, textAlign: 'center', padding: 0 }}
                        value={matchCountMax}
                        onChangeText={setMatchCountMax}
                        keyboardType="number-pad"
                        maxLength={6}
                      />
                    </View>
                  </View>
                  <View style={[s.rankPreviewInfo, { marginTop: 6 }]}>
                    <MaterialIcons name="people" size={12} color="#EC4899" />
                    <Text style={[s.rankPreviewText, { color: '#EC4899' }]}>
                      {matchCountPlayerCount} {fr ? 'joueur(s) cible(s)' : 'player(s) targeted'}
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Advanced targeting: Last Active */}
              {targetType === 'last_active' ? (
                <View style={s.levelGrid}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <MaterialIcons name="info-outline" size={14} color="#6366F1" />
                    <Text style={{ fontSize: 11, color: '#64748B', flex: 1 }}>
                      {fr ? 'Cible les joueurs inactifs depuis N+ jours (campagne de retention)' : 'Target players inactive for N+ days (retention campaign)'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    {['7', '14', '30', '60', '90'].map(d => {
                      const isActive = inactiveDays === d;
                      return (
                        <Pressable
                          key={d}
                          style={[s.levelChip, isActive && { backgroundColor: '#6366F1', borderColor: '#6366F1' }]}
                          onPress={() => { Haptics.selectionAsync(); setInactiveDays(d); }}
                        >
                          <Text style={[s.levelChipText, isActive && { color: '#FFF' }]}>{d}{fr ? 'j' : 'd'}</Text>
                        </Pressable>
                      );
                    })}
                    <View style={[s.levelChip, { borderColor: '#6366F130' }]}>
                      <TextInput
                        style={{ fontSize: 12, fontWeight: '600', color: '#0F172A', width: 40, textAlign: 'center', padding: 0 }}
                        value={inactiveDays}
                        onChangeText={setInactiveDays}
                        keyboardType="number-pad"
                        maxLength={3}
                        placeholder="N"
                        placeholderTextColor="#CBD5E1"
                      />
                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>{fr ? 'jours' : 'days'}</Text>
                    </View>
                  </View>
                  <View style={[s.rankPreviewInfo, { marginTop: 6 }]}>
                    <MaterialIcons name="people" size={12} color="#6366F1" />
                    <Text style={[s.rankPreviewText, { color: '#6366F1' }]}>
                      {inactiveCount} {fr ? 'joueur(s) cible(s)' : 'player(s) targeted'}
                    </Text>
                  </View>
                </View>
              ) : null}

              {targetType === 'rank' ? (
                <View style={s.levelGrid}>
                  {RANK_OPTIONS.map(rank => {
                    const isActive = selectedRanks.includes(rank.id);
                    const playerCount = rankDistribution[rank.id] || 0;
                    return (
                      <Pressable
                        key={rank.id}
                        style={[s.levelChip, isActive && { backgroundColor: rank.color, borderColor: rank.color }]}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedRanks(prev =>
                            prev.includes(rank.id) ? prev.filter(r => r !== rank.id) : [...prev, rank.id]
                          );
                        }}
                      >
                        <MaterialIcons name={rank.icon as any} size={14} color={isActive ? '#FFF' : rank.color} />
                        <Text style={[s.levelChipText, isActive && { color: '#FFF' }]}>
                          {fr ? rank.labelFr : rank.labelEn}
                        </Text>
                        {!rankDistLoading ? (
                          <View style={[s.rankCountBadge, isActive && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                            <Text style={[s.rankCountText, isActive && { color: '#FFF' }]}>{playerCount}</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                  {/* Rank distribution preview */}
                  {!rankDistLoading && Object.values(rankDistribution).some(v => v > 0) ? (
                    <View style={s.rankPreviewWrap}>
                      <View style={s.rankPreviewBar}>
                        {RANK_OPTIONS.map(rank => {
                          const total = Object.values(rankDistribution).reduce((a, b) => a + b, 0) || 1;
                          const pct = Math.max(2, (rankDistribution[rank.id] || 0) / total * 100);
                          const isSelected = selectedRanks.includes(rank.id);
                          return (
                            <View key={rank.id} style={[s.rankPreviewSegment, { width: `${pct}%`, backgroundColor: isSelected ? rank.color : rank.color + '30' }]} />
                          );
                        })}
                      </View>
                      <View style={s.rankPreviewInfo}>
                        <MaterialIcons name="people" size={12} color="#64748B" />
                        <Text style={s.rankPreviewText}>
                          {selectedRanks.length > 0
                            ? `${selectedRanks.reduce((s, r) => s + (rankDistribution[r] || 0), 0)} ${fr ? 'joueur(s) cible(s)' : 'player(s) targeted'}`
                            : `${Object.values(rankDistribution).reduce((a, b) => a + b, 0)} ${fr ? 'joueurs au total' : 'total players'}`}
                        </Text>
                      </View>
                    </View>
                  ) : rankDistLoading ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                      <ActivityIndicator size="small" color="#D97706" />
                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>{fr ? 'Chargement...' : 'Loading...'}</Text>
                    </View>
                  ) : null}
                  {selectedRanks.length > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <MaterialIcons name="info-outline" size={12} color="#94A3B8" />
                      <Text style={{ fontSize: 10, color: '#94A3B8' }}>
                        {fr ? 'Filtre' : 'Filter'}: {selectedRanks.map(r => {
                          const ro = RANK_OPTIONS.find(o => o.id === r);
                          return ro ? `${ro.minElo}-${ro.maxElo === 99999 ? '+' : ro.maxElo}` : '';
                        }).join(', ')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {(targetType === 'city' || targetType === 'club') ? (
                <View style={s.valuePickerWrap}>
                  <View style={s.valueSearchRow}>
                    <MaterialIcons name="search" size={18} color="#94A3B8" />
                    <TextInput
                      style={s.valueSearchInput}
                      value={targetValue || valueSearch}
                      onChangeText={(text) => {
                        setValueSearch(text);
                        setTargetValue(text);
                        setShowValuePicker(true);
                      }}
                      placeholder={targetType === 'city' ? (fr ? 'Rechercher une ville...' : 'Search city...') : (fr ? 'Rechercher un club...' : 'Search club...')}
                      placeholderTextColor="#94A3B8"
                    />
                    {targetValue ? (
                      <Pressable onPress={() => { setTargetValue(''); setValueSearch(''); setShowValuePicker(true); }}>
                        <MaterialIcons name="close" size={18} color="#94A3B8" />
                      </Pressable>
                    ) : null}
                  </View>
                  {showValuePicker && filteredPickerItems.length > 0 ? (
                    <View style={s.valueList}>
                      {(targetType === 'city' ? filteredPickerItems as string[] : []).slice(0, 8).map((city: string) => (
                        <Pressable
                          key={city}
                          style={[s.valueItem, targetValue === city && s.valueItemActive]}
                          onPress={() => { Haptics.selectionAsync(); setTargetValue(city); setShowValuePicker(false); }}
                        >
                          <MaterialIcons name="location-city" size={14} color={targetValue === city ? '#2563EB' : '#94A3B8'} />
                          <Text style={[s.valueItemText, targetValue === city && { color: '#2563EB', fontWeight: '700' }]}>{city}</Text>
                        </Pressable>
                      ))}
                      {targetType === 'club' ? (filteredPickerItems as { id: string; name: string; city: string }[]).slice(0, 8).map((cl) => (
                        <Pressable
                          key={cl.id}
                          style={[s.valueItem, targetValue === cl.name && s.valueItemActive]}
                          onPress={() => { Haptics.selectionAsync(); setTargetValue(cl.name); setShowValuePicker(false); }}
                        >
                          <MaterialIcons name="home" size={14} color={targetValue === cl.name ? '#7C3AED' : '#94A3B8'} />
                          <View style={{ flex: 1 }}>
                            <Text style={[s.valueItemText, targetValue === cl.name && { color: '#7C3AED', fontWeight: '700' }]}>{cl.name}</Text>
                            <Text style={s.valueItemSub}>{cl.city}</Text>
                          </View>
                        </Pressable>
                      )) : null}
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Selected target badge */}
              {targetType === 'rank' && selectedRanks.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {selectedRanks.map(r => {
                    const rank = RANK_OPTIONS.find(ro => ro.id === r);
                    if (!rank) return null;
                    return (
                      <View key={r} style={[s.selectedBadge, { backgroundColor: rank.color + '12', borderColor: rank.color + '30' }]}>
                        <MaterialIcons name={rank.icon as any} size={12} color={rank.color} />
                        <Text style={[s.selectedBadgeText, { color: rank.color }]}>{fr ? rank.labelFr : rank.labelEn}</Text>
                        <Pressable onPress={() => setSelectedRanks(prev => prev.filter(x => x !== r))} hitSlop={8}>
                          <MaterialIcons name="close" size={12} color={rank.color} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}
              {targetType !== 'all' && targetType !== 'rank' && targetValue ? (
                <View style={[s.selectedBadge, { backgroundColor: getTargetColor(targetType) + '12', borderColor: getTargetColor(targetType) + '30' }]}>
                  <MaterialIcons name={getTargetIcon(targetType) as any} size={14} color={getTargetColor(targetType)} />
                  <Text style={[s.selectedBadgeText, { color: getTargetColor(targetType) }]}>{targetValue}</Text>
                  <Pressable onPress={() => { setTargetValue(''); setShowValuePicker(true); }} hitSlop={8}>
                    <MaterialIcons name="close" size={14} color={getTargetColor(targetType)} />
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* Combined Segmentation UI */}
            {retentionSegment === 'combined' ? (
              <View style={[s.fieldWrap, { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#0F172A20' }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <MaterialIcons name="tune" size={16} color="#0F172A" />
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A', flex: 1 }}>{fr ? 'Filtres combines (intersection)' : 'Combined Filters (intersection)'}</Text>
                  {combinedCountLoading ? <ActivityIndicator size="small" color="#3B82F6" /> : (
                    <View style={{ backgroundColor: combinedCount > 0 ? '#DCFCE7' : '#FEF2F2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: combinedCount > 0 ? '#10B981' : '#EF4444' }}>{combinedCount} {fr ? 'cibles' : 'targeted'}</Text>
                    </View>
                  )}
                </View>
                {[{ key: 'account_age', label: fr ? 'Comptes < N jours' : 'Accounts < N days', color: '#0EA5E9', presets: ['7', '14', '30'] },
                  { key: 'match_count', label: fr ? 'Nombre de matchs' : 'Match count', color: '#EC4899', presets: [{ l: '0', v: '0-0' }, { l: '1-5', v: '1-5' }, { l: '6-20', v: '6-20' }] },
                  { key: 'rank', label: fr ? 'Rang ELO' : 'ELO Rank', color: '#D97706', presets: [] },
                  { key: 'last_active', label: fr ? 'Inactifs > N jours' : 'Inactive > N days', color: '#6366F1', presets: ['14', '30', '60'] },
                ].map(filter => (
                  <View key={filter.key} style={{ marginBottom: 10 }}>
                    <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }} onPress={() => { Haptics.selectionAsync(); setCombinedFilters(prev => { const n = { ...prev }; if (n[filter.key]) delete n[filter.key]; else n[filter.key] = filter.key === 'match_count' ? '0-0' : filter.key === 'rank' ? 'bronze' : filter.key === 'account_age' ? '14' : '30'; return n; }); }}>
                      <MaterialIcons name={combinedFilters[filter.key] ? 'check-box' : 'check-box-outline-blank'} size={18} color={combinedFilters[filter.key] ? filter.color : '#CBD5E1'} />
                      <Text style={{ fontSize: 12, fontWeight: '600', color: combinedFilters[filter.key] ? filter.color : '#64748B' }}>{filter.label}</Text>
                    </Pressable>
                    {combinedFilters[filter.key] && filter.key !== 'rank' ? (
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginLeft: 24 }}>
                        {(filter.presets as any[]).map((p: any) => {
                          const val = typeof p === 'string' ? p : p.v;
                          const label = typeof p === 'string' ? `${p}${fr ? 'j' : 'd'}` : p.l;
                          const isActive = combinedFilters[filter.key] === val;
                          return <Pressable key={val} style={[s.levelChip, isActive && { backgroundColor: filter.color, borderColor: filter.color }]} onPress={() => setCombinedFilters(prev => ({ ...prev, [filter.key]: val }))}><Text style={[s.levelChipText, isActive && { color: '#FFF' }]}>{label}</Text></Pressable>;
                        })}
                      </View>
                    ) : null}
                    {combinedFilters[filter.key] && filter.key === 'rank' ? (
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginLeft: 24 }}>
                        {RANK_OPTIONS.map(r => { const active = (combinedFilters.rank || '').split(',').includes(r.id); return <Pressable key={r.id} style={[s.levelChip, active && { backgroundColor: r.color, borderColor: r.color }]} onPress={() => setCombinedFilters(p => { const ranks = (p.rank || '').split(',').filter(Boolean); const next = active ? ranks.filter(x => x !== r.id) : [...ranks, r.id]; return { ...p, rank: next.join(',') || 'bronze' }; })}><Text style={[s.levelChipText, active && { color: '#FFF' }]}>{fr ? r.labelFr : r.labelEn}</Text></Pressable>; })}
                      </View>
                    ) : null}
                  </View>
                ))}
                {Object.keys(combinedFilters).length >= 2 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
                    <MaterialIcons name="info-outline" size={12} color="#3B82F6" />
                    <Text style={{ fontSize: 10, color: '#3B82F6', flex: 1 }}>{fr ? 'Les criteres sont croises (ET). Seuls les utilisateurs correspondant a TOUS les filtres seront cibles.' : 'Criteria are intersected (AND). Only users matching ALL filters will be targeted.'}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* A/B Testing Toggle */}
            <View style={s.fieldWrap}>
              <Pressable style={s.templateToggle} onPress={() => { Haptics.selectionAsync(); setAbTestMode(!abTestMode); }}>
                <MaterialIcons name="science" size={16} color={abTestMode ? '#7C3AED' : '#64748B'} />
                <Text style={[s.templateToggleText, { color: abTestMode ? '#7C3AED' : '#64748B' }]}>A/B Test</Text>
                <MaterialIcons name={abTestMode ? 'toggle-on' : 'toggle-off'} size={24} color={abTestMode ? '#7C3AED' : '#CBD5E1'} />
              </Pressable>
              {abTestMode ? (
                <View style={{ gap: 10, marginTop: 8, backgroundColor: '#7C3AED08', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#7C3AED20' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 10, fontWeight: '900', color: '#FFF' }}>B</Text>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#7C3AED' }}>{fr ? 'Variante B (50% des destinataires)' : 'Variant B (50% of recipients)'}</Text>
                  </View>
                  <TextInput style={[s.textInput, { minHeight: 40 }]} placeholder={fr ? 'Titre variante B (FR)...' : 'Variant B title (FR)...'} placeholderTextColor="#94A3B8" value={variantBTitleFr} onChangeText={setVariantBTitleFr} maxLength={80} />
                  <TextInput style={[s.textInput, { minHeight: 40 }]} placeholder="Variant B title (EN)..." placeholderTextColor="#94A3B8" value={variantBTitleEn} onChangeText={setVariantBTitleEn} maxLength={80} />
                  <TextInput style={s.textInput} placeholder={fr ? 'Message variante B (FR)...' : 'Variant B message (FR)...'} placeholderTextColor="#94A3B8" value={variantBMessageFr} onChangeText={setVariantBMessageFr} multiline numberOfLines={2} maxLength={300} />
                  <TextInput style={s.textInput} placeholder="Variant B message (EN)..." placeholderTextColor="#94A3B8" value={variantBMessageEn} onChangeText={setVariantBMessageEn} multiline numberOfLines={2} maxLength={300} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#EDE9FE', borderRadius: 8, padding: 8 }}>
                    <MaterialIcons name="info-outline" size={12} color="#7C3AED" />
                    <Text style={{ fontSize: 10, color: '#7C3AED', flex: 1 }}>{fr ? 'Groupe A recoit le message principal, groupe B cette variante. Distribution 50/50.' : 'Group A gets main message, group B this variant. 50/50 split.'}</Text>
                  </View>
                </View>
              ) : null}
            </View>

            {/* Scheduling */}
            <View style={s.fieldWrap}>
              <Pressable style={s.templateToggle} onPress={() => { Haptics.selectionAsync(); setScheduleMode(!scheduleMode); }}>
                <MaterialIcons name="schedule" size={16} color={scheduleMode ? '#10B981' : '#64748B'} />
                <Text style={[s.templateToggleText, { color: scheduleMode ? '#10B981' : '#64748B' }]}>{fr ? 'Planifier l\'envoi' : 'Schedule send'}</Text>
                <MaterialIcons name={scheduleMode ? 'toggle-on' : 'toggle-off'} size={24} color={scheduleMode ? '#10B981' : '#CBD5E1'} />
              </Pressable>
              {scheduleMode ? (
                <View style={{ marginTop: 8, gap: 8 }}>
                  {/* Quick date presets */}
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8', marginBottom: 6 }}>{fr ? 'Date rapide' : 'Quick date'}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {(() => {
                        const presets = [];
                        for (let i = 1; i <= 7; i++) {
                          const d = new Date();
                          d.setDate(d.getDate() + i);
                          const iso = d.toISOString().slice(0, 10);
                          const dayName = d.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { weekday: 'short', day: 'numeric', month: 'short' });
                          if (i <= 3 || i === 7) presets.push({ iso, label: i === 1 ? (fr ? 'Demain' : 'Tomorrow') : i === 7 ? (fr ? 'Dans 1 sem.' : 'In 1 week') : dayName });
                        }
                        return presets.map(p => {
                          const isActive = scheduleDate === p.iso;
                          return (
                            <Pressable
                              key={p.iso}
                              style={[{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: isActive ? '#10B981' : '#F8FAFC', borderWidth: 1.5, borderColor: isActive ? '#10B981' : '#E2E8F0' }]}
                              onPress={() => { Haptics.selectionAsync(); setScheduleDate(p.iso); }}
                            >
                              <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? '#FFF' : '#0F172A' }}>{p.label}</Text>
                            </Pressable>
                          );
                        });
                      })()}
                    </View>
                    {/* Manual date input fallback */}
                    <View style={[s.scheduleInputWrap, { marginTop: 6 }]}>
                      <MaterialIcons name="calendar-today" size={14} color={scheduleDate ? '#10B981' : '#CBD5E1'} />
                      <TextInput
                        style={s.scheduleInput}
                        value={scheduleDate}
                        onChangeText={setScheduleDate}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#CBD5E1"
                        maxLength={10}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>

                  {/* Quick time presets */}
                  <View>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8', marginBottom: 6 }}>{fr ? 'Heure rapide' : 'Quick time'}</Text>
                    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                      {['08:00', '10:00', '12:00', '14:00', '17:00', '19:00', '20:30'].map(t => {
                        const isActive = scheduleTime === t;
                        return (
                          <Pressable
                            key={t}
                            style={[{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: isActive ? '#10B981' : '#F8FAFC', borderWidth: 1.5, borderColor: isActive ? '#10B981' : '#E2E8F0' }]}
                            onPress={() => { Haptics.selectionAsync(); setScheduleTime(t); }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: isActive ? '#FFF' : '#0F172A' }}>{t}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    {/* Manual time input fallback */}
                    <View style={[s.scheduleInputWrap, { marginTop: 6 }]}>
                      <MaterialIcons name="access-time" size={14} color={scheduleTime ? '#10B981' : '#CBD5E1'} />
                      <TextInput
                        style={s.scheduleInput}
                        value={scheduleTime}
                        onChangeText={setScheduleTime}
                        placeholder="HH:MM"
                        placeholderTextColor="#CBD5E1"
                        maxLength={5}
                        keyboardType="numbers-and-punctuation"
                      />
                    </View>
                  </View>

                  {/* Smart Scheduler */}
                  <Pressable
                    style={[{ flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#0EA5E908', borderWidth: 1, borderColor: '#0EA5E920' }, smartScheduleLoading && { opacity: 0.5 }]}
                    onPress={async () => {
                      if (smartScheduleLoading) return;
                      setSmartScheduleLoading(true);
                      Haptics.selectionAsync();
                      try {
                        const supabase = (await import('@/template')).getSupabaseClient();
                        const { data: annData } = await supabase.from('announcements').select('created_at, push_sent_count, push_error_count').eq('status', 'sent').order('created_at', { ascending: false }).limit(100);
                        const hourScores = new Map<number, { sent: number; errors: number; count: number }>();
                        for (let h = 0; h < 24; h++) hourScores.set(h, { sent: 0, errors: 0, count: 0 });
                        (annData || []).forEach((a: any) => {
                          const hour = new Date(a.created_at).getHours();
                          const entry = hourScores.get(hour)!;
                          entry.sent += (a.push_sent_count || 0);
                          entry.errors += (a.push_error_count || 0);
                          entry.count++;
                        });
                        const scored = Array.from(hourScores.entries()).map(([hour, d]) => {
                          const deliveryRate = d.sent > 0 ? ((d.sent - d.errors) / d.sent) * 100 : 50;
                          const volumeScore = Math.min(100, d.sent / Math.max(1, (annData || []).reduce((s: number, a: any) => s + (a.push_sent_count || 0), 0) / 24) * 100);
                          const score = Math.round(deliveryRate * 0.6 + volumeScore * 0.2 + (d.count > 0 ? 20 : 0));
                          return { hour, score };
                        }).sort((a, b) => b.score - a.score);
                        setSmartSlots(scored.slice(0, 5));
                        setShowSmartSlots(true);
                        if (scored.length > 0) {
                          const best = scored[0];
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          setScheduleDate(tomorrow.toISOString().slice(0, 10));
                          setScheduleTime(`${String(best.hour).padStart(2, '0')}:00`);
                        }
                      } catch (e) { console.log('[SmartSchedule] Error:', e); }
                      setSmartScheduleLoading(false);
                    }}
                    disabled={smartScheduleLoading}
                  >
                    {smartScheduleLoading ? <ActivityIndicator size="small" color="#0EA5E9" /> : <MaterialIcons name="tips-and-updates" size={14} color="#0EA5E9" />}
                    <Text style={{ fontSize: 12, fontWeight: '700' as const, color: '#0EA5E9' }}>{fr ? 'Recommander creneau optimal' : 'Recommend optimal slot'}</Text>
                  </Pressable>
                  {showSmartSlots && smartSlots.length > 0 ? (
                    <View style={{ backgroundColor: '#F0F9FF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#BAE6FD' }}>
                      <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 8 }}>
                        <MaterialIcons name="auto-awesome" size={14} color="#0EA5E9" />
                        <Text style={{ fontSize: 11, fontWeight: '700' as const, color: '#0EA5E9' }}>{fr ? 'Creneaux optimaux (base sur l\'historique)' : 'Optimal slots (based on history)'}</Text>
                      </View>
                      <View style={{ flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6 }}>
                        {smartSlots.map((slot, idx) => {
                          const isSelected = scheduleTime === `${String(slot.hour).padStart(2, '0')}:00`;
                          const scoreColor = slot.score >= 80 ? '#10B981' : slot.score >= 60 ? '#3B82F6' : '#D97706';
                          return (
                            <Pressable
                              key={slot.hour}
                              style={[{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: isSelected ? scoreColor : '#FFF', borderWidth: 1.5, borderColor: isSelected ? scoreColor : '#E2E8F0' }]}
                              onPress={() => {
                                Haptics.selectionAsync();
                                const tomorrow = new Date();
                                tomorrow.setDate(tomorrow.getDate() + 1);
                                setScheduleDate(tomorrow.toISOString().slice(0, 10));
                                setScheduleTime(`${String(slot.hour).padStart(2, '0')}:00`);
                              }}
                            >
                              {idx === 0 ? <MaterialIcons name="star" size={12} color={isSelected ? '#FFF' : '#F59E0B'} /> : null}
                              <Text style={{ fontSize: 12, fontWeight: '700' as const, color: isSelected ? '#FFF' : '#0F172A' }}>{slot.hour}h</Text>
                              <View style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.25)' : scoreColor + '15', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                                <Text style={{ fontSize: 8, fontWeight: '800' as const, color: isSelected ? '#FFF' : scoreColor }}>{slot.score}</Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </View>
                      <Text style={{ fontSize: 9, color: '#64748B', marginTop: 6, lineHeight: 13 }}>
                        {fr ? 'Score base sur le taux de livraison, le volume et la frequence des envois passes a cette heure.' : 'Score based on delivery rate, volume and frequency of past sends at this hour.'}
                      </Text>
                    </View>
                  ) : null}

                  {/* Schedule countdown preview */}
                  {scheduleDate.length === 10 && scheduleTime.length === 5 ? (() => {
                    const schedMs = new Date(`${scheduleDate}T${scheduleTime}:00`).getTime();
                    const nowMs = Date.now();
                    if (isNaN(schedMs)) return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}><MaterialIcons name="error-outline" size={12} color="#EF4444" /><Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '600' }}>{fr ? 'Format de date invalide' : 'Invalid date format'}</Text></View>;
                    if (schedMs <= nowMs) return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, backgroundColor: '#FEF2F2', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}><MaterialIcons name="error-outline" size={12} color="#EF4444" /><Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '600' }}>{fr ? 'La date doit etre dans le futur' : 'Date must be in the future'}</Text></View>;
                    const diffH = Math.round((schedMs - nowMs) / 3600000);
                    const diffD = Math.floor(diffH / 24);
                    const remaining = diffD > 0 ? `${diffD}${fr ? 'j' : 'd'} ${diffH % 24}h` : `${diffH}h`;
                    return (
                      <View style={s.schedulePreview}>
                        <MaterialIcons name="timer" size={12} color="#10B981" />
                        <Text style={s.schedulePreviewText}>{fr ? `Envoi dans ${remaining}` : `Sending in ${remaining}`}</Text>
                      </View>
                    );
                  })() : null}
                </View>
              ) : null}
            </View>

            {/* Title FR */}
            <View style={s.fieldWrap}>
              <View style={s.fieldLabel}>
                <Text style={s.fieldLabelFlag}>{"\u{1F1EB}\u{1F1F7}"}</Text>
                <Text style={s.fieldLabelText}>{fr ? 'Titre (FR)' : 'Title (FR)'}</Text>
              </View>
              <TextInput
                style={[s.textInput, { minHeight: 44 }]}
                placeholder={fr ? 'Titre de l\'annonce...' : 'Announcement title...'}
                placeholderTextColor="#94A3B8"
                value={titleFr}
                onChangeText={setTitleFr}
                maxLength={80}
              />
              <Text style={s.charCount}>{titleFr.length}/80</Text>
            </View>

            {/* Title EN */}
            <View style={s.fieldWrap}>
              <View style={s.fieldLabel}>
                <Text style={s.fieldLabelFlag}>{"\u{1F1EC}\u{1F1E7}"}</Text>
                <Text style={s.fieldLabelText}>{fr ? 'Titre (EN)' : 'Title (EN)'}</Text>
              </View>
              <TextInput
                style={[s.textInput, { minHeight: 44 }]}
                placeholder="Announcement title..."
                placeholderTextColor="#94A3B8"
                value={titleEn}
                onChangeText={setTitleEn}
                maxLength={80}
              />
              <Text style={s.charCount}>{titleEn.length}/80</Text>
            </View>

            {/* Message FR */}
            <View style={s.fieldWrap}>
              <View style={s.fieldLabel}>
                <Text style={s.fieldLabelFlag}>{"\u{1F1EB}\u{1F1F7}"}</Text>
                <Text style={s.fieldLabelText}>{fr ? 'Message (FR)' : 'Message (FR)'}</Text>
              </View>
              <TextInput
                style={s.textInput}
                placeholder={fr ? 'Contenu de l\'annonce...' : 'Announcement content...'}
                placeholderTextColor="#94A3B8"
                value={messageFr}
                onChangeText={setMessageFr}
                multiline
                numberOfLines={3}
                maxLength={300}
              />
              <Text style={s.charCount}>{messageFr.length}/300</Text>
            </View>

            {/* Message EN */}
            <View style={s.fieldWrap}>
              <View style={s.fieldLabel}>
                <Text style={s.fieldLabelFlag}>{"\u{1F1EC}\u{1F1E7}"}</Text>
                <Text style={s.fieldLabelText}>{fr ? 'Message (EN)' : 'Message (EN)'}</Text>
              </View>
              <TextInput
                style={s.textInput}
                placeholder="Announcement content..."
                placeholderTextColor="#94A3B8"
                value={messageEn}
                onChangeText={setMessageEn}
                multiline
                numberOfLines={3}
                maxLength={300}
              />
              <Text style={s.charCount}>{messageEn.length}/300</Text>
            </View>
          </View>
        </Animated.View>

        {/* Preview */}
        <Animated.View entering={FadeInDown.duration(300).delay(100)}>
          <View style={s.previewSection}>
            <View style={[s.formHeader, { marginBottom: 12 }]}>
              <View style={[s.formHeaderIcon, { backgroundColor: '#0EA5E912' }]}>
                <MaterialIcons name="preview" size={20} color="#0EA5E9" />
              </View>
              <Text style={[s.formHeaderTitle, { flex: 1 }]}>{fr ? 'Apercu du push' : 'Push preview'}</Text>
              {/* Platform toggle */}
              <View style={{ flexDirection: 'row' as const, backgroundColor: '#F1F5F9', borderRadius: 10, padding: 3 }}>
                <Pressable
                  style={[{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }, previewPlatform === 'ios' && { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 }]}
                  onPress={() => { Haptics.selectionAsync(); setPreviewPlatform('ios'); }}
                >
                  <MaterialIcons name="phone-iphone" size={14} color={previewPlatform === 'ios' ? '#0F172A' : '#94A3B8'} />
                  <Text style={{ fontSize: 11, fontWeight: '700' as const, color: previewPlatform === 'ios' ? '#0F172A' : '#94A3B8' }}>iOS</Text>
                </Pressable>
                <Pressable
                  style={[{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }, previewPlatform === 'android' && { backgroundColor: '#FFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 1 }]}
                  onPress={() => { Haptics.selectionAsync(); setPreviewPlatform('android'); }}
                >
                  <MaterialIcons name="phone-android" size={14} color={previewPlatform === 'android' ? '#3DDC84' : '#94A3B8'} />
                  <Text style={{ fontSize: 11, fontWeight: '700' as const, color: previewPlatform === 'android' ? '#3DDC84' : '#94A3B8' }}>Android</Text>
                </Pressable>
              </View>
            </View>

            {/* iOS Preview */}
            {previewPlatform === 'ios' ? (
              <View style={s.previewFrame}>
                <View style={s.previewStatusBar}>
                  <Text style={s.previewTime}>9:41</Text>
                  <View style={s.previewNotch} />
                  <View style={s.previewBattery} />
                </View>
                {hasMessage ? (
                  <View style={s.previewNotif}>
                    <View style={s.previewNotifHeader}>
                      <View style={s.previewAppIcon}>
                        <MaterialIcons name="sports-baseball" size={12} color="#FFF" />
                      </View>
                      <Text style={s.previewAppName}>ULTIMATE PETANQUE</Text>
                      <Text style={s.previewNotifTime}>{fr ? 'maintenant' : 'now'}</Text>
                    </View>
                    <Text style={s.previewNotifTitle} numberOfLines={1}>
                      {(fr ? titleFr : titleEn) || titleFr || titleEn || (fr ? 'Titre...' : 'Title...')}
                    </Text>
                    <Text style={s.previewNotifBody} numberOfLines={2}>
                      {(fr ? messageFr : messageEn) || messageFr || messageEn || (fr ? 'Message...' : 'Message...')}
                    </Text>
                    {targetType !== 'all' && targetValue ? (
                      <View style={s.previewTargetRow}>
                        <MaterialIcons name={getTargetIcon(targetType) as any} size={10} color="#94A3B8" />
                        <Text style={s.previewTargetText}>{targetValue}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={s.previewEmpty}>
                    <MaterialIcons name="visibility-off" size={20} color="#64748B" />
                    <Text style={s.previewEmptyText}>{fr ? 'Saisissez titre et message' : 'Enter title and message'}</Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row' as const, justifyContent: 'center' as const, paddingVertical: 12 }}>
                  <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#334155' }} />
                </View>
              </View>
            ) : null}

            {/* Android Preview */}
            {previewPlatform === 'android' ? (
              <View style={{ backgroundColor: '#1A1C1E', borderRadius: 18, overflow: 'hidden' as const, borderWidth: 3, borderColor: '#2C2E30' }}>
                {/* Android status bar */}
                <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'flex-end' as const, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4, gap: 4 }}>
                  <MaterialIcons name="signal-cellular-alt" size={12} color="#A0A0A0" />
                  <MaterialIcons name="wifi" size={12} color="#A0A0A0" />
                  <Text style={{ fontSize: 10, fontWeight: '500' as const, color: '#A0A0A0' }}>85%</Text>
                  <View style={{ width: 18, height: 9, borderRadius: 2, borderWidth: 1, borderColor: '#A0A0A0', justifyContent: 'center' as const, paddingHorizontal: 1 }}>
                    <View style={{ width: '85%' as any, height: 5, borderRadius: 1, backgroundColor: '#A0A0A0' }} />
                  </View>
                </View>
                {hasMessage ? (
                  <View style={{ marginHorizontal: 8, marginTop: 6, backgroundColor: '#2C2E30', borderRadius: 16, padding: 14 }}>
                    <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 8 }}>
                      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#3B82F6', alignItems: 'center' as const, justifyContent: 'center' as const }}>
                        <MaterialIcons name="sports-baseball" size={11} color="#FFF" />
                      </View>
                      <Text style={{ fontSize: 11, fontWeight: '600' as const, color: '#E0E0E0', flex: 1 }}>Ultimate Petanque</Text>
                      <Text style={{ fontSize: 10, color: '#808080' }}>{fr ? 'maintenant' : 'now'}</Text>
                      <MaterialIcons name="expand-more" size={16} color="#808080" />
                    </View>
                    <Text style={{ fontSize: 13, fontWeight: '700' as const, color: '#F5F5F5', marginBottom: 4 }} numberOfLines={1}>
                      {(fr ? titleFr : titleEn) || titleFr || titleEn || (fr ? 'Titre...' : 'Title...')}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#BDBDBD', lineHeight: 17 }} numberOfLines={3}>
                      {(fr ? messageFr : messageEn) || messageFr || messageEn || (fr ? 'Message...' : 'Message...')}
                    </Text>
                    {targetType !== 'all' && targetValue ? (
                      <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#3A3C3E' }}>
                        <MaterialIcons name={getTargetIcon(targetType) as any} size={10} color="#808080" />
                        <Text style={{ fontSize: 10, color: '#808080', fontWeight: '500' as const }}>{targetValue}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <View style={s.previewEmpty}>
                    <MaterialIcons name="visibility-off" size={20} color="#64748B" />
                    <Text style={s.previewEmptyText}>{fr ? 'Saisissez titre et message' : 'Enter title and message'}</Text>
                  </View>
                )}
                {/* Android nav bar hint */}
                <View style={{ flexDirection: 'row' as const, justifyContent: 'center' as const, paddingVertical: 10, gap: 28 }}>
                  <View style={{ width: 16, height: 16, borderWidth: 1.5, borderColor: '#505050', borderRadius: 2 }} />
                  <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#505050' }} />
                  <View style={{ width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderBottomWidth: 14, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#505050' }} />
                </View>
              </View>
            ) : null}

            {/* A/B Variant B Preview */}
            {abTestMode && hasMessage && (variantBTitleFr.trim() || variantBTitleEn.trim()) ? (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 8 }}>
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#7C3AED', alignItems: 'center' as const, justifyContent: 'center' as const }}>
                    <Text style={{ fontSize: 10, fontWeight: '900' as const, color: '#FFF' }}>B</Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700' as const, color: '#7C3AED' }}>{fr ? 'Variante B' : 'Variant B'}</Text>
                </View>
                <View style={[previewPlatform === 'ios' ? s.previewFrame : { backgroundColor: '#1A1C1E', borderRadius: 18, overflow: 'hidden' as const, borderWidth: 3, borderColor: '#2C2E30' }]}>
                  <View style={{ marginHorizontal: 8, marginVertical: 8, backgroundColor: previewPlatform === 'ios' ? '#1E293B' : '#2C2E30', borderRadius: 16, padding: 12 }}>
                    <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 6 }}>
                      <View style={{ width: 20, height: 20, borderRadius: previewPlatform === 'ios' ? 5 : 10, backgroundColor: '#7C3AED', alignItems: 'center' as const, justifyContent: 'center' as const }}>
                        <MaterialIcons name="sports-baseball" size={10} color="#FFF" />
                      </View>
                      <Text style={{ fontSize: 9, fontWeight: '700' as const, color: '#94A3B8', flex: 1, textTransform: 'uppercase' as const, letterSpacing: 0.5 }}>Ultimate Petanque</Text>
                      <View style={{ backgroundColor: '#7C3AED20', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
                        <Text style={{ fontSize: 7, fontWeight: '800' as const, color: '#7C3AED' }}>B</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, fontWeight: '700' as const, color: '#F8FAFC', marginBottom: 3 }} numberOfLines={1}>
                      {(fr ? variantBTitleFr : variantBTitleEn) || variantBTitleFr || variantBTitleEn}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#CBD5E1', lineHeight: 15 }} numberOfLines={2}>
                      {(fr ? variantBMessageFr : variantBMessageEn) || variantBMessageFr || variantBMessageEn}
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </Animated.View>

        {/* Pending scheduled announcements */}
        {pendingScheduled.length > 0 ? (
          <Animated.View entering={FadeInDown.duration(300).delay(120)}>
            <View style={s.scheduledSection}>
              <View style={s.scheduledHeader}>
                <MaterialIcons name="schedule" size={16} color="#10B981" />
                <Text style={s.scheduledTitle}>{fr ? 'Annonces planifiees' : 'Scheduled'} ({pendingScheduled.length})</Text>
              </View>
              {pendingScheduled.map(ann => {
                const schedDate = ann.scheduledAt ? new Date(ann.scheduledAt) : null;
                const diffMs = schedDate ? schedDate.getTime() - Date.now() : 0;
                const isPast = diffMs <= 0;
                return (
                  <View key={ann.id} style={s.scheduledCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.scheduledCardTitle} numberOfLines={1}>{fr ? ann.titleFr : ann.titleEn}</Text>
                      <Text style={s.scheduledCardDate}>
                        {schedDate ? schedDate.toLocaleString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}
                        {isPast ? ` (${fr ? 'en retard' : 'overdue'})` : ''}
                      </Text>
                    </View>
                    <Pressable
                      style={[s.scheduledActionBtn, { backgroundColor: '#10B981' }]}
                      onPress={async () => {
                        Haptics.selectionAsync();
                        const res = await sendScheduledAnnouncementNow(ann);
                        if (res.error) showAlert('Error', res.error);
                        else {
                          showAlert(fr ? 'Envoye' : 'Sent', `${res.pushSent || 0} sent`);
                          await loadData();
                        }
                      }}
                    >
                      <MaterialIcons name="send" size={12} color="#FFF" />
                    </Pressable>
                    <Pressable
                      style={[s.scheduledActionBtn, { backgroundColor: '#EF4444' }]}
                      onPress={async () => {
                        Haptics.selectionAsync();
                        const { error: err } = await cancelScheduledAnnouncement(ann.id);
                        if (err) showAlert('Error', err);
                        else { showAlert(fr ? 'Annule' : 'Cancelled'); await loadData(); }
                      }}
                    >
                      <MaterialIcons name="close" size={12} color="#FFF" />
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </Animated.View>
        ) : null}

        {/* Save as template */}
        {hasMessage ? (
          <Animated.View entering={FadeInDown.duration(300).delay(140)}>
            {!showSaveTemplate ? (
              <Pressable
                style={{ flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 10, marginBottom: 8, borderRadius: 12, backgroundColor: '#0EA5E908', borderWidth: 1, borderColor: '#0EA5E920' }}
                onPress={() => { Haptics.selectionAsync(); setShowSaveTemplate(true); }}
              >
                <MaterialIcons name="bookmark-add" size={16} color="#0EA5E9" />
                <Text style={{ fontSize: 12, fontWeight: '700' as const, color: '#0EA5E9' }}>{fr ? 'Sauvegarder comme modele' : 'Save as template'}</Text>
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 8, backgroundColor: '#FFF', borderRadius: 12, padding: 10, borderWidth: 1.5, borderColor: '#0EA5E930' }}>
                <TextInput
                  style={{ flex: 1, fontSize: 13, color: '#0F172A', paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#F8FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' }}
                  placeholder={fr ? 'Nom du modele...' : 'Template name...'}
                  placeholderTextColor="#CBD5E1"
                  value={templateName}
                  onChangeText={setTemplateName}
                  maxLength={40}
                />
                <Pressable
                  style={[{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: templateName.trim() ? '#0EA5E9' : '#E2E8F0' }, savingTemplate && { opacity: 0.5 }]}
                  onPress={saveCustomTemplate}
                  disabled={!templateName.trim() || savingTemplate}
                >
                  {savingTemplate ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="check" size={16} color={templateName.trim() ? '#FFF' : '#94A3B8'} />}
                </Pressable>
                <Pressable onPress={() => { setShowSaveTemplate(false); setTemplateName(''); }} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color="#94A3B8" />
                </Pressable>
              </View>
            )}
          </Animated.View>
        ) : null}

        {/* Send button */}
        <Animated.View entering={FadeInDown.duration(300).delay(150)}>
          <Pressable
            style={({ pressed }) => [s.sendBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }, !canSend && s.sendBtnDisabled, scheduleMode && canSend && { backgroundColor: '#10B981' }]}
            onPress={handleSend}
            disabled={!canSend}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <MaterialIcons name={scheduleMode ? 'schedule-send' : 'send'} size={20} color="#FFF" />
                <Text style={s.sendBtnText}>{scheduleMode ? (fr ? 'Planifier l\'annonce' : 'Schedule announcement') : (fr ? 'Envoyer l\'annonce' : 'Send announcement')}</Text>
              </>
            )}
          </Pressable>
        </Animated.View>

        {/* Analytics */}
        {analytics ? (
          <Animated.View entering={FadeIn.duration(300).delay(180)}>
            <Pressable
              style={s.historyToggle}
              onPress={() => { setShowAnalytics(!showAnalytics); Haptics.selectionAsync(); }}
            >
              <View style={[s.formHeaderIcon, { backgroundColor: '#0EA5E912' }]}>
                <MaterialIcons name="analytics" size={20} color="#0EA5E9" />
              </View>
              <Text style={[s.formHeaderTitle, { flex: 1 }]}>
                {fr ? 'Analytiques' : 'Analytics'}
              </Text>
              <MaterialIcons name={showAnalytics ? 'expand-less' : 'expand-more'} size={22} color="#94A3B8" />
            </Pressable>
          </Animated.View>
        ) : null}

        {showAnalytics && analytics ? (
          <View style={s.analyticsSection}>
            {/* KPI Row */}
            <View style={s.analyticsKpiRow}>
              <View style={s.analyticsKpi}>
                <Text style={[s.analyticsKpiValue, { color: '#3B82F6' }]}>{analytics.totalSent}</Text>
                <Text style={s.analyticsKpiLabel}>{fr ? 'Envoyees' : 'Sent'}</Text>
              </View>
              <View style={s.analyticsKpi}>
                <Text style={[s.analyticsKpiValue, { color: '#10B981' }]}>{analytics.totalScheduled}</Text>
                <Text style={s.analyticsKpiLabel}>{fr ? 'Planifiees' : 'Scheduled'}</Text>
              </View>
              <View style={s.analyticsKpi}>
                <Text style={[s.analyticsKpiValue, { color: analytics.deliveryRate >= 90 ? '#10B981' : analytics.deliveryRate >= 70 ? '#D97706' : '#EF4444' }]}>{analytics.deliveryRate}%</Text>
                <Text style={s.analyticsKpiLabel}>{fr ? 'Livraison' : 'Delivery'}</Text>
              </View>
              <View style={s.analyticsKpi}>
                <Text style={[s.analyticsKpiValue, { color: '#7C3AED' }]}>{analytics.avgPerAnnouncement}</Text>
                <Text style={s.analyticsKpiLabel}>{fr ? 'Moy/annonce' : 'Avg/announce'}</Text>
              </View>
            </View>

            {/* Delivery stats */}
            <View style={s.analyticsDeliveryRow}>
              <View style={s.analyticsDeliveryItem}>
                <MaterialIcons name="check-circle" size={14} color="#10B981" />
                <Text style={[s.analyticsDeliveryText, { color: '#10B981' }]}>{analytics.totalPushSent - analytics.totalPushErrors} {fr ? 'livres' : 'delivered'}</Text>
              </View>
              <View style={s.analyticsDeliveryItem}>
                <MaterialIcons name="error" size={14} color="#EF4444" />
                <Text style={[s.analyticsDeliveryText, { color: '#EF4444' }]}>{analytics.totalPushErrors} {fr ? 'echecs' : 'failed'}</Text>
              </View>
              {analytics.totalCancelled > 0 ? (
                <View style={s.analyticsDeliveryItem}>
                  <MaterialIcons name="cancel" size={14} color="#94A3B8" />
                  <Text style={[s.analyticsDeliveryText, { color: '#94A3B8' }]}>{analytics.totalCancelled} {fr ? 'annulees' : 'cancelled'}</Text>
                </View>
              ) : null}
            </View>

            {/* Target breakdown */}
            {Object.keys(analytics.targetBreakdown).length > 0 ? (
              <View style={s.analyticsBreakdown}>
                <Text style={s.analyticsBreakdownTitle}>{fr ? 'Par type de cible' : 'By target type'}</Text>
                <View style={s.analyticsBreakdownBar}>
                  {Object.entries(analytics.targetBreakdown).map(([type, count]) => {
                    const total = Object.values(analytics.targetBreakdown).reduce((a, b) => a + b, 0) || 1;
                    const pct = Math.max(4, (count / total) * 100);
                    const colors: Record<string, string> = { all: '#10B981', city: '#2563EB', club: '#7C3AED', rank: '#D97706', level: '#94A3B8' };
                    return <View key={type} style={{ width: `${pct}%`, height: 8, backgroundColor: colors[type] || '#94A3B8', borderRadius: 4 }} />;
                  })}
                </View>
                <View style={s.analyticsBreakdownLegend}>
                  {Object.entries(analytics.targetBreakdown).map(([type, count]) => {
                    const colors: Record<string, string> = { all: '#10B981', city: '#2563EB', club: '#7C3AED', rank: '#D97706', level: '#94A3B8' };
                    const labels: Record<string, string> = { all: fr ? 'Tous' : 'All', city: fr ? 'Ville' : 'City', club: 'Club', rank: fr ? 'Rang' : 'Rank', level: fr ? 'Niveau' : 'Level' };
                    return (
                      <View key={type} style={s.analyticsLegendItem}>
                        <View style={[s.analyticsLegendDot, { backgroundColor: colors[type] || '#94A3B8' }]} />
                        <Text style={s.analyticsLegendText}>{labels[type] || type} ({count})</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* A/B Test Dashboard Link */}
            {history.some(a => a.abData?.variantB) ? (
              <Pressable
                style={{ flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: '#7C3AED08', borderWidth: 1, borderColor: '#7C3AED20', marginBottom: 12 }}
                onPress={() => { Haptics.selectionAsync(); router.push('/admin-ab-tests' as any); }}
              >
                <MaterialIcons name="science" size={16} color="#7C3AED" />
                <Text style={{ fontSize: 13, fontWeight: '700' as const, color: '#7C3AED' }}>{fr ? 'Voir le dashboard A/B complet' : 'View full A/B dashboard'}</Text>
                <MaterialIcons name="arrow-forward" size={14} color="#7C3AED" />
              </Pressable>
            ) : null}

            {/* A/B Test Results */}
            {(() => {
              const abAnnouncements = history.filter(a => a.abData?.variantB);
              if (abAnnouncements.length === 0) return null;
              return (
                <View style={s.analyticsBreakdown}>
                  <Text style={s.analyticsBreakdownTitle}>A/B TEST {fr ? 'RESULTATS' : 'RESULTS'}</Text>
                  {abAnnouncements.slice(0, 3).map(ann => {
                    const ab = ann.abData!;
                    const aRate = (ab.variantASent || 0) > 0 ? Math.round(((ab.variantASent! - (ab.variantAErrors || 0)) / ab.variantASent!) * 100) : 0;
                    const bRate = (ab.variantBSent || 0) > 0 ? Math.round(((ab.variantBSent! - (ab.variantBErrors || 0)) / ab.variantBSent!) * 100) : 0;
                    const winner = aRate > bRate ? 'A' : bRate > aRate ? 'B' : '-';
                    return (
                      <View key={ann.id} style={{ marginBottom: 10, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#0F172A', marginBottom: 6 }} numberOfLines={1}>{fr ? ann.titleFr : ann.titleEn}</Text>
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <View style={{ flex: 1, alignItems: 'center', backgroundColor: winner === 'A' ? '#DCFCE7' : '#FFF', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: winner === 'A' ? '#10B981' : '#E2E8F0' }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B' }}>A</Text>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: winner === 'A' ? '#10B981' : '#0F172A' }}>{aRate}%</Text>
                            <Text style={{ fontSize: 8, color: '#94A3B8' }}>{ab.variantASent || 0} {fr ? 'env.' : 'sent'}</Text>
                          </View>
                          <View style={{ justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 10, fontWeight: '800', color: '#94A3B8' }}>vs</Text></View>
                          <View style={{ flex: 1, alignItems: 'center', backgroundColor: winner === 'B' ? '#DCFCE7' : '#FFF', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: winner === 'B' ? '#10B981' : '#E2E8F0' }}>
                            <Text style={{ fontSize: 9, fontWeight: '700', color: '#64748B' }}>B</Text>
                            <Text style={{ fontSize: 16, fontWeight: '800', color: winner === 'B' ? '#10B981' : '#0F172A' }}>{bRate}%</Text>
                            <Text style={{ fontSize: 8, color: '#94A3B8' }}>{ab.variantBSent || 0} {fr ? 'env.' : 'sent'}</Text>
                          </View>
                        </View>
                        {winner !== '-' ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 6 }}>
                            <MaterialIcons name="emoji-events" size={12} color="#10B981" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981' }}>{fr ? 'Gagnant' : 'Winner'}: {fr ? 'Variante' : 'Variant'} {winner} (+{Math.abs(aRate - bRate)}pts)</Text>
                          </View>
                        ) : null}
                      </View>
                    );
                  })}
                </View>
              );
            })()}

            {/* Weekly volume */}
            {analytics.weeklyVolume.some(w => w.count > 0) ? (
              <View style={s.analyticsWeekly}>
                <Text style={s.analyticsBreakdownTitle}>{fr ? 'Volume hebdomadaire' : 'Weekly volume'}</Text>
                {(() => {
                  const maxW = Math.max(...analytics.weeklyVolume.map(w => w.count), 1);
                  return analytics.weeklyVolume.map((w, idx) => (
                    <View key={idx} style={s.analyticsWeeklyRow}>
                      <Text style={s.analyticsWeeklyLabel}>{w.week}</Text>
                      <View style={s.analyticsWeeklyBarBg}>
                        <View style={[s.analyticsWeeklyBarFill, { width: `${Math.max(3, (w.count / maxW) * 100)}%` }]} />
                      </View>
                      <Text style={s.analyticsWeeklyValue}>{w.count}</Text>
                    </View>
                  ));
                })()}
              </View>
            ) : null}
          </View>
        ) : null}

        {/* History */}
        <Animated.View entering={FadeIn.duration(300).delay(200)}>
          <Pressable
            style={s.historyToggle}
            onPress={() => { setShowHistory(!showHistory); Haptics.selectionAsync(); }}
          >
            <View style={[s.formHeaderIcon, { backgroundColor: '#64748B12' }]}>
              <MaterialIcons name="history" size={20} color="#64748B" />
            </View>
            <Text style={[s.formHeaderTitle, { flex: 1 }]}>
              {fr ? 'Historique' : 'History'} ({history.length})
            </Text>
            <MaterialIcons name={showHistory ? 'expand-less' : 'expand-more'} size={22} color="#94A3B8" />
          </Pressable>
        </Animated.View>

        {showHistory ? (
          <View style={s.historyList}>
            {history.length === 0 ? (
              <View style={s.historyEmpty}>
                <MaterialIcons name="campaign" size={32} color="#CBD5E1" />
                <Text style={s.historyEmptyText}>{fr ? 'Aucune annonce' : 'No announcements yet'}</Text>
              </View>
            ) : (
              history.map((ann, idx) => {
                const tColor = getTargetColor(ann.targetType);
                const statusColor = ann.status === 'scheduled' ? '#10B981' : ann.status === 'cancelled' ? '#94A3B8' : tColor;
                const deliveryPct = ann.pushSentCount > 0 ? Math.round(((ann.pushSentCount - ann.pushErrorCount) / ann.pushSentCount) * 100) : 0;
                return (
                  <Animated.View key={ann.id} entering={FadeInDown.duration(200).delay(idx * 30)}>
                    <View style={[s.historyCard, { borderLeftColor: statusColor }]}>
                      {/* Status indicator for non-sent */}
                      {ann.status !== 'sent' ? (
                        <View style={[s.historyStatusBadge, { backgroundColor: ann.status === 'scheduled' ? '#DCFCE7' : '#F1F5F9' }]}>
                          <MaterialIcons name={ann.status === 'scheduled' ? 'schedule' : 'cancel'} size={10} color={ann.status === 'scheduled' ? '#10B981' : '#94A3B8'} />
                          <Text style={[s.historyStatusText, { color: ann.status === 'scheduled' ? '#10B981' : '#94A3B8' }]}>
                            {ann.status === 'scheduled' ? (fr ? 'Planifie' : 'Scheduled') : (fr ? 'Annule' : 'Cancelled')}
                            {ann.scheduledAt ? ` · ${new Date(ann.scheduledAt).toLocaleString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
                          </Text>
                        </View>
                      ) : null}
                      <View style={s.historyCardHeader}>
                        <View style={[s.historyIconBg, { backgroundColor: tColor + '12' }]}>
                          <MaterialIcons name={getTargetIcon(ann.targetType) as any} size={16} color={tColor} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.historyTitle} numberOfLines={1}>
                            {(fr ? ann.titleFr : ann.titleEn) || ann.titleFr}
                          </Text>
                          <Text style={s.historyDate}>{formatDate(ann.createdAt)}</Text>
                        </View>
                        <View style={s.historyPushBadge}>
                          <MaterialIcons name="notifications" size={10} color={theme.primary} />
                          <Text style={s.historyPushText}>{ann.pushSentCount}</Text>
                          {ann.pushErrorCount > 0 ? (
                            <Text style={s.historyPushError}>/{ann.pushErrorCount}err</Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={s.historyMessage}>
                        <View style={s.historyMsgRow}>
                          <Text style={s.historyMsgFlag}>{"\u{1F1EB}\u{1F1F7}"}</Text>
                          <Text style={s.historyMsgText} numberOfLines={2}>{ann.messageFr}</Text>
                        </View>
                        {ann.messageEn !== ann.messageFr ? (
                          <View style={s.historyMsgRow}>
                            <Text style={s.historyMsgFlag}>{"\u{1F1EC}\u{1F1E7}"}</Text>
                            <Text style={s.historyMsgText} numberOfLines={2}>{ann.messageEn}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={s.historyFooter}>
                        <View style={[s.historyTargetBadge, { backgroundColor: tColor + '12' }]}>
                          <MaterialIcons name={getTargetIcon(ann.targetType) as any} size={11} color={tColor} />
                          <Text style={[s.historyTargetText, { color: tColor }]}>
                            {ann.targetType === 'all' ? (fr ? 'Tous' : 'All') : ann.targetValue || ann.targetType}
                          </Text>
                        </View>
                        {ann.status === 'sent' && ann.pushSentCount > 0 ? (
                          <View style={[s.historyDeliveryBadge, { backgroundColor: deliveryPct >= 90 ? '#DCFCE7' : deliveryPct >= 70 ? '#FEF3C7' : '#FEF2F2' }]}>
                            <Text style={[s.historyDeliveryText, { color: deliveryPct >= 90 ? '#10B981' : deliveryPct >= 70 ? '#D97706' : '#EF4444' }]}>{deliveryPct}%</Text>
                          </View>
                        ) : null}
                        <Text style={s.historyAdmin}>{ann.adminName || 'Admin'}</Text>
                        {ann.abData?.variantB ? (
                          <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, backgroundColor: ann.abData.winner ? '#10B98110' : '#7C3AED10', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }}>
                            <MaterialIcons name={ann.abData.winner ? 'emoji-events' : 'science'} size={10} color={ann.abData.winner ? '#10B981' : '#7C3AED'} />
                            <Text style={{ fontSize: 8, fontWeight: '700' as const, color: ann.abData.winner ? '#10B981' : '#7C3AED' }}>{ann.abData.winner ? `${fr ? 'Gagnant' : 'Winner'}: ${ann.abData.winner}` : 'A/B'}</Text>
                          </View>
                        ) : null}
                        {/* A/B Winner Actions */}
                        {ann.abData?.variantB && ann.abData.winner && !ann.abData.resent ? (
                          <Pressable
                            style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, backgroundColor: '#10B98110', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
                            onPress={() => handleResendWinner(ann, ann.abData!.winner!)}
                            disabled={resendingId === ann.id}
                          >
                            {resendingId === ann.id ? <ActivityIndicator size={10} color="#10B981" /> : <MaterialIcons name="send" size={10} color="#10B981" />}
                            <Text style={{ fontSize: 8, fontWeight: '700' as const, color: '#10B981' }}>{fr ? 'Renvoyer gagnant' : 'Resend winner'}</Text>
                          </Pressable>
                        ) : null}
                        {ann.abData?.resent ? (
                          <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, backgroundColor: '#DCFCE7', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }}>
                            <MaterialIcons name="check-circle" size={10} color="#10B981" />
                            <Text style={{ fontSize: 8, fontWeight: '700' as const, color: '#10B981' }}>{fr ? 'Renvoye' : 'Resent'} ({ann.abData.resentSent || 0})</Text>
                          </View>
                        ) : null}
                        {ann.estimatedOpens > 0 ? (
                          <View style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, backgroundColor: '#10B98110', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }}>
                            <MaterialIcons name="visibility" size={10} color="#10B981" />
                            <Text style={{ fontSize: 8, fontWeight: '700' as const, color: '#10B981' }}>{ann.estimatedOpens} {fr ? 'vues' : 'opens'}</Text>
                          </View>
                        ) : null}
                        <Pressable
                          style={{ flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, backgroundColor: '#3B82F610', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
                          onPress={() => handleDuplicate(ann)}
                          hitSlop={8}
                        >
                          <MaterialIcons name="content-copy" size={12} color="#3B82F6" />
                          <Text style={{ fontSize: 9, fontWeight: '700' as const, color: '#3B82F6' }}>{fr ? 'Dupliquer' : 'Duplicate'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  </Animated.View>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
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

  // Stats
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  statLabel: { fontSize: 11, color: '#94A3B8', fontWeight: '600', marginTop: 2 },

  // Form
  formCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4, elevation: 1 },
  formHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  formHeaderIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  formHeaderTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', letterSpacing: -0.2 },

  // Fields
  fieldWrap: { marginBottom: 16 },
  fieldLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  fieldLabelFlag: { fontSize: 16 },
  fieldLabelText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  textInput: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, fontSize: 14, color: '#0F172A', lineHeight: 20, minHeight: 72, textAlignVertical: 'top', borderWidth: 1.5, borderColor: '#E2E8F0' },
  charCount: { fontSize: 10, color: '#94A3B8', textAlign: 'right', marginTop: 4 },

  // Target
  targetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  targetChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0' },
  targetChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },

  // Level
  levelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0' },
  levelChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  rankCountBadge: { minWidth: 18, height: 16, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 4 },
  rankCountText: { fontSize: 9, fontWeight: '700', color: '#94A3B8' },
  rankPreviewWrap: { marginTop: 8, gap: 6 },
  rankPreviewBar: { flexDirection: 'row' as const, height: 8, borderRadius: 4, overflow: 'hidden' as const, backgroundColor: '#F1F5F9' },
  rankPreviewSegment: { height: '100%' as const },
  rankPreviewInfo: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  rankPreviewText: { fontSize: 10, fontWeight: '600', color: '#64748B' },
  templateToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingVertical: 8, marginBottom: 6 },
  templateToggleText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#7C3AED' },
  templateGrid: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginBottom: 12 },
  templateCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1.5 },
  templateIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },
  templateLabel: { fontSize: 12, fontWeight: '600', color: '#0F172A', maxWidth: 120 },

  // Value picker
  valuePickerWrap: { marginTop: 8, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0', overflow: 'hidden' },
  valueSearchRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  valueSearchInput: { flex: 1, fontSize: 14, color: '#0F172A', paddingVertical: 12 },
  valueList: { borderTopWidth: 1, borderTopColor: '#E2E8F0', maxHeight: 200 },
  valueItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  valueItemActive: { backgroundColor: '#EFF6FF' },
  valueItemText: { fontSize: 14, color: '#0F172A', fontWeight: '500' },
  valueItemSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },

  // Selected badge
  selectedBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginTop: 8, alignSelf: 'flex-start' },
  selectedBadgeText: { fontSize: 13, fontWeight: '700' },

  // Preview
  previewSection: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  previewFrame: { backgroundColor: '#0F172A', borderRadius: 20, overflow: 'hidden', borderWidth: 3, borderColor: '#1E293B' },
  previewStatusBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 },
  previewTime: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  previewNotch: { width: 80, height: 20, borderRadius: 10, backgroundColor: '#000' },
  previewBattery: { width: 22, height: 10, borderRadius: 3, backgroundColor: '#4ADE80', borderWidth: 1, borderColor: '#22C55E' },
  previewNotif: { backgroundColor: '#1E293B', marginHorizontal: 8, marginTop: 8, borderRadius: 16, padding: 12 },
  previewNotifHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  previewAppIcon: { width: 20, height: 20, borderRadius: 5, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center' },
  previewAppName: { fontSize: 9, fontWeight: '700', color: '#94A3B8', flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
  previewNotifTime: { fontSize: 9, color: '#64748B' },
  previewNotifTitle: { fontSize: 12, fontWeight: '700', color: '#F8FAFC', marginBottom: 3 },
  previewNotifBody: { fontSize: 11, color: '#CBD5E1', lineHeight: 15 },
  previewTargetRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#334155' },
  previewTargetText: { fontSize: 9, color: '#94A3B8', fontWeight: '600' },
  previewEmpty: { alignItems: 'center', paddingVertical: 24, gap: 6 },
  previewEmptyText: { fontSize: 11, color: '#64748B' },
  previewContent: { padding: 16, gap: 10 },
  previewPlaceholder: { height: 12, borderRadius: 6, backgroundColor: '#1E293B', width: '90%' },

  // Send button
  sendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#7C3AED', paddingVertical: 16, borderRadius: 16, marginBottom: 20, shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  sendBtnDisabled: { opacity: 0.5 },

  // Scheduling
  scheduleRow: { flexDirection: 'row' as const, gap: 10, marginTop: 8 },
  scheduleField: { flex: 1 },
  scheduleLabel: { fontSize: 10, fontWeight: '600' as const, color: '#94A3B8', marginBottom: 4 },
  scheduleInputWrap: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1.5, borderColor: '#E2E8F0' },
  scheduleInput: { flex: 1, fontSize: 14, color: '#0F172A', padding: 0 },
  schedulePreview: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 8, backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  schedulePreviewText: { fontSize: 11, fontWeight: '700' as const, color: '#10B981' },

  // Scheduled section
  scheduledSection: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1.5, borderColor: '#10B98130' },
  scheduledHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 10 },
  scheduledTitle: { fontSize: 14, fontWeight: '700' as const, color: '#10B981' },
  scheduledCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: '#F0FDF4', borderRadius: 10, padding: 10, marginBottom: 6 },
  scheduledCardTitle: { fontSize: 13, fontWeight: '700' as const, color: '#0F172A' },
  scheduledCardDate: { fontSize: 10, color: '#64748B', marginTop: 2 },
  scheduledActionBtn: { width: 30, height: 30, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const },

  // Analytics
  analyticsSection: { backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#0EA5E920' },
  analyticsKpiRow: { flexDirection: 'row' as const, gap: 6, marginBottom: 12 },
  analyticsKpi: { flex: 1, alignItems: 'center' as const, backgroundColor: '#F8FAFC', borderRadius: 10, paddingVertical: 10, gap: 2 },
  analyticsKpiValue: { fontSize: 18, fontWeight: '800' as const },
  analyticsKpiLabel: { fontSize: 8, fontWeight: '600' as const, color: '#94A3B8', textTransform: 'uppercase' as const, letterSpacing: 0.3 },
  analyticsDeliveryRow: { flexDirection: 'row' as const, gap: 12, marginBottom: 12, paddingHorizontal: 4 },
  analyticsDeliveryItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  analyticsDeliveryText: { fontSize: 11, fontWeight: '600' as const },
  analyticsBreakdown: { marginBottom: 12 },
  analyticsBreakdownTitle: { fontSize: 10, fontWeight: '700' as const, color: '#94A3B8', letterSpacing: 0.5, marginBottom: 6 },
  analyticsBreakdownBar: { flexDirection: 'row' as const, height: 8, borderRadius: 4, overflow: 'hidden' as const, backgroundColor: '#F1F5F9', gap: 1 },
  analyticsBreakdownLegend: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8, marginTop: 6 },
  analyticsLegendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
  analyticsLegendDot: { width: 8, height: 8, borderRadius: 4 },
  analyticsLegendText: { fontSize: 9, fontWeight: '600' as const, color: '#64748B' },
  analyticsWeekly: { marginBottom: 4 },
  analyticsWeeklyRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 4 },
  analyticsWeeklyLabel: { width: 42, fontSize: 9, fontWeight: '600' as const, color: '#94A3B8' },
  analyticsWeeklyBarBg: { flex: 1, height: 14, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' as const },
  analyticsWeeklyBarFill: { height: '100%' as any, backgroundColor: '#7C3AED', borderRadius: 4 },
  analyticsWeeklyValue: { width: 20, fontSize: 10, fontWeight: '800' as const, color: '#0F172A', textAlign: 'right' as const },

  // History status badge
  historyStatusBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginBottom: 6, alignSelf: 'flex-start' as const },
  historyStatusText: { fontSize: 9, fontWeight: '700' as const },
  historyDeliveryBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  historyDeliveryText: { fontSize: 9, fontWeight: '700' as const },
  sendBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // History
  historyToggle: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: '#F1F5F9' },
  historyList: { gap: 6, marginBottom: 16 },
  historyEmpty: { alignItems: 'center', paddingVertical: 32, gap: 8, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  historyEmptyText: { fontSize: 13, color: '#94A3B8' },
  historyCard: { backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F1F5F9', borderLeftWidth: 3 },
  historyCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  historyIconBg: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  historyTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  historyDate: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  historyPushBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.primary + '10', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  historyPushText: { fontSize: 11, fontWeight: '700', color: theme.primary },
  historyPushError: { fontSize: 9, color: '#EF4444', fontWeight: '600' },
  historyMessage: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, gap: 6 },
  historyMsgRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  historyMsgFlag: { fontSize: 12 },
  historyMsgText: { flex: 1, fontSize: 12, color: '#64748B', lineHeight: 17 },
  historyFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  historyTargetBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  historyTargetText: { fontSize: 10, fontWeight: '700' },
  historyAdmin: { fontSize: 10, color: '#CBD5E1', fontWeight: '500' },
});
