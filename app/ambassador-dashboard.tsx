import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator,
  TextInput, RefreshControl, Platform, Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import * as ImagePicker from '@/services/imagePicker';
// expo-file-system loaded dynamically to avoid web bundler issues
import { decode } from '@/services/base64';
import theme, { blurhash } from '@/constants/theme';
import { useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';
import { Ambassador, invalidateAmbassadorCache, generateReferralCode, AMBASSADOR_LEVELS, AmbassadorLevel, checkAndPromoteAmbassador } from '@/services/ambassadorService';
import LevelUpModal from '@/components/ui/LevelUpModal';
import { fetchAmbassadorAnalytics, AmbassadorAnalytics, fetchSponsoredChallengeAnalytics, fetchDetailedBannerAnalytics, BannerDetailedAnalytics } from '@/services/ambassadorAnalyticsService';
import { getMySponsoredEvents, SponsoredEvent, getEventParticipants } from '@/services/sponsoredEventService';
import { getMyEventNotifications, markEventNotificationRead, EventNotification } from '@/services/eventNotificationService';
import Svg, { Polyline, Circle as SvgCircle, Line, Text as SvgText } from 'react-native-svg';
// expo-sharing loaded dynamically to avoid web bundler issues
import { triggerServerPush } from '@/services/pushTokenService';
import { fetchPushQuota, PushQuotaInfo, getDaysUntilReset } from '@/services/pushQuotaService';

export default function AmbassadorDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { language } = useLanguage();
  const fr = language === 'fr';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ambassador, setAmbassador] = useState<any | null>(null);
  const [analytics, setAnalytics] = useState<AmbassadorAnalytics | null>(null);
  const [sponsoredCount, setSponsoredCount] = useState(0);
  const [events, setEvents] = useState<(SponsoredEvent & { _participantCount?: number })[]>([]);
  const [notifications, setNotifications] = useState<EventNotification[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'visibility' | 'events' | 'edit' | 'notifications'>('overview');
  const [analyticsPeriod, setAnalyticsPeriod] = useState<'today' | '7d' | '30d' | 'all'>('30d');

  // Edit fields
  const [editBio, setEditBio] = useState('');
  const [editYoutube, setEditYoutube] = useState('');
  const [editTiktok, setEditTiktok] = useState('');
  const [editInstagram, setEditInstagram] = useState('');
  const [editTwitter, setEditTwitter] = useState('');
  const [editWebsite, setEditWebsite] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Level-up promotion state
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [promotedLevel, setPromotedLevel] = useState<AmbassadorLevel | null>(null);

  // Visibility tab state
  const [bannerAnalytics, setBannerAnalytics] = useState<BannerDetailedAnalytics | null>(null);
  const [visibilityPeriod, setVisibilityPeriod] = useState<7 | 30>(30);
  const [visibilityLoading, setVisibilityLoading] = useState(false);

  // Push composer state
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushCity, setPushCity] = useState('');
  const [pushRadius, setPushRadius] = useState('200');
  const [sendingPush, setSendingPush] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pushQuota, setPushQuota] = useState<PushQuotaInfo | null>(null);

  // Referral code state (must be declared before any early returns)
  const [generatingCode, setGeneratingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);

  const loadAmbassador = useCallback(async () => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    // Fetch all records for user, prefer ambassador type over sponsor types
    const { data: allRecords } = await supabase
      .from('ambassadors')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    const records = allRecords || [];
    const data = records.find(r => r.badge_type === 'ambassador') || records[0] || null;
    if (data) {
      setAmbassador(data);
      setEditBio(data.bio || '');
      setEditYoutube(data.youtube_url || '');
      setEditTiktok(data.tiktok_url || '');
      setEditInstagram(data.instagram_handle || '');
      setEditTwitter(data.twitter_handle || '');
      setEditWebsite(data.website_url || '');
    }
    return data;
  }, [user?.id]);

  const loadAnalytics = useCallback(async (ambId: string) => {
    const [{ stats }, { counts }] = await Promise.all([
      fetchAmbassadorAnalytics(analyticsPeriod),
      fetchSponsoredChallengeAnalytics(analyticsPeriod),
    ]);
    setAnalytics(stats.get(ambId) || { profileViews: 0, socialClicks: 0, bannerImpressions: 0, socialBreakdown: {} });
    setSponsoredCount(counts.get(ambId) || 0);
  }, [analyticsPeriod]);

  const loadBannerAnalytics = useCallback(async (ambId: string) => {
    setVisibilityLoading(true);
    const { data } = await fetchDetailedBannerAnalytics(ambId, visibilityPeriod);
    setBannerAnalytics(data);
    setVisibilityLoading(false);
  }, [visibilityPeriod]);

  const loadEvents = useCallback(async () => {
    const { events: evts } = await getMySponsoredEvents();
    const withCounts = await Promise.all(
      evts.slice(0, 20).map(async (ev) => {
        const { participants } = await getEventParticipants(ev.id);
        return { ...ev, _participantCount: participants.filter(p => p.status !== 'declined').length };
      })
    );
    setEvents(withCounts);
  }, []);

  const loadNotifications = useCallback(async () => {
    const { notifications: notifs } = await getMyEventNotifications();
    setNotifications(notifs);
  }, []);

  // Check for auto-promotion
  const checkPromotion = useCallback(async (ambId: string) => {
    try {
      const { promoted, newLevel } = await checkAndPromoteAmbassador(ambId);
      if (promoted && newLevel) {
        setPromotedLevel(newLevel);
        setShowLevelUp(true);
        await loadAmbassador();
      }
    } catch { /* silent */ }
  }, [loadAmbassador]);

  const loadPushQuota = useCallback(async (amb: any) => {
    if (!amb) return;
    const quota = await fetchPushQuota(amb.id, amb.badge_type, amb.ambassador_level, fr ? 'fr' : 'en');
    setPushQuota(quota);
  }, [fr]);

  const loadAll = useCallback(async () => {
    const amb = await loadAmbassador();
    if (amb) {
      await Promise.all([loadAnalytics(amb.id), loadEvents(), loadNotifications(), loadBannerAnalytics(amb.id), loadPushQuota(amb)]);
      // Check promotion after all data is loaded
      await checkPromotion(amb.id);
    }
    setLoading(false);
  }, [loadAmbassador, loadAnalytics, loadEvents, loadNotifications, loadBannerAnalytics, loadPushQuota, checkPromotion]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Reload banner analytics on period change
  useEffect(() => {
    if (ambassador?.id) loadBannerAnalytics(ambassador.id);
  }, [visibilityPeriod, ambassador?.id, loadBannerAnalytics]);

  // Reload analytics on period change
  useEffect(() => {
    if (ambassador?.id) loadAnalytics(ambassador.id);
  }, [analyticsPeriod, ambassador?.id, loadAnalytics]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const handleSaveProfile = async () => {
    if (!ambassador?.id) return;
    setSaving(true);
    const supabase = getSupabaseClient();
    const { error } = await supabase
      .from('ambassadors')
      .update({
        bio: editBio.trim() || null,
        youtube_url: editYoutube.trim() || null,
        tiktok_url: editTiktok.trim() || null,
        instagram_handle: editInstagram.trim() || null,
        twitter_handle: editTwitter.trim() || null,
        website_url: editWebsite.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ambassador.id);
    setSaving(false);
    if (error) {
      showAlert(fr ? 'Erreur' : 'Error', error.message);
    } else {
      invalidateAmbassadorCache();
      await loadAmbassador();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(fr ? 'Profil mis a jour' : 'Profile updated');
      setActiveTab('overview');
    }
  };

  const handlePickPhoto = async () => {
    if (!ambassador?.id || !user?.id) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showAlert(fr ? 'Permission requise' : 'Permission required');
      return;
    }
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
      const path = `avatars/ambassadors_${user.id}_${Date.now()}.${ext}`;
      const supabase = getSupabaseClient();

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
      await supabase.from('ambassadors').update({ photo: urlData.publicUrl, updated_at: new Date().toISOString() }).eq('id', ambassador.id);
      invalidateAmbassadorCache();
      await loadAmbassador();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loadingWrap}><ActivityIndicator size="large" color="#7C3AED" /></View>
      </SafeAreaView>
    );
  }

  if (!ambassador) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.headerRow}>
          <Pressable style={s.backBtn} onPress={() => router.back()}><MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} /></Pressable>
          <Text style={s.headerTitle}>{fr ? 'Portail Ambassadeur' : 'Ambassador Portal'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.loadingWrap}>
          <MaterialIcons name="lock" size={48} color={theme.textMuted} />
          <Text style={{ color: theme.textMuted, fontSize: 16, marginTop: 12, textAlign: 'center', paddingHorizontal: 32 }}>
            {fr ? "Vous n'etes pas enregistre comme ambassadeur." : 'You are not registered as an ambassador.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const badgeLabel = ambassador.badge_type === 'sponsor' ? 'Sponsor' : ambassador.badge_type === 'partner' ? (fr ? 'Partenaire' : 'Partner') : (fr ? 'Ambassadeur' : 'Ambassador');
  const badgeColor = ambassador.badge_type === 'sponsor' ? '#F59E0B' : ambassador.badge_type === 'partner' ? '#3B82F6' : '#7C3AED';
  const totalInteractions = (analytics?.profileViews || 0) + (analytics?.socialClicks || 0) + (analytics?.bannerImpressions || 0) + sponsoredCount;

  // Ambassador level info
  const ambLevel = (ambassador.ambassador_level || 'decouverte') as AmbassadorLevel;
  const levelConf = AMBASSADOR_LEVELS[ambLevel];
  const levelNames: Record<AmbassadorLevel, string> = { decouverte: fr ? 'Decouverte' : 'Discovery', confirme: fr ? 'Confirme' : 'Confirmed', elite: fr ? 'Elite' : 'Elite' };
  const nextLevel: AmbassadorLevel | null = ambLevel === 'decouverte' ? 'confirme' : ambLevel === 'confirme' ? 'elite' : null;
  const nextConf = nextLevel ? AMBASSADOR_LEVELS[nextLevel] : null;
  const referralCount = ambassador.referral_count || 0;
  const referralCode = ambassador.referral_code || null;

  const handleGenerateCode = async () => {
    if (!ambassador?.id) return;
    setGeneratingCode(true);
    const { code, error } = await generateReferralCode(ambassador.id, ambassador.display_name);
    if (error) showAlert(fr ? 'Erreur' : 'Error', error);
    else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await loadAmbassador();
    }
    setGeneratingCode(false);
  };

  const handleCopyCode = () => {
    if (!referralCode) return;
    try {
      const ExpoClipboard = require('expo-clipboard');
      ExpoClipboard.setStringAsync(referralCode);
    } catch {
      // Clipboard not available in all environments
    }
    setCopiedCode(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const tabs = [
    { id: 'overview' as const, icon: 'dashboard' as const, label: fr ? 'Apercu' : 'Overview' },
    { id: 'visibility' as const, icon: 'visibility' as const, label: fr ? 'Visibilite' : 'Visibility' },
    { id: 'events' as const, icon: 'event' as const, label: fr ? 'Evenements' : 'Events' },
    { id: 'notifications' as const, icon: 'notifications' as const, label: fr ? 'Notifs' : 'Notifs' },
    { id: 'edit' as const, icon: 'edit' as const, label: fr ? 'Modifier' : 'Edit' },
  ];

  const periodOptions = [
    { id: 'today' as const, label: fr ? "Aujourd'hui" : 'Today' },
    { id: '7d' as const, label: '7j' },
    { id: '30d' as const, label: '30j' },
    { id: 'all' as const, label: fr ? 'Tout' : 'All' },
  ];

  const unreadNotifCount = notifications.filter(n => !n.isRead).length;

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.headerRow}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{fr ? 'Portail Ambassadeur' : 'Ambassador Portal'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Hero */}
      <LinearGradient colors={[badgeColor, badgeColor + 'CC']} style={s.hero}>
        <Pressable onPress={handlePickPhoto} disabled={uploadingPhoto}>
          {uploadingPhoto ? (
            <View style={s.heroAvatar}><ActivityIndicator color="#FFF" /></View>
          ) : ambassador.photo ? (
            <Image source={{ uri: ambassador.photo }} style={s.heroAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
          ) : (
            <View style={s.heroAvatar}><Text style={s.heroAvatarLetter}>{ambassador.display_name?.charAt(0)}</Text></View>
          )}
          <View style={s.heroAvatarBadge}><MaterialIcons name="camera-alt" size={12} color="#FFF" /></View>
        </Pressable>
        <Text style={s.heroName}>{ambassador.display_name}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <View style={s.heroBadge}><MaterialIcons name="verified" size={12} color="#FFF" /><Text style={s.heroBadgeText}>{badgeLabel}</Text></View>
          <View style={[s.heroBadge, { backgroundColor: levelConf.color + '40' }]}>
            <MaterialIcons name={levelConf.icon as any} size={12} color="#FFF" />
            <Text style={s.heroBadgeText}>{levelNames[ambLevel]}</Text>
          </View>
        </View>
        {ambassador.bio ? <Text style={s.heroBio} numberOfLines={2}>{ambassador.bio}</Text> : null}
      </LinearGradient>

      {/* Tabs */}
      <View style={s.tabBar}>
        {tabs.map(tab => (
          <Pressable key={tab.id} style={[s.tab, activeTab === tab.id && s.tabActive]} onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.id); }}>
            <View style={{ position: 'relative' }}>
              <MaterialIcons name={tab.icon} size={20} color={activeTab === tab.id ? badgeColor : theme.textMuted} />
              {tab.id === 'notifications' && unreadNotifCount > 0 ? (
                <View style={s.tabBadge}><Text style={s.tabBadgeText}>{unreadNotifCount > 9 ? '9+' : unreadNotifCount}</Text></View>
              ) : null}
            </View>
            <Text style={[s.tabText, activeTab === tab.id && { color: badgeColor }]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={badgeColor} />}
      >
        {/* ===== OVERVIEW TAB ===== */}
        {activeTab === 'overview' ? (
          <>
            {/* Period Filter */}
            <View style={s.periodRow}>
              {periodOptions.map(p => (
                <Pressable key={p.id} style={[s.periodChip, analyticsPeriod === p.id && { backgroundColor: badgeColor, borderColor: badgeColor }]} onPress={() => { Haptics.selectionAsync(); setAnalyticsPeriod(p.id); }}>
                  <Text style={[s.periodChipText, analyticsPeriod === p.id && { color: '#FFF' }]}>{p.label}</Text>
                </Pressable>
              ))}
            </View>

            {/* Stats Grid */}
            <Animated.View entering={FadeInDown.duration(300)} style={s.statsGrid}>
              {[
                { value: analytics?.bannerImpressions || 0, label: fr ? 'Impressions' : 'Impressions', icon: 'visibility' as const, color: '#3B82F6' },
                { value: analytics?.profileViews || 0, label: fr ? 'Vues profil' : 'Profile views', icon: 'person' as const, color: '#7C3AED' },
                { value: analytics?.socialClicks || 0, label: fr ? 'Clics sociaux' : 'Social clicks', icon: 'touch-app' as const, color: '#10B981' },
                { value: sponsoredCount, label: fr ? 'Participations' : 'Participations', icon: 'campaign' as const, color: '#F59E0B' },
              ].map((stat, idx) => (
                <View key={idx} style={s.statCard}>
                  <View style={[s.statIconBg, { backgroundColor: stat.color + '15' }]}>
                    <MaterialIcons name={stat.icon} size={20} color={stat.color} />
                  </View>
                  <Text style={s.statValue}>{stat.value}</Text>
                  <Text style={s.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </Animated.View>

            {/* Total */}
            <View style={s.totalCard}>
              <MaterialIcons name="insights" size={20} color={badgeColor} />
              <Text style={s.totalLabel}>{fr ? 'Total interactions' : 'Total interactions'}</Text>
              <Text style={[s.totalValue, { color: badgeColor }]}>{totalInteractions}</Text>
            </View>

            {/* Social Breakdown */}
            {analytics && Object.keys(analytics.socialBreakdown).length > 0 ? (
              <View style={s.sectionCard}>
                <Text style={s.sectionCardTitle}>{fr ? 'Repartition clics sociaux' : 'Social clicks breakdown'}</Text>
                {Object.entries(analytics.socialBreakdown).sort((a, b) => b[1] - a[1]).map(([platform, count]) => (
                  <View key={platform} style={s.breakdownRow}>
                    <MaterialIcons name={platform === 'youtube' ? 'play-circle-filled' : platform === 'instagram' ? 'camera-alt' : platform === 'tiktok' ? 'music-note' : platform === 'twitter' ? 'alternate-email' : 'language'} size={16} color={theme.textSecondary} />
                    <Text style={s.breakdownLabel}>{platform.charAt(0).toUpperCase() + platform.slice(1)}</Text>
                    <Text style={s.breakdownValue}>{count}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Level Progress Card */}
            <View style={s.sectionCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <Text style={s.sectionCardTitle}>{fr ? 'Niveau ambassadeur' : 'Ambassador level'}</Text>
                <Pressable onPress={() => router.push('/ambassador-program' as any)} hitSlop={8}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: badgeColor }}>{fr ? 'Voir les niveaux' : 'View levels'}</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <View style={[s.statIconBg, { backgroundColor: levelConf.color + '15', width: 48, height: 48, borderRadius: 16 }]}>
                  <MaterialIcons name={levelConf.icon as any} size={24} color={levelConf.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: levelConf.color }}>{levelNames[ambLevel]}</Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                    {referralCount} {fr ? 'parrainages' : 'referrals'} • {events.length} {fr ? 'evenements' : 'events'}
                  </Text>
                </View>
              </View>
              {nextLevel && nextConf ? (
                <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    {fr ? 'Prochain niveau :' : 'Next level:'} {levelNames[nextLevel]}
                  </Text>
                  {/* Referrals progress */}
                  <View style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary }}>{fr ? 'Parrainages' : 'Referrals'}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textPrimary }}>{referralCount}/{nextConf.minReferrals}</Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${Math.min(100, (referralCount / nextConf.minReferrals) * 100)}%`, backgroundColor: levelConf.color, borderRadius: 3 }} />
                    </View>
                  </View>
                  {/* Events progress */}
                  <View style={{ marginBottom: 8 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary }}>{fr ? 'Evenements' : 'Events'}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textPrimary }}>{events.length}/{nextConf.minEvents}</Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${Math.min(100, (events.length / nextConf.minEvents) * 100)}%`, backgroundColor: levelConf.color, borderRadius: 3 }} />
                    </View>
                  </View>
                  {/* Impressions progress */}
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, color: theme.textSecondary }}>Impressions</Text>
                      <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textPrimary }}>{analytics?.bannerImpressions || 0}/{nextConf.minImpressions}</Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${Math.min(100, ((analytics?.bannerImpressions || 0) / nextConf.minImpressions) * 100)}%`, backgroundColor: levelConf.color, borderRadius: 3 }} />
                    </View>
                  </View>
                </View>
              ) : (
                <View style={{ backgroundColor: '#F59E0B10', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <MaterialIcons name="military-tech" size={20} color="#F59E0B" />
                  <Text style={{ flex: 1, fontSize: 13, color: '#92400E', fontWeight: '600' }}>
                    {fr ? 'Niveau maximum atteint ! Vous etes un ambassadeur Elite.' : 'Maximum level reached! You are an Elite ambassador.'}
                  </Text>
                </View>
              )}
            </View>

            {/* Referral Code Card */}
            <View style={s.sectionCard}>
              <Text style={s.sectionCardTitle}>{fr ? 'Code de parrainage' : 'Referral code'}</Text>
              {referralCode ? (
                <>
                  <Pressable style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 2, borderColor: badgeColor + '30', borderStyle: 'dashed', gap: 12 }} onPress={handleCopyCode}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 22, fontWeight: '900', color: badgeColor, letterSpacing: 2, textAlign: 'center' }}>{referralCode}</Text>
                    </View>
                    <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: badgeColor + '15', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name={copiedCode ? 'check' : 'content-copy'} size={20} color={badgeColor} />
                    </View>
                  </Pressable>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 8, textAlign: 'center' }}>
                    {copiedCode ? (fr ? 'Code copie !' : 'Code copied!') : (fr ? 'Appuyez pour copier' : 'Tap to copy')}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, backgroundColor: '#10B98108', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#10B98115' }}>
                    <MaterialIcons name="people" size={18} color="#10B981" />
                    <Text style={{ flex: 1, fontSize: 13, color: theme.textSecondary }}>
                      {referralCount} {fr ? 'parrainage(s) valide(s)' : 'validated referral(s)'}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#10B981' }}>+{(ambassador.total_referral_xp || 0)} XP</Text>
                  </View>
                </>
              ) : (
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: badgeColor, paddingVertical: 14, borderRadius: 14 }}
                  onPress={handleGenerateCode}
                  disabled={generatingCode}
                >
                  {generatingCode ? <ActivityIndicator color="#FFF" size="small" /> : (
                    <>
                      <MaterialIcons name="vpn-key" size={20} color="#FFF" />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{fr ? 'Generer mon code' : 'Generate my code'}</Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>

            {/* Push Quota Display */}
            {pushQuota && pushQuota.limit !== 0 ? (
              <View style={s.sectionCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <Text style={s.sectionCardTitle}>{fr ? 'Quota notifications push' : 'Push notification quota'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialIcons name="schedule" size={12} color={theme.textMuted} />
                    <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textMuted }}>
                      {fr ? `Reset ${pushQuota.resetLabel}` : `Resets ${pushQuota.resetLabel}`}
                    </Text>
                  </View>
                </View>
                {/* Quota visual */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                  <View style={[s.statIconBg, { backgroundColor: pushQuota.canSend ? '#10B98115' : '#EF444415', width: 48, height: 48, borderRadius: 16 }]}>
                    <MaterialIcons name={pushQuota.isUnlimited ? 'all-inclusive' : 'notifications-active'} size={24} color={pushQuota.canSend ? '#10B981' : '#EF4444'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    {pushQuota.isUnlimited ? (
                      <>
                        <Text style={{ fontSize: 22, fontWeight: '900', color: '#10B981' }}>{fr ? 'Illimite' : 'Unlimited'}</Text>
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                          {pushQuota.used} {fr ? 'envoyee(s) ce mois' : 'sent this month'}
                        </Text>
                      </>
                    ) : (
                      <>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                          <Text style={{ fontSize: 28, fontWeight: '900', color: pushQuota.canSend ? '#10B981' : '#EF4444' }}>{pushQuota.remaining}</Text>
                          <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary }}>/ {pushQuota.limit}</Text>
                        </View>
                        <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                          {fr ? 'notification(s) restante(s)' : 'notification(s) remaining'}
                        </Text>
                      </>
                    )}
                  </View>
                </View>
                {/* Progress bar (non-unlimited only) */}
                {!pushQuota.isUnlimited ? (
                  <View style={{ marginBottom: 10 }}>
                    <View style={{ height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${pushQuota.percentage}%`, backgroundColor: pushQuota.canSend ? '#10B981' : '#EF4444', borderRadius: 4 }} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textMuted }}>
                        {pushQuota.used}/{pushQuota.limit} {fr ? 'utilise(s)' : 'used'}
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialIcons name="timer" size={10} color={theme.textMuted} />
                        <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textMuted }}>
                          {getDaysUntilReset()}j
                        </Text>
                      </View>
                    </View>
                  </View>
                ) : null}
                {!pushQuota.canSend ? (
                  <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name="block" size={16} color="#EF4444" />
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: '600', color: '#991B1B' }}>
                      {fr ? `Limite atteinte. Reset le ${pushQuota.resetLabel}.` : `Limit reached. Resets ${pushQuota.resetLabel}.`}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Push Composer - Confirmé and Élite only */}
            {ambLevel !== 'decouverte' && ambassador.badge_type === 'ambassador' ? (
              <View style={s.sectionCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <Text style={s.sectionCardTitle}>{fr ? 'Notification push' : 'Push notification'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ambLevel === 'elite' ? '#F59E0B15' : '#7C3AED15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <MaterialIcons name={ambLevel === 'elite' ? 'all-inclusive' : 'looks-one'} size={12} color={ambLevel === 'elite' ? '#F59E0B' : '#7C3AED'} />
                    <Text style={{ fontSize: 10, fontWeight: '700', color: ambLevel === 'elite' ? '#F59E0B' : '#7C3AED' }}>
                      {ambLevel === 'elite' ? (fr ? 'Illimite' : 'Unlimited') : '1/mois'}
                    </Text>
                  </View>
                </View>
                <TextInput
                  style={[s.sectionCard, { backgroundColor: '#F8FAFC', marginBottom: 8, paddingVertical: 12, paddingHorizontal: 14, fontSize: 14, fontWeight: '600', color: '#0F172A' }]}
                  value={pushTitle}
                  onChangeText={setPushTitle}
                  placeholder={fr ? 'Titre de la notification' : 'Notification title'}
                  placeholderTextColor="#94A3B8"
                />
                <TextInput
                  style={[s.sectionCard, { backgroundColor: '#F8FAFC', marginBottom: 8, paddingVertical: 12, paddingHorizontal: 14, fontSize: 13, color: '#334155', minHeight: 60, textAlignVertical: 'top' }]}
                  value={pushBody}
                  onChangeText={setPushBody}
                  placeholder={fr ? 'Message...' : 'Message...'}
                  placeholderTextColor="#94A3B8"
                  multiline
                />
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  <View style={{ flex: 2 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8', marginBottom: 4 }}>{fr ? 'Ville (optionnel)' : 'City (optional)'}</Text>
                    <TextInput
                      style={{ backgroundColor: '#F8FAFC', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 13, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0' }}
                      value={pushCity}
                      onChangeText={setPushCity}
                      placeholder={fr ? 'Ville...' : 'City...'}
                      placeholderTextColor="#94A3B8"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8', marginBottom: 4 }}>Rayon (km)</Text>
                    <TextInput
                      style={{ backgroundColor: '#F8FAFC', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 13, color: '#0F172A', borderWidth: 1, borderColor: '#E2E8F0' }}
                      value={pushRadius}
                      onChangeText={setPushRadius}
                      keyboardType="numeric"
                    />
                  </View>
                </View>
                <Pressable
                  style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: badgeColor, paddingVertical: 14, borderRadius: 14 }, sendingPush && { opacity: 0.6 }]}
                  onPress={async () => {
                    if (!pushTitle.trim() || !pushBody.trim()) { showAlert(fr ? 'Remplissez titre et message' : 'Fill title and message'); return; }
                    setSendingPush(true);
                    try {
                      await triggerServerPush('sponsor_push', {
                        ambassadorId: ambassador.id,
                        ambassadorName: ambassador.display_name,
                        title: pushTitle.trim(),
                        body: pushBody.trim(),
                        radiusKm: parseInt(pushRadius) || 200,
                        city: pushCity.trim() || undefined,
                      });
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      showAlert(fr ? 'Notification envoyee !' : 'Notification sent!');
                      setPushTitle(''); setPushBody(''); setPushCity('');
                    } catch (e: any) {
                      showAlert(fr ? 'Erreur' : 'Error', e.message || 'Failed');
                    }
                    setSendingPush(false);
                  }}
                  disabled={sendingPush}
                >
                  {sendingPush ? <ActivityIndicator color="#FFF" size="small" /> : (
                    <>
                      <MaterialIcons name="send" size={18} color="#FFF" />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{fr ? 'Envoyer' : 'Send'}</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}

            {/* Export CSV - Elite only */}
            {ambLevel === 'elite' ? (
              <Pressable
                style={[s.sectionCard, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16 }, exporting && { opacity: 0.6 }]}
                onPress={async () => {
                  if (!bannerAnalytics) { showAlert(fr ? 'Aucune donnee' : 'No data'); return; }
                  setExporting(true);
                  try {
                    const ba = bannerAnalytics;
                    let csv = 'Date,Impressions,Clicks,CTR\n';
                    ba.dailyDates.forEach((date, i) => {
                      const imp = ba.dailyImpressions[i] || 0;
                      const clk = ba.dailyClicks[i] || 0;
                      const ctr = imp > 0 ? ((clk / imp) * 100).toFixed(1) : '0';
                      csv += `${date},${imp},${clk},${ctr}%\n`;
                    });
                    csv += `\nTotal,${ba.totalImpressions},${ba.totalClicks},${ba.totalImpressions > 0 ? ((ba.totalClicks / ba.totalImpressions) * 100).toFixed(1) : 0}%\n`;
                    csv += `Unique Viewers,${ba.uniqueViewers}\n\n`;
                    csv += 'Page,Impressions,Clicks\n';
                    Object.entries(ba.impressionsByPage).forEach(([page, count]) => {
                      csv += `${page},${count},${ba.clicksByPage[page] || 0}\n`;
                    });
                    if (Platform.OS === 'web') {
                      // Web: trigger download via blob
                      try {
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `analytics_${ambassador.display_name.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
                        a.click();
                        URL.revokeObjectURL(url);
                      } catch {
                        showAlert(fr ? 'Erreur' : 'Error', fr ? 'Export non disponible sur web' : 'Export not available on web');
                      }
                    } else {
                      const FS = require('expo-file-system');
                      const SharingModule = require('expo-sharing');
                      const path = `${FS.cacheDirectory}analytics_${ambassador.display_name.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
                      await FS.writeAsStringAsync(path, csv, { encoding: FS.EncodingType.UTF8 });
                      const canShare = await SharingModule.isAvailableAsync();
                      if (canShare) {
                        await SharingModule.shareAsync(path, { mimeType: 'text/csv', dialogTitle: fr ? 'Exporter analytics' : 'Export analytics' });
                      } else {
                        showAlert(fr ? 'Fichier cree' : 'File created', path);
                      }
                    }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  } catch (e: any) {
                    showAlert(fr ? 'Erreur' : 'Error', e.message);
                  }
                  setExporting(false);
                }}
                disabled={exporting}
              >
                {exporting ? <ActivityIndicator size="small" color={badgeColor} /> : (
                  <>
                    <MaterialIcons name="download" size={20} color={badgeColor} />
                    <Text style={{ fontSize: 15, fontWeight: '700', color: badgeColor }}>{fr ? 'Exporter CSV' : 'Export CSV'}</Text>
                  </>
                )}
              </Pressable>
            ) : null}

            {/* Quick Links */}
            <View style={s.quickLinksRow}>
              <Pressable style={s.quickLink} onPress={() => router.push('/ambassador-program' as any)}>
                <MaterialIcons name="stars" size={20} color="#F59E0B" />
                <Text style={s.quickLinkText}>{fr ? 'Programme' : 'Program'}</Text>
              </Pressable>
              <Pressable style={s.quickLink} onPress={() => router.push('/ambassadors' as any)}>
                <MaterialIcons name="group" size={20} color="#7C3AED" />
                <Text style={s.quickLinkText}>{fr ? 'Ambassadeurs' : 'Ambassadors'}</Text>
              </Pressable>
              <Pressable style={s.quickLink} onPress={() => router.push('/sponsored-event/new' as any)}>
                <MaterialIcons name="add-circle" size={20} color="#10B981" />
                <Text style={s.quickLinkText}>{fr ? 'Evenement' : 'Event'}</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {/* ===== VISIBILITY TAB ===== */}
        {activeTab === 'visibility' ? (
          <VisibilityTab
            bannerAnalytics={bannerAnalytics}
            visibilityPeriod={visibilityPeriod}
            setVisibilityPeriod={setVisibilityPeriod}
            loading={visibilityLoading}
            badgeColor={badgeColor}
            fr={fr}
            chartWidth={Math.min(screenWidth - 80, 560)}
          />
        ) : null}

        {/* ===== EVENTS TAB ===== */}
        {activeTab === 'events' ? (
          <>
            <View style={s.eventsHeader}>
              <Text style={s.eventsCount}>{events.length} {fr ? 'evenement(s)' : 'event(s)'}</Text>
              <Pressable style={[s.newEventBtn, { backgroundColor: badgeColor }]} onPress={() => router.push('/sponsored-event/new' as any)}>
                <MaterialIcons name="add" size={18} color="#FFF" />
                <Text style={s.newEventBtnText}>{fr ? 'Nouveau' : 'New'}</Text>
              </Pressable>
            </View>
            {events.length === 0 ? (
              <View style={s.emptyState}>
                <MaterialIcons name="event-busy" size={48} color={theme.textMuted} />
                <Text style={s.emptyText}>{fr ? 'Aucun evenement cree' : 'No events created'}</Text>
                <Pressable style={[s.emptyCta, { backgroundColor: badgeColor }]} onPress={() => router.push('/sponsored-event/new' as any)}>
                  <MaterialIcons name="add" size={18} color="#FFF" />
                  <Text style={s.emptyCtaText}>{fr ? 'Creer un evenement' : 'Create event'}</Text>
                </Pressable>
              </View>
            ) : (
              events.map((ev, idx) => {
                const statusColor = ev.status === 'active' ? '#22C55E' : ev.status === 'completed' ? '#3B82F6' : ev.status === 'cancelled' ? '#EF4444' : '#F59E0B';
                return (
                  <Animated.View key={ev.id} entering={FadeInDown.duration(250).delay(idx * 50)}>
                    <Pressable style={s.eventCard} onPress={() => router.push(`/sponsored-event/${ev.id}` as any)}>
                      <View style={s.eventCardHeader}>
                        <View style={[s.eventStatusDot, { backgroundColor: statusColor }]} />
                        <Text style={[s.eventStatusText, { color: statusColor }]}>
                          {ev.status === 'upcoming' ? (fr ? 'A venir' : 'Upcoming') : ev.status === 'active' ? (fr ? 'En cours' : 'Active') : ev.status === 'completed' ? (fr ? 'Termine' : 'Done') : (fr ? 'Annule' : 'Cancelled')}
                        </Text>
                        <View style={{ flex: 1 }} />
                        <Text style={s.eventDate}>{new Date(ev.eventDate).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text>
                      </View>
                      <Text style={s.eventTitle} numberOfLines={1}>{ev.title}</Text>
                      <View style={s.eventMeta}>
                        <View style={s.eventMetaItem}><MaterialIcons name="group" size={14} color={theme.textMuted} /><Text style={s.eventMetaText}>{ev._participantCount || 0}/{ev.maxParticipants}</Text></View>
                        <View style={s.eventMetaItem}><MaterialIcons name="track-changes" size={14} color={theme.textMuted} /><Text style={s.eventMetaText}>{ev.challengeType === '10_tirs' ? '10 Tirs' : ev.challengeType === '10_tirs_sautee' ? '10 Tirs sautee' : 'Precision'}</Text></View>
                        {ev.resultsPublished ? <View style={s.publishedBadge}><MaterialIcons name="leaderboard" size={12} color="#FFF" /><Text style={s.publishedBadgeText}>{fr ? 'Publie' : 'Published'}</Text></View> : null}
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} style={{ position: 'absolute', right: 14, top: '50%' }} />
                    </Pressable>
                  </Animated.View>
                );
              })
            )}
          </>
        ) : null}

        {/* ===== NOTIFICATIONS TAB ===== */}
        {activeTab === 'notifications' ? (
          <>
            {notifications.length === 0 ? (
              <View style={s.emptyState}>
                <MaterialIcons name="notifications-none" size={48} color={theme.textMuted} />
                <Text style={s.emptyText}>{fr ? 'Aucune notification' : 'No notifications'}</Text>
              </View>
            ) : (
              notifications.map((notif, idx) => (
                <Animated.View key={notif.id} entering={FadeInDown.duration(200).delay(idx * 40)}>
                  <Pressable
                    style={[s.notifCard, !notif.isRead && s.notifCardUnread]}
                    onPress={() => {
                      if (!notif.isRead) markEventNotificationRead(notif.id);
                      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
                      if (notif.eventId) router.push(`/sponsored-event/${notif.eventId}` as any);
                    }}
                  >
                    <View style={[s.notifIcon, { backgroundColor: notif.type === 'witness_needed' ? '#F59E0B15' : notif.type === 'attestation_received' || notif.type === 'all_witnesses_attested' ? '#10B98115' : notif.type === 'participant_registered' ? '#3B82F615' : notif.type === 'result_submitted_to_creator' ? '#7C3AED15' : '#3B82F615' }]}>
                      <MaterialIcons
                        name={notif.type === 'witness_needed' ? 'visibility' : notif.type === 'attestation_received' ? 'verified' : notif.type === 'all_witnesses_attested' ? 'check-circle' : notif.type === 'participant_registered' ? 'person-add' : notif.type === 'result_submitted_to_creator' ? 'assessment' : 'notifications'}
                        size={18}
                        color={notif.type === 'witness_needed' ? '#F59E0B' : notif.type === 'attestation_received' || notif.type === 'all_witnesses_attested' ? '#10B981' : notif.type === 'participant_registered' ? '#3B82F6' : notif.type === 'result_submitted_to_creator' ? '#7C3AED' : '#3B82F6'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.notifTitle} numberOfLines={1}>{notif.title}</Text>
                      {notif.message ? <Text style={s.notifMsg} numberOfLines={2}>{notif.message}</Text> : null}
                      <Text style={s.notifTime}>{new Date(notif.createdAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</Text>
                    </View>
                    {!notif.isRead ? <View style={s.notifDot} /> : null}
                  </Pressable>
                </Animated.View>
              ))
            )}
          </>
        ) : null}

        {/* ===== EDIT TAB ===== */}
        {activeTab === 'edit' ? (
          <>
            {/* Photo */}
            <View style={s.editPhotoSection}>
              <Pressable onPress={handlePickPhoto} disabled={uploadingPhoto} style={s.editPhotoBtn}>
                {uploadingPhoto ? (
                  <View style={s.editPhotoCircle}><ActivityIndicator color={badgeColor} /></View>
                ) : ambassador.photo ? (
                  <Image source={{ uri: ambassador.photo }} style={s.editPhotoCircle} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                ) : (
                  <View style={s.editPhotoCircle}><MaterialIcons name="person" size={32} color={theme.textMuted} /></View>
                )}
                <View style={[s.editPhotoBadge, { backgroundColor: badgeColor }]}><MaterialIcons name="camera-alt" size={14} color="#FFF" /></View>
              </Pressable>
              <Text style={s.editPhotoHint}>{fr ? 'Appuyez pour changer la photo' : 'Tap to change photo'}</Text>
            </View>

            {/* Fields */}
            <View style={s.editField}>
              <Text style={s.editLabel}>Bio</Text>
              <TextInput style={[s.editInput, { minHeight: 80, textAlignVertical: 'top' }]} value={editBio} onChangeText={setEditBio} placeholder={fr ? 'Decrivez-vous...' : 'Describe yourself...'} placeholderTextColor={theme.textMuted} multiline />
            </View>
            <View style={s.editField}>
              <View style={s.editLabelRow}><MaterialIcons name="play-circle-filled" size={16} color="#FF0000" /><Text style={s.editLabel}>YouTube URL</Text></View>
              <TextInput style={s.editInput} value={editYoutube} onChangeText={setEditYoutube} placeholder="https://youtube.com/..." placeholderTextColor={theme.textMuted} autoCapitalize="none" keyboardType="url" />
            </View>
            <View style={s.editField}>
              <View style={s.editLabelRow}><MaterialIcons name="music-note" size={16} color="#000" /><Text style={s.editLabel}>TikTok URL</Text></View>
              <TextInput style={s.editInput} value={editTiktok} onChangeText={setEditTiktok} placeholder="https://tiktok.com/@..." placeholderTextColor={theme.textMuted} autoCapitalize="none" keyboardType="url" />
            </View>
            <View style={s.editField}>
              <View style={s.editLabelRow}><MaterialIcons name="camera-alt" size={16} color="#E4405F" /><Text style={s.editLabel}>Instagram</Text></View>
              <TextInput style={s.editInput} value={editInstagram} onChangeText={setEditInstagram} placeholder="@username" placeholderTextColor={theme.textMuted} autoCapitalize="none" />
            </View>
            <View style={s.editField}>
              <View style={s.editLabelRow}><MaterialIcons name="alternate-email" size={16} color="#1DA1F2" /><Text style={s.editLabel}>Twitter / X</Text></View>
              <TextInput style={s.editInput} value={editTwitter} onChangeText={setEditTwitter} placeholder="@username" placeholderTextColor={theme.textMuted} autoCapitalize="none" />
            </View>
            <View style={s.editField}>
              <View style={s.editLabelRow}><MaterialIcons name="language" size={16} color={theme.primary} /><Text style={s.editLabel}>{fr ? 'Site web' : 'Website'}</Text></View>
              <TextInput style={s.editInput} value={editWebsite} onChangeText={setEditWebsite} placeholder="https://..." placeholderTextColor={theme.textMuted} autoCapitalize="none" keyboardType="url" />
            </View>

            <Pressable style={[s.saveBtn, { backgroundColor: badgeColor }]} onPress={handleSaveProfile} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                <><MaterialIcons name="save" size={20} color="#FFF" /><Text style={s.saveBtnText}>{fr ? 'Enregistrer' : 'Save'}</Text></>
              )}
            </Pressable>
          </>
        ) : null}
      </ScrollView>
      {/* Level Up Modal */}
      <LevelUpModal
        visible={showLevelUp}
        newLevel={promotedLevel}
        language={fr ? 'fr' : 'en'}
        onClose={() => {
          setShowLevelUp(false);
          setPromotedLevel(null);
        }}
      />
    </SafeAreaView>
  );
}

// ===== SPARKLINE COMPONENT =====
function Sparkline({ data, width, height, color, fillColor, showDots }: { data: number[]; width: number; height: number; color: string; fillColor?: string; showDots?: boolean }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const padding = 4;
  const w = width - padding * 2;
  const h = height - padding * 2;
  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * w;
    const y = padding + h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  const lastIdx = data.length - 1;
  const lastX = padding + (lastIdx / (data.length - 1)) * w;
  const lastY = padding + h - (data[lastIdx] / max) * h;
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {showDots ? <SvgCircle cx={lastX} cy={lastY} r={3} fill={color} /> : null}
    </Svg>
  );
}

// ===== VISIBILITY TAB COMPONENT =====
function VisibilityTab({ bannerAnalytics, visibilityPeriod, setVisibilityPeriod, loading, badgeColor, fr, chartWidth }: {
  bannerAnalytics: BannerDetailedAnalytics | null;
  visibilityPeriod: 7 | 30;
  setVisibilityPeriod: (p: 7 | 30) => void;
  loading: boolean;
  badgeColor: string;
  fr: boolean;
  chartWidth: number;
}) {
  const ba = bannerAnalytics;
  const pageLabels: Record<string, { label: string; icon: string; color: string }> = {
    home: { label: fr ? 'Accueil' : 'Home', icon: 'home', color: '#3B82F6' },
    stats: { label: 'Stats', icon: 'bar-chart', color: '#7C3AED' },
    directory: { label: fr ? 'Annuaire' : 'Directory', icon: 'people', color: '#10B981' },
    map: { label: fr ? 'Carte' : 'Map', icon: 'map', color: '#F59E0B' },
    unknown: { label: fr ? 'Autre' : 'Other', icon: 'help-outline', color: '#94A3B8' },
  };

  // Trim daily data to match period
  const dailyImp = ba ? ba.dailyImpressions.slice(-visibilityPeriod) : [];
  const dailyClk = ba ? ba.dailyClicks.slice(-visibilityPeriod) : [];
  const dailyDates = ba ? ba.dailyDates.slice(-visibilityPeriod) : [];

  // Compute period totals from trimmed daily data
  const periodImpressions = dailyImp.reduce((s, v) => s + v, 0);
  const periodClicks = dailyClk.reduce((s, v) => s + v, 0);
  const periodCTR = periodImpressions > 0 ? Math.round((periodClicks / periodImpressions) * 1000) / 10 : 0;

  return (
    <>
      {/* Period Selector */}
      <View style={vs.periodRow}>
        {([7, 30] as const).map(p => (
          <Pressable key={p} style={[vs.periodChip, visibilityPeriod === p && { backgroundColor: badgeColor, borderColor: badgeColor }]} onPress={() => { Haptics.selectionAsync(); setVisibilityPeriod(p); }}>
            <Text style={[vs.periodChipText, visibilityPeriod === p && { color: '#FFF' }]}>{p === 7 ? '7j' : '30j'}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={vs.loadingWrap}><ActivityIndicator size="large" color={badgeColor} /></View>
      ) : !ba ? (
        <View style={vs.emptyState}>
          <MaterialIcons name="visibility-off" size={48} color="#94A3B8" />
          <Text style={vs.emptyText}>{fr ? 'Aucune donnee de visibilite' : 'No visibility data'}</Text>
        </View>
      ) : (
        <>
          {/* KPI Cards Row */}
          <View style={vs.kpiRow}>
            <View style={vs.kpiCard}>
              <View style={[vs.kpiIcon, { backgroundColor: '#3B82F615' }]}><MaterialIcons name="visibility" size={18} color="#3B82F6" /></View>
              <Text style={vs.kpiValue}>{periodImpressions}</Text>
              <Text style={vs.kpiLabel}>{fr ? 'Impressions' : 'Impressions'}</Text>
            </View>
            <View style={vs.kpiCard}>
              <View style={[vs.kpiIcon, { backgroundColor: '#10B98115' }]}><MaterialIcons name="touch-app" size={18} color="#10B981" /></View>
              <Text style={vs.kpiValue}>{periodClicks}</Text>
              <Text style={vs.kpiLabel}>{fr ? 'Clics' : 'Clicks'}</Text>
            </View>
            <View style={vs.kpiCard}>
              <View style={[vs.kpiIcon, { backgroundColor: '#F59E0B15' }]}><MaterialIcons name="percent" size={18} color="#F59E0B" /></View>
              <Text style={[vs.kpiValue, { color: '#F59E0B' }]}>{periodCTR}%</Text>
              <Text style={vs.kpiLabel}>CTR</Text>
            </View>
          </View>

          {/* Unique Reach */}
          <View style={vs.reachCard}>
            <View style={vs.reachLeft}>
              <MaterialIcons name="people" size={20} color={badgeColor} />
              <View>
                <Text style={vs.reachLabel}>{fr ? 'Portee unique' : 'Unique reach'}</Text>
                <Text style={vs.reachSub}>{fr ? 'Utilisateurs distincts' : 'Distinct users'}</Text>
              </View>
            </View>
            <Text style={[vs.reachValue, { color: badgeColor }]}>{ba.uniqueViewers}</Text>
          </View>

          {/* Impressions by Page */}
          <View style={vs.sectionCard}>
            <Text style={vs.sectionTitle}>{fr ? 'Impressions par page' : 'Impressions by page'}</Text>
            {Object.entries(ba.impressionsByPage).sort((a, b) => b[1] - a[1]).map(([page, count]) => {
              const cfg = pageLabels[page] || pageLabels.unknown;
              const pct = ba.totalImpressions > 0 ? Math.round((count / ba.totalImpressions) * 100) : 0;
              return (
                <View key={page} style={vs.pageRow}>
                  <View style={[vs.pageIcon, { backgroundColor: cfg.color + '15' }]}>
                    <MaterialIcons name={cfg.icon as any} size={16} color={cfg.color} />
                  </View>
                  <View style={vs.pageInfo}>
                    <Text style={vs.pageName}>{cfg.label}</Text>
                    <View style={vs.pageBarTrack}>
                      <View style={[vs.pageBarFill, { width: `${pct}%`, backgroundColor: cfg.color }]} />
                    </View>
                  </View>
                  <View style={vs.pageValues}>
                    <Text style={vs.pageCount}>{count}</Text>
                    <Text style={vs.pagePct}>{pct}%</Text>
                  </View>
                </View>
              );
            })}
            {Object.keys(ba.impressionsByPage).length === 0 ? (
              <Text style={vs.noDataText}>{fr ? 'Aucune impression enregistree' : 'No impressions recorded'}</Text>
            ) : null}
          </View>

          {/* Clicks by Page */}
          {Object.keys(ba.clicksByPage).length > 0 ? (
            <View style={vs.sectionCard}>
              <Text style={vs.sectionTitle}>{fr ? 'Clics par page' : 'Clicks by page'}</Text>
              {Object.entries(ba.clicksByPage).sort((a, b) => b[1] - a[1]).map(([page, count]) => {
                const cfg = pageLabels[page] || pageLabels.unknown;
                return (
                  <View key={page} style={vs.clickRow}>
                    <View style={[vs.pageIcon, { backgroundColor: cfg.color + '15' }]}>
                      <MaterialIcons name={cfg.icon as any} size={14} color={cfg.color} />
                    </View>
                    <Text style={vs.clickLabel}>{cfg.label}</Text>
                    <Text style={vs.clickValue}>{count}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Sparkline Charts */}
          <View style={vs.sectionCard}>
            <Text style={vs.sectionTitle}>{fr ? `Evolution ${visibilityPeriod}j` : `${visibilityPeriod}d Evolution`}</Text>

            {/* Impressions sparkline */}
            <View style={vs.chartBlock}>
              <View style={vs.chartHeader}>
                <View style={vs.chartLegendDot}><View style={[vs.chartDot, { backgroundColor: '#3B82F6' }]} /></View>
                <Text style={vs.chartLabel}>{fr ? 'Impressions' : 'Impressions'}</Text>
                <Text style={vs.chartTotal}>{periodImpressions}</Text>
              </View>
              <View style={vs.chartContainer}>
                <Sparkline data={dailyImp} width={chartWidth} height={48} color="#3B82F6" showDots />
              </View>
              <View style={vs.chartDateRow}>
                <Text style={vs.chartDateLabel}>{dailyDates.length > 0 ? dailyDates[0].slice(5) : ''}</Text>
                <Text style={vs.chartDateLabel}>{dailyDates.length > 0 ? dailyDates[dailyDates.length - 1].slice(5) : ''}</Text>
              </View>
            </View>

            {/* Clicks sparkline */}
            <View style={[vs.chartBlock, { marginTop: 16 }]}>
              <View style={vs.chartHeader}>
                <View style={vs.chartLegendDot}><View style={[vs.chartDot, { backgroundColor: '#10B981' }]} /></View>
                <Text style={vs.chartLabel}>{fr ? 'Clics' : 'Clicks'}</Text>
                <Text style={vs.chartTotal}>{periodClicks}</Text>
              </View>
              <View style={vs.chartContainer}>
                <Sparkline data={dailyClk} width={chartWidth} height={48} color="#10B981" showDots />
              </View>
              <View style={vs.chartDateRow}>
                <Text style={vs.chartDateLabel}>{dailyDates.length > 0 ? dailyDates[0].slice(5) : ''}</Text>
                <Text style={vs.chartDateLabel}>{dailyDates.length > 0 ? dailyDates[dailyDates.length - 1].slice(5) : ''}</Text>
              </View>
            </View>
          </View>

          {/* CTR Trend */}
          {dailyImp.length > 1 ? (
            <View style={vs.sectionCard}>
              <Text style={vs.sectionTitle}>{fr ? 'Tendance CTR' : 'CTR Trend'}</Text>
              <View style={vs.chartBlock}>
                <View style={vs.chartContainer}>
                  <Sparkline
                    data={dailyImp.map((imp, i) => imp > 0 ? Math.round((dailyClk[i] / imp) * 100) : 0)}
                    width={chartWidth}
                    height={48}
                    color="#F59E0B"
                    showDots
                  />
                </View>
                <View style={vs.chartDateRow}>
                  <Text style={vs.chartDateLabel}>{dailyDates.length > 0 ? dailyDates[0].slice(5) : ''}</Text>
                  <Text style={[vs.chartDateLabel, { color: '#F59E0B', fontWeight: '700' }]}>{periodCTR}%</Text>
                  <Text style={vs.chartDateLabel}>{dailyDates.length > 0 ? dailyDates[dailyDates.length - 1].slice(5) : ''}</Text>
                </View>
              </View>
            </View>
          ) : null}
        </>
      )}
    </>
  );
}

const vs = StyleSheet.create({
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodChip: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  periodChipText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  loadingWrap: { alignItems: 'center', paddingVertical: 48 },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 15, color: '#94A3B8' },
  // KPIs
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  kpiCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  kpiValue: { fontSize: 22, fontWeight: '900', color: '#0F172A' },
  kpiLabel: { fontSize: 10, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' },
  // Reach
  reachCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  reachLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reachLabel: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  reachSub: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  reachValue: { fontSize: 28, fontWeight: '900' },
  // Section
  sectionCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 14 },
  noDataText: { fontSize: 13, color: '#94A3B8', textAlign: 'center', paddingVertical: 12 },
  // Page rows
  pageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  pageIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pageInfo: { flex: 1, gap: 4 },
  pageName: { fontSize: 13, fontWeight: '600', color: '#334155' },
  pageBarTrack: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
  pageBarFill: { height: '100%', borderRadius: 3 },
  pageValues: { alignItems: 'flex-end' },
  pageCount: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  pagePct: { fontSize: 10, fontWeight: '600', color: '#94A3B8' },
  // Click rows
  clickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  clickLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: '#334155' },
  clickValue: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  // Charts
  chartBlock: {},
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  chartLegendDot: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
  chartDot: { width: 8, height: 8, borderRadius: 4 },
  chartLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#334155' },
  chartTotal: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  chartContainer: { alignItems: 'center' },
  chartDateRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4, paddingHorizontal: 4 },
  chartDateLabel: { fontSize: 9, fontWeight: '500', color: '#94A3B8' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, maxWidth: 640, alignSelf: 'center' as const, width: '100%' },
  // Hero
  hero: { alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20, position: 'relative' },
  heroAvatar: { width: 72, height: 72, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  heroAvatarLetter: { fontSize: 30, fontWeight: '800', color: '#FFF' },
  heroAvatarBadge: { position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  heroName: { fontSize: 22, fontWeight: '800', color: '#FFF', marginTop: 12 },
  heroBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginTop: 6 },
  heroBadgeText: { fontSize: 11, fontWeight: '700', color: '#FFF', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroBio: { fontSize: 13, color: 'rgba(255,255,255,0.8)', marginTop: 8, textAlign: 'center', lineHeight: 18 },
  // Tabs
  tabBar: { flexDirection: 'row', backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingHorizontal: 8 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, gap: 2 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#7C3AED' },
  tabText: { fontSize: 11, fontWeight: '600', color: theme.textMuted },
  tabBadge: { position: 'absolute', top: -4, right: -8, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  tabBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF' },
  // Period
  periodRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  periodChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  periodChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  // Stats Grid
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statCard: { width: '48%', flexGrow: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  statIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { fontSize: 26, fontWeight: '900', color: theme.textPrimary },
  statLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, marginTop: 2 },
  // Total
  totalCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  totalLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  totalValue: { fontSize: 22, fontWeight: '900' },
  // Section card
  sectionCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  sectionCardTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 12 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  breakdownLabel: { flex: 1, fontSize: 14, fontWeight: '500', color: theme.textSecondary },
  breakdownValue: { fontSize: 16, fontWeight: '800', color: theme.textPrimary },
  // Quick Links
  quickLinksRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  quickLink: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFF', borderRadius: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  quickLinkText: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  // Events
  eventsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  eventsCount: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  newEventBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  newEventBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  eventCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0', position: 'relative', paddingRight: 36 },
  eventCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  eventStatusDot: { width: 8, height: 8, borderRadius: 4 },
  eventStatusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  eventDate: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  eventTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  eventMeta: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  eventMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  eventMetaText: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  publishedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#3B82F6', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  publishedBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  // Notifications
  notifCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFF', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  notifCardUnread: { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' },
  notifIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notifTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  notifMsg: { fontSize: 12, color: theme.textSecondary, marginTop: 2, lineHeight: 17 },
  notifTime: { fontSize: 11, color: theme.textMuted, marginTop: 4 },
  notifDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#3B82F6' },
  // Edit
  editPhotoSection: { alignItems: 'center', marginBottom: 24 },
  editPhotoBtn: { position: 'relative' },
  editPhotoCircle: { width: 88, height: 88, borderRadius: 26, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: '#E2E8F0' },
  editPhotoBadge: { position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  editPhotoHint: { fontSize: 12, color: theme.textMuted, marginTop: 8 },
  editField: { marginBottom: 16 },
  editLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  editLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 6 },
  editInput: { backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: theme.textPrimary, borderWidth: 1, borderColor: '#E2E8F0' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 16, borderRadius: 16, marginTop: 8 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 15, color: theme.textMuted },
  emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, marginTop: 8 },
  emptyCtaText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
