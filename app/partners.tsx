import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
  Dimensions,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { fetchDetailedBannerAnalytics, BannerDetailedAnalytics, fetchAmbassadorAnalytics, AmbassadorAnalytics } from '@/services/ambassadorAnalyticsService';
import { fetchSponsorsOnly, Ambassador, isUserSponsor } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';

import { useAuth } from '@/template';
import { getSupabaseClient } from '@/template';
import Svg, { Polyline, Circle as SvgCircle } from 'react-native-svg';

// Sponsored items count per partner
interface PartnerPublicStats {
  sponsoredTerrains: number;
  sponsoredClubs: number;
  sponsoredTournaments: number;
  sponsoredPlayers: number;
}

// Partner slot types
interface PartnerSlot {
  id: string;
  name: string;
  description: string;
  logo?: string;
  url?: string;
  category: 'gold' | 'silver' | 'bronze';
  isAvailable: boolean;
}

// Max slots per tier (available positions)
const SLOT_LIMITS = { gold: 2, silver: 3, bronze: -1 }; // -1 = unlimited

const CATEGORY_CONFIG = {
  gold: { icon: 'emoji-events' as const, color: '#D4A017', bg: '#FFF8E1', gradient: ['#F9E547', '#D4A017'] as [string, string], label: { fr: 'Or', en: 'Gold' } },
  silver: { icon: 'workspace-premium' as const, color: '#78909C', bg: '#ECEFF1', gradient: ['#CFD8DC', '#90A4AE'] as [string, string], label: { fr: 'Argent', en: 'Silver' } },
  bronze: { icon: 'military-tech' as const, color: '#A1887F', bg: '#EFEBE9', gradient: ['#D7CCC8', '#A1887F'] as [string, string], label: { fr: 'Bronze', en: 'Bronze' } },
};

const SOCIAL_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  youtube: { icon: 'play-arrow', color: '#FF0000', bg: '#FF000010', label: 'YouTube' },
  tiktok: { icon: 'music-note', color: '#010101', bg: '#01010108', label: 'TikTok' },
  instagram: { icon: 'camera-alt', color: '#E4405F', bg: '#E4405F10', label: 'Instagram' },
  twitter: { icon: 'alternate-email', color: '#1DA1F2', bg: '#1DA1F210', label: 'X' },
  website: { icon: 'language', color: '#6366F1', bg: '#6366F110', label: 'Web' },
};

// Mini Sparkline for ROI view
function MiniSparkline({ data, width, height, color }: { data: number[]; width: number; height: number; color: string }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * w;
    const y = pad + h - (v / max) * h;
    return `${x},${y}`;
  }).join(' ');
  const lastIdx = data.length - 1;
  const lastX = pad + (lastIdx / (data.length - 1)) * w;
  const lastY = pad + h - (data[lastIdx] / max) * h;
  return (
    <Svg width={width} height={height}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <SvgCircle cx={lastX} cy={lastY} r={3} fill={color} />
    </Svg>
  );
}



export default function PartnersScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);

  // Real partners from ambassadors table
  const [partners, setPartners] = useState<(Ambassador & { analytics?: AmbassadorAnalytics; publicStats?: PartnerPublicStats })[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(true);

  // ROI view state for sponsors/partners
  const [myAmbassadorRecord, setMyAmbassadorRecord] = useState<any | null>(null);
  const [roiData, setRoiData] = useState<BannerDetailedAnalytics | null>(null);
  const [roiPeriod, setRoiPeriod] = useState<7 | 30>(30);
  const [roiLoading, setRoiLoading] = useState(false);
  const [showRoi, setShowRoi] = useState(false);

  const [isSponsor, setIsSponsor] = useState(false);



  // Comparison state
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);

  // Check sponsor status for current user
  useEffect(() => {
    if (!user?.id) return;
    isUserSponsor(user.id).then(setIsSponsor);
  }, [user?.id]);

  // Load real partners and their public stats (sponsored items count)
  const loadPartners = useCallback(async () => {
    setPartnersLoading(true);
    try {
      const { ambassadors: sponsorPartners } = await fetchSponsorsOnly();
      // Load public stats: count sponsored items per partner
      const supabase = getSupabaseClient();
      const ids = sponsorPartners.map(p => p.id);
      const statsMap = new Map<string, PartnerPublicStats>();
      if (ids.length > 0) {
        const [tRes, cRes, toRes, plRes] = await Promise.all([
          supabase.from('terrains').select('sponsor_id').in('sponsor_id', ids),
          supabase.from('clubs').select('sponsor_id').in('sponsor_id', ids),
          supabase.from('tournaments').select('sponsor_id').in('sponsor_id', ids),
          supabase.from('players').select('sponsor_id').in('sponsor_id', ids).eq('is_public', true),
        ]);
        ids.forEach(id => statsMap.set(id, { sponsoredTerrains: 0, sponsoredClubs: 0, sponsoredTournaments: 0, sponsoredPlayers: 0 }));
        (tRes.data || []).forEach((r: any) => { const s = statsMap.get(r.sponsor_id); if (s) s.sponsoredTerrains++; });
        (cRes.data || []).forEach((r: any) => { const s = statsMap.get(r.sponsor_id); if (s) s.sponsoredClubs++; });
        (toRes.data || []).forEach((r: any) => { const s = statsMap.get(r.sponsor_id); if (s) s.sponsoredTournaments++; });
        (plRes.data || []).forEach((r: any) => { const s = statsMap.get(r.sponsor_id); if (s) s.sponsoredPlayers++; });
      }
      const withStats = sponsorPartners.map(p => ({
        ...p,
        publicStats: statsMap.get(p.id) || { sponsoredTerrains: 0, sponsoredClubs: 0, sponsoredTournaments: 0, sponsoredPlayers: 0 },
      }));
      setPartners(withStats);
    } catch { /* silent */ }
    setPartnersLoading(false);
  }, []);

  useEffect(() => { loadPartners(); }, [loadPartners]);

  // Load ambassador record for current user (only sponsors/partners get ROI view)
  useEffect(() => {
    if (!user?.id) return;
    const supabase = getSupabaseClient();
    supabase.from('ambassadors').select('*').eq('user_id', user.id).eq('is_active', true).maybeSingle().then(({ data }) => {
      if (data && (data.badge_type === 'sponsor' || data.badge_type === 'partner' || data.badge_type === 'gold_sponsor')) {
        setMyAmbassadorRecord(data);
        setShowRoi(true);
      }
    });
  }, [user?.id]);

  // Load ROI data when ambassador record is available
  useEffect(() => {
    if (!myAmbassadorRecord?.id) return;
    setRoiLoading(true);
    fetchDetailedBannerAnalytics(myAmbassadorRecord.id, roiPeriod).then(({ data }) => {
      setRoiData(data);
      setRoiLoading(false);
    });
  }, [myAmbassadorRecord?.id, roiPeriod]);
  const scrollViewRef = React.useRef<ScrollView>(null);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPartners();
    if (myAmbassadorRecord?.id) {
      const { data } = await fetchDetailedBannerAnalytics(myAmbassadorRecord.id, roiPeriod);
      setRoiData(data);
    }
    setRefreshing(false);
  };

  // Categorize real partners
  const getTierForBadge = (badgeType: string): 'gold' | 'silver' | 'bronze' => {
    if (badgeType === 'gold_sponsor') return 'gold';
    if (badgeType === 'sponsor') return 'silver';
    return 'bronze';
  };

  const goldPartners = partners.filter(p => getTierForBadge(p.badgeType) === 'gold');
  const silverPartners = partners.filter(p => getTierForBadge(p.badgeType) === 'silver');
  const bronzePartners = partners.filter(p => getTierForBadge(p.badgeType) === 'bronze');

  const renderPartnerCategory = (
    filledPartners: (Ambassador & { analytics?: AmbassadorAnalytics })[],
    category: 'gold' | 'silver' | 'bronze',
    sectionDelay: number
  ) => {
    const cfg = CATEGORY_CONFIG[category];
    const isGold = category === 'gold';
    const maxSlots = SLOT_LIMITS[category];
    const isUnlimited = maxSlots < 0;
    const emptyCount = isUnlimited ? 0 : Math.max(0, maxSlots - filledPartners.length);

    return (
      <Animated.View key={category} entering={FadeInDown.duration(400).delay(sectionDelay)} style={styles.partnerCategoryBlock}>
        {/* Category header */}
        <View style={styles.partnerCatHeader}>
          <LinearGradient colors={cfg.gradient} style={styles.partnerCatIconBg}>
            <MaterialIcons name={cfg.icon} size={isGold ? 18 : 16} color="#FFF" />
          </LinearGradient>
          <Text style={[styles.partnerCatTitle, { color: cfg.color }]}>
            {cfg.label[language]}
          </Text>
          <View style={[styles.partnerCatCountBadge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.partnerCatCountText, { color: cfg.color }]}>{isUnlimited ? `${filledPartners.length}` : `${filledPartners.length}/${maxSlots}`}</Text>
          </View>
        </View>

        {/* Grid: real partners + empty slots */}
        <View style={[styles.partnerSlotsGrid, isGold && styles.partnerSlotsGridGold]}>
          {filledPartners.map((partner, idx) => {
            const brandCol = partner.brandColor || cfg.color;
            const ps = partner.publicStats;
            const totalSponsored = (ps?.sponsoredTerrains || 0) + (ps?.sponsoredClubs || 0) + (ps?.sponsoredTournaments || 0) + (ps?.sponsoredPlayers || 0);
            const memberSince = partner.createdAt ? new Date(partner.createdAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: 'numeric' }) : null;
            return (
            <Animated.View
              key={partner.id}
              entering={FadeIn.duration(300).delay(sectionDelay + 100 + idx * 60)}
              style={[styles.partnerSlotCard, isGold && styles.partnerSlotCardGold, styles.partnerSlotCardModern, { borderColor: brandCol + '20', borderTopColor: brandCol }]}
            >
              <Pressable
                style={({ pressed }) => [{ alignItems: 'center' as const, width: '100%' }, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  if (compareMode) {
                    setCompareSelection(prev => prev.includes(partner.id) ? prev.filter(x => x !== partner.id) : prev.length < 2 ? [...prev, partner.id] : prev);
                    return;
                  }
                  trackAmbassadorEvent(partner.id, 'profile_view', undefined, { sourcePage: 'partners' });
                  router.push(`/partner/${partner.id}` as any);
                }}
              >
                {/* Logo with brand color ring */}
                <View style={{ position: 'relative' as const, marginBottom: 10 }}>
                  {partner.photo ? (
                    <View style={[{ borderWidth: 3, borderColor: brandCol + '50', borderRadius: isGold ? 28 : 24, ...Platform.select({ ios: { shadowColor: brandCol, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 }, android: { elevation: 4 }, default: {} }) }]}>
                      <Image source={{ uri: partner.photo }} style={[styles.partnerLogo, isGold && styles.partnerLogoGold, { marginBottom: 0 }]} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                    </View>
                  ) : (
                    <LinearGradient colors={[brandCol, brandCol + 'CC']} style={[styles.partnerLogoFallback, isGold && styles.partnerLogoGold, { marginBottom: 0, ...Platform.select({ ios: { shadowColor: brandCol, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8 }, android: { elevation: 4 }, default: {} }) }]}>
                      <MaterialIcons name={cfg.icon} size={isGold ? 36 : 28} color="#FFF" />
                    </LinearGradient>
                  )}
                  {/* Tier icon overlay */}
                  <View style={{ position: 'absolute', bottom: -4, right: -4, width: 26, height: 26, borderRadius: 13, backgroundColor: cfg.color, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: '#FFF' }}>
                    <MaterialIcons name={cfg.icon} size={12} color="#FFF" />
                  </View>
                </View>
                <Text style={[styles.partnerSlotTitle, { color: theme.textPrimary, fontWeight: '700', fontSize: 14 }]} numberOfLines={1}>
                  {partner.displayName}
                </Text>
                {/* Tier badge with brand color */}
                <View style={[styles.partnerTierBadge, { backgroundColor: brandCol }]}>
                  <MaterialIcons name={cfg.icon} size={8} color="#FFF" />
                  <Text style={styles.partnerTierBadgeText}>{cfg.label[language].toUpperCase()}</Text>
                </View>
                {/* Public stats: sponsored items + member since */}
                <View style={{ width: '100%', marginTop: 4, marginBottom: 4, gap: 4 }}>
                  {totalSponsored > 0 ? (
                    <View style={[styles.partnerStatsRow, { justifyContent: 'center' }]}>
                      {(ps?.sponsoredTerrains || 0) > 0 ? (
                        <View style={[styles.partnerStatChip, { backgroundColor: '#22C55E08', borderWidth: 1, borderColor: '#22C55E15' }]}>
                          <MaterialIcons name="sports-soccer" size={10} color="#22C55E" />
                          <Text style={styles.partnerStatText}>{ps!.sponsoredTerrains}</Text>
                        </View>
                      ) : null}
                      {(ps?.sponsoredClubs || 0) > 0 ? (
                        <View style={[styles.partnerStatChip, { backgroundColor: '#7C3AED08', borderWidth: 1, borderColor: '#7C3AED15' }]}>
                          <MaterialIcons name="home" size={10} color="#7C3AED" />
                          <Text style={styles.partnerStatText}>{ps!.sponsoredClubs}</Text>
                        </View>
                      ) : null}
                      {(ps?.sponsoredTournaments || 0) > 0 ? (
                        <View style={[styles.partnerStatChip, { backgroundColor: '#F59E0B08', borderWidth: 1, borderColor: '#F59E0B15' }]}>
                          <MaterialIcons name="emoji-events" size={10} color="#F59E0B" />
                          <Text style={styles.partnerStatText}>{ps!.sponsoredTournaments}</Text>
                        </View>
                      ) : null}
                      {(ps?.sponsoredPlayers || 0) > 0 ? (
                        <View style={[styles.partnerStatChip, { backgroundColor: '#3B82F608', borderWidth: 1, borderColor: '#3B82F615' }]}>
                          <MaterialIcons name="person" size={10} color="#3B82F6" />
                          <Text style={styles.partnerStatText}>{ps!.sponsoredPlayers}</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {memberSince ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <MaterialIcons name="verified" size={10} color={brandCol} />
                      <Text style={{ fontSize: 9, fontWeight: '600', color: brandCol }}>{language === 'fr' ? 'Depuis' : 'Since'} {memberSince}</Text>
                    </View>
                  ) : null}
                </View>
                {/* Bio preview */}
                {partner.bio ? (
                  <Text style={{ fontSize: 11, color: theme.textSecondary, textAlign: 'center', lineHeight: 16, marginBottom: 4, paddingHorizontal: 4 }} numberOfLines={2}>{partner.bio}</Text>
                ) : null}
                {/* Social icons row */}
                {(partner.youtubeUrl || partner.instagramHandle || partner.tiktokUrl || partner.twitterHandle || partner.websiteUrl) ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
                    {partner.youtubeUrl ? <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#FF000008', alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="play-arrow" size={12} color="#FF0000" /></View> : null}
                    {partner.instagramHandle ? <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#E4405F08', alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="camera-alt" size={12} color="#E4405F" /></View> : null}
                    {partner.tiktokUrl ? <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#01010106', alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="music-note" size={12} color="#010101" /></View> : null}
                    {partner.twitterHandle ? <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#1DA1F208', alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="alternate-email" size={12} color="#1DA1F2" /></View> : null}
                    {partner.websiteUrl ? <View style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: '#6366F108', alignItems: 'center', justifyContent: 'center' }}><MaterialIcons name="language" size={12} color="#6366F1" /></View> : null}
                  </View>
                ) : null}
                {/* Action buttons */}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                  {partner.websiteUrl ? (
                    <Pressable
                      style={({ pressed }) => [styles.partnerSlotBtn, { borderColor: brandCol + '40', flex: 1 }, pressed && { opacity: 0.7 }]}
                      onPress={(e) => { e.stopPropagation(); Haptics.selectionAsync(); Linking.openURL(partner.websiteUrl!.startsWith('http') ? partner.websiteUrl! : `https://${partner.websiteUrl}`); }}
                    >
                      <MaterialIcons name="open-in-new" size={12} color={brandCol} />
                      <Text style={[styles.partnerSlotBtnText, { color: brandCol }]}>
                        {language === 'fr' ? 'Visiter' : 'Visit'}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={({ pressed }) => [styles.partnerSlotBtn, { borderColor: brandCol + '40' }, pressed && { opacity: 0.7 }]}
                    onPress={(e) => {
                      e.stopPropagation();
                      Haptics.selectionAsync();
                      router.push(`/partner/${partner.id}` as any);
                    }}
                  >
                    <MaterialIcons name="info-outline" size={12} color={brandCol} />
                    <Text style={[styles.partnerSlotBtnText, { color: brandCol }]}>{language === 'fr' ? 'Profil' : 'Profile'}</Text>
                  </Pressable>
                </View>
                {compareMode ? (
                  <View style={[styles.compareCheckbox, compareSelection.includes(partner.id) && styles.compareCheckboxActive]}>
                    {compareSelection.includes(partner.id) ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}
                  </View>
                ) : null}
              </Pressable>
            </Animated.View>
            );
          })}
          {/* Empty slots */}
          {Array.from({ length: emptyCount }).map((_, idx) => (
            <Animated.View
              key={`empty-${category}-${idx}`}
              entering={FadeIn.duration(300).delay(sectionDelay + 100 + (filledPartners.length + idx) * 60)}
              style={[styles.partnerSlotCard, isGold && styles.partnerSlotCardGold, { borderColor: cfg.color + '20' }]}
            >
              <View style={[styles.partnerSlotIconBg, { backgroundColor: cfg.bg }]}>
                <MaterialIcons name={cfg.icon} size={isGold ? 28 : 22} color={cfg.color} />
              </View>
              <Text style={styles.partnerSlotTitle}>
                {language === 'fr' ? 'Disponible' : 'Available'}
              </Text>
              <Text style={styles.partnerSlotCategory}>{cfg.label[language]}</Text>
              <Pressable
                style={({ pressed }) => [styles.partnerSlotBtn, { borderColor: cfg.color + '40' }, pressed && { opacity: 0.75 }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  Linking.openURL('mailto:ultimate.petanque.app@gmail.com?subject=Partenariat%20Ultimate%20Petanque%20-%20' + encodeURIComponent(cfg.label.fr));
                }}
              >
                <MaterialIcons name="email" size={12} color={cfg.color} />
                <Text style={[styles.partnerSlotBtnText, { color: cfg.color }]}>
                  {language === 'fr' ? 'Nous contacter' : 'Contact us'}
                </Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Minimal header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <MaterialIcons name="handshake" size={18} color={theme.primary} />
          <Text style={styles.headerTitle}>{language === 'fr' ? 'Nos Partenaires' : 'Our Partners'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {isSponsor ? (
            <Pressable
              style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: '#D4A01715', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => router.push('/sponsor-portal' as any)}
              hitSlop={4}
            >
              <MaterialIcons name="dashboard" size={20} color="#D4A017" />
            </Pressable>
          ) : <View style={{ width: 40 }} />}
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }, isTablet && styles.scrollContentTablet]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#7C3AED" colors={['#7C3AED']} />}
      >
        {/* ====== HERO SECTION ====== */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <LinearGradient
            colors={['#1E3A8A', '#2563EB', '#3B82F6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroGradient}
          >
            <View style={styles.heroDecoCircle1} />
            <View style={styles.heroDecoCircle2} />
            <View style={styles.heroContent}>
              <View style={styles.heroIconWrap}>
                <MaterialIcons name="handshake" size={32} color="#FFF" />
              </View>
              <Text style={styles.heroTitle}>{language === 'fr' ? 'Nos Partenaires' : 'Our Partners'}</Text>
              <Text style={styles.heroSubtitle}>
                {language === 'fr'
                  ? 'Soutenez la communaute Ultimate Petanque en devenant partenaire ou sponsor'
                  : 'Support the Ultimate Petanque community by becoming a partner or sponsor'}
              </Text>
              <View style={styles.heroPillsRow}>
                <View style={styles.heroPill}>
                  <MaterialIcons name="handshake" size={14} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.heroPillText}>{SLOT_LIMITS.gold + SLOT_LIMITS.silver + SLOT_LIMITS.bronze} {language === 'fr' ? 'emplacements' : 'slots'}</Text>
                </View>
              </View>

            </View>
          </LinearGradient>
        </Animated.View>

        {/* ====== SPONSOR/PARTNER ROI VIEW ====== */}
        {showRoi && myAmbassadorRecord ? (
          <Animated.View entering={FadeInDown.duration(400).delay(80)} style={roiStyles.container}>
            <View style={roiStyles.header}>
              <View style={roiStyles.headerIcon}>
                <MaterialIcons name={myAmbassadorRecord.badge_type === 'sponsor' ? 'campaign' : 'handshake'} size={20} color={myAmbassadorRecord.badge_type === 'sponsor' ? '#F59E0B' : '#8B5CF6'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={roiStyles.headerTitle}>{language === 'fr' ? 'Votre visibilite' : 'Your visibility'}</Text>
                <Text style={roiStyles.headerSub}>{myAmbassadorRecord.display_name}</Text>
              </View>
              <View style={roiStyles.periodRow}>
                {([7, 30] as const).map(p => (
                  <Pressable key={p} style={[roiStyles.periodChip, roiPeriod === p && roiStyles.periodChipActive]} onPress={() => { Haptics.selectionAsync(); setRoiPeriod(p); }}>
                    <Text style={[roiStyles.periodChipText, roiPeriod === p && { color: '#FFF' }]}>{p}{language === 'fr' ? 'j' : 'd'}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {roiLoading ? (
              <View style={{ alignItems: 'center', paddingVertical: 24 }}><ActivityIndicator size="small" color="#7C3AED" /></View>
            ) : roiData ? (() => {
              const dailyImp = roiData.dailyImpressions.slice(-roiPeriod);
              const dailyClk = roiData.dailyClicks.slice(-roiPeriod);
              const totalImp = dailyImp.reduce((s, v) => s + v, 0);
              const totalClk = dailyClk.reduce((s, v) => s + v, 0);
              const ctr = totalImp > 0 ? Math.round((totalClk / totalImp) * 1000) / 10 : 0;
              const chartW = Math.min(screenWidth - 120, 200);
              return (
                <>
                  <View style={roiStyles.kpiRow}>
                    <View style={roiStyles.kpiCard}>
                      <MaterialIcons name="visibility" size={16} color="#3B82F6" />
                      <Text style={roiStyles.kpiValue}>{totalImp}</Text>
                      <Text style={roiStyles.kpiLabel}>{language === 'fr' ? 'Impressions' : 'Impressions'}</Text>
                    </View>
                    <View style={roiStyles.kpiCard}>
                      <MaterialIcons name="touch-app" size={16} color="#10B981" />
                      <Text style={roiStyles.kpiValue}>{totalClk}</Text>
                      <Text style={roiStyles.kpiLabel}>{language === 'fr' ? 'Clics' : 'Clicks'}</Text>
                    </View>
                    <View style={roiStyles.kpiCard}>
                      <MaterialIcons name="percent" size={16} color="#F59E0B" />
                      <Text style={[roiStyles.kpiValue, { color: '#F59E0B' }]}>{ctr}%</Text>
                      <Text style={roiStyles.kpiLabel}>CTR</Text>
                    </View>
                    <View style={roiStyles.kpiCard}>
                      <MaterialIcons name="people" size={16} color="#7C3AED" />
                      <Text style={[roiStyles.kpiValue, { color: '#7C3AED' }]}>{roiData.uniqueViewers}</Text>
                      <Text style={roiStyles.kpiLabel}>{language === 'fr' ? 'Portee' : 'Reach'}</Text>
                    </View>
                  </View>
                  <View style={roiStyles.sparkRow}>
                    <View style={roiStyles.sparkBlock}>
                      <View style={roiStyles.sparkHeader}>
                        <View style={[roiStyles.sparkDot, { backgroundColor: '#3B82F6' }]} />
                        <Text style={roiStyles.sparkLabel}>{language === 'fr' ? 'Impressions' : 'Impressions'}</Text>
                        <Text style={[roiStyles.sparkTotal, { color: '#3B82F6' }]}>{totalImp}</Text>
                      </View>
                      <MiniSparkline data={dailyImp} width={chartW} height={36} color="#3B82F6" />
                    </View>
                    <View style={roiStyles.sparkBlock}>
                      <View style={roiStyles.sparkHeader}>
                        <View style={[roiStyles.sparkDot, { backgroundColor: '#10B981' }]} />
                        <Text style={roiStyles.sparkLabel}>{language === 'fr' ? 'Clics' : 'Clicks'}</Text>
                        <Text style={[roiStyles.sparkTotal, { color: '#10B981' }]}>{totalClk}</Text>
                      </View>
                      <MiniSparkline data={dailyClk} width={chartW} height={36} color="#10B981" />
                    </View>
                  </View>
                  <Pressable style={roiStyles.portalLink} onPress={() => router.push('/sponsor-portal' as any)}>
                    <MaterialIcons name="dashboard" size={16} color="#7C3AED" />
                    <Text style={roiStyles.portalLinkText}>{language === 'fr' ? 'Portail Partenaires' : 'Partner Portal'}</Text>
                    <MaterialIcons name="chevron-right" size={16} color="#7C3AED" />
                  </Pressable>
                </>
              );
            })() : (
              <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                <Text style={{ fontSize: 13, color: theme.textMuted }}>{language === 'fr' ? 'Aucune donnee' : 'No data'}</Text>
              </View>
            )}
          </Animated.View>
        ) : null}



        {/* ====== PARTNERS SECTION ====== */}
        <View style={styles.partnersSection}>
          {/* Section label */}
          <Animated.View entering={FadeIn.duration(300).delay(200)} style={styles.sectionLabel}>
            <View style={styles.sectionLabelLine} />
            <Text style={styles.sectionLabelText}>{language === 'fr' ? 'PARTENAIRES & SPONSORS' : 'PARTNERS & SPONSORS'}</Text>
            <View style={styles.sectionLabelLine} />
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(400).delay(250)} style={styles.partnerIntroCard}>
            <View style={styles.partnerIntroIcon}>
              <MaterialIcons name="handshake" size={24} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.partnerIntroTitle}>
                {language === 'fr' ? 'Soutenez la communaute' : 'Support the community'}
              </Text>
              <Text style={styles.partnerIntroDesc}>
                {language === 'fr'
                  ? 'Rejoignez-nous en tant que partenaire et touchez des milliers de joueurs passionnes.'
                  : 'Join us as a partner and reach thousands of passionate players.'}
              </Text>
            </View>
          </Animated.View>

          {partnersLoading ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : (
            <>
              {renderPartnerCategory(goldPartners, 'gold', 350)}
              {renderPartnerCategory(silverPartners, 'silver', 500)}
              {renderPartnerCategory(bronzePartners, 'bronze', 650)}
            </>
          )}
        </View>

        {/* ====== CTA SECTION ====== */}
        {!partnersLoading ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <LinearGradient
            colors={['#1E3A8A', '#2563EB']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ctaGradient}
          >
            <View style={styles.ctaDecoCircle} />
            <View style={styles.ctaContent}>
              <View style={styles.ctaIconBg}>
                <MaterialIcons name="campaign" size={28} color="#FFF" />
              </View>
              <Text style={styles.ctaTitle}>
                {language === 'fr' ? 'Devenez partenaire' : 'Become a partner'}
              </Text>
              <Text style={styles.ctaDescription}>
                {language === 'fr'
                  ? 'Devenez partenaire ou sponsor et gagnez en visibilite aupres de la communaute petanque.'
                  : 'Become a partner or sponsor and gain visibility within the petanque community.'}
              </Text>

              <Pressable
                style={({ pressed }) => [{ flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: 'rgba(255,255,255,0.12)', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginBottom: 16, width: '100%' as any }, pressed && { opacity: 0.85 }]}
                onPress={() => { Haptics.selectionAsync(); router.push('/partner-program' as any); }}
              >
                <MaterialIcons name="info-outline" size={16} color="rgba(255,255,255,0.9)" />
                <Text style={{ fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.9)' }}>{language === 'fr' ? 'Voir le programme partenaire' : 'View partner program'}</Text>
                <MaterialIcons name="chevron-right" size={16} color="rgba(255,255,255,0.6)" />
              </Pressable>

              <View style={styles.ctaBenefits}>
                {[
                  { icon: 'visibility', text: language === 'fr' ? 'Visibilite in-app' : 'In-app visibility' },
                  { icon: 'people', text: language === 'fr' ? 'Communaute engagee' : 'Engaged community' },
                  { icon: 'verified', text: language === 'fr' ? 'Badge verifie' : 'Verified badge' },
                ].map((b, i) => (
                  <View key={i} style={styles.ctaBenefitItem}>
                    <View style={styles.ctaBenefitDot}>
                      <MaterialIcons name={b.icon as any} size={14} color="#FFF" />
                    </View>
                    <Text style={styles.ctaBenefitText}>{b.text}</Text>
                  </View>
                ))}
              </View>

              <Pressable
                style={({ pressed }) => [styles.ctaButton, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL('mailto:ultimate.petanque.app@gmail.com?subject=Partenariat%20Ultimate%20Petanque'); }}
              >
                <MaterialIcons name="email" size={18} color="#2563EB" />
                <Text style={styles.ctaButtonText}>{language === 'fr' ? 'Nous contacter' : 'Contact us'}</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </Animated.View>
        ) : null}
      </ScrollView>


    </SafeAreaView>
  );
}

const roiStyles = StyleSheet.create({
  container: { marginHorizontal: 16, marginTop: 20, backgroundColor: '#FFF', borderRadius: 20, padding: 18, borderWidth: 1.5, borderColor: '#7C3AED20', ...Platform.select({ ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  header: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 14 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#7C3AED12', alignItems: 'center' as const, justifyContent: 'center' as const },
  headerTitle: { fontSize: 16, fontWeight: '700' as const, color: '#0F172A' },
  headerSub: { fontSize: 12, color: '#7C3AED', fontWeight: '600' as const, marginTop: 1 },
  periodRow: { flexDirection: 'row' as const, gap: 4 },
  periodChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  periodChipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  periodChipText: { fontSize: 12, fontWeight: '700' as const, color: '#64748B' },
  kpiRow: { flexDirection: 'row' as const, gap: 8, marginBottom: 14 },
  kpiCard: { flex: 1, alignItems: 'center' as const, backgroundColor: '#F8FAFC', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  kpiValue: { fontSize: 20, fontWeight: '900' as const, color: '#0F172A', marginTop: 4 },
  kpiLabel: { fontSize: 9, fontWeight: '600' as const, color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' as const },
  sparkRow: { flexDirection: 'row' as const, gap: 10, marginBottom: 12 },
  sparkBlock: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  sparkHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 6 },
  sparkDot: { width: 8, height: 8, borderRadius: 4 },
  sparkLabel: { flex: 1, fontSize: 11, fontWeight: '600' as const, color: '#334155' },
  sparkTotal: { fontSize: 13, fontWeight: '800' as const },
  portalLink: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingVertical: 10, backgroundColor: '#7C3AED0A', borderRadius: 12, borderWidth: 1, borderColor: '#7C3AED18' },
  portalLinkText: { fontSize: 13, fontWeight: '600' as const, color: '#7C3AED' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFFFFFEE',
    borderBottomWidth: 1, borderBottomColor: '#7C3AED' + '10',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },

  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 0 },
  scrollContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%' },

  // ====== HERO ======
  heroGradient: {
    paddingTop: 32, paddingBottom: 36, paddingHorizontal: 24,
    position: 'relative' as const, overflow: 'hidden' as const,
  },
  heroDecoCircle1: {
    position: 'absolute', top: -40, right: -40, width: 160, height: 160,
    borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroDecoCircle2: {
    position: 'absolute', bottom: -20, left: -30, width: 100, height: 100,
    borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroContent: { alignItems: 'center', position: 'relative' as const, zIndex: 1 },
  heroIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#FFF', marginBottom: 10, textAlign: 'center' },
  heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 21, maxWidth: 340, marginBottom: 20 },
  heroPillsRow: { flexDirection: 'row', gap: 10 },
  heroPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  heroPillText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },

  // ====== SECTION LABEL ======
  sectionLabel: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, marginBottom: 18,
  },
  sectionLabelLine: { flex: 1, height: 1, backgroundColor: theme.border },
  sectionLabelText: {
    fontSize: 11, fontWeight: '700', color: theme.textMuted,
    letterSpacing: 1.5,
  },

  // ====== AMBASSADORS ======
  ambSection: { paddingHorizontal: 16, paddingTop: 24, marginBottom: 8 },
  ambCard: {
    backgroundColor: theme.surface, borderRadius: 20,
    marginBottom: 16, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 },
      android: { elevation: 3 },
      default: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
    }),
  },
  ambCardHighlight: { borderWidth: 2, borderColor: '#7C3AED' },
  ambAccentBar: { height: 4, width: '100%' },
  ambHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, paddingBottom: 0 },
  ambAvatarWrap: { position: 'relative' as const },
  ambAvatar: { width: 60, height: 60, borderRadius: 18, overflow: 'hidden' as const },
  ambAvatarLetter: { fontSize: 26, fontWeight: '800', color: '#FFF' },
  ambVerifiedBadge: {
    position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: theme.surface,
  },
  ambInfo: { flex: 1, minWidth: 0 },
  ambName: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  ambBadgeRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  ambBadgePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#7C3AED' + '0F', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    borderWidth: 1, borderColor: '#7C3AED' + '18',
  },
  ambBadgePillText: { fontSize: 10, fontWeight: '700', color: '#7C3AED' },
  ambMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
  ambArrowBtn: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#7C3AED' + '0C', alignItems: 'center', justifyContent: 'center',
  },
  ambBio: { fontSize: 13, color: theme.textSecondary, lineHeight: 20, paddingHorizontal: 18, marginTop: 12 },

  // Ambassador stats
  ambStatsRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 18, marginTop: 14,
    backgroundColor: '#F8F7FF', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8,
    borderWidth: 1, borderColor: '#7C3AED' + '08',
  },
  ambStatItem: { flex: 1, alignItems: 'center' },
  ambStatValue: { fontSize: 17, fontWeight: '800', color: theme.textPrimary },
  ambStatLabel: { fontSize: 9, color: theme.textMuted, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: 0.3 },
  ambStatDivider: { width: 1, height: 26, backgroundColor: '#7C3AED' + '12' },

  // Social chips
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 18, paddingTop: 14 },
  socialChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    borderWidth: 1,
  },
  socialChipText: { fontSize: 12, fontWeight: '600', maxWidth: 120 },

  // Loading / Empty
  loadingState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loadingText: { fontSize: 14, color: theme.textMuted },
  ambEmptyState: {
    alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24,
    marginHorizontal: 16, marginTop: 24,
    backgroundColor: theme.surface, borderRadius: 24,
    ...theme.shadows.card,
  },
  ambEmptyIconBg: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: '#7C3AED' + '0C', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: '#7C3AED' + '15',
  },
  ambEmptyTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  ambEmptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 20, maxWidth: 280 },
  ambEmptyBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#7C3AED', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14,
  },
  ambEmptyBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // ====== PODIUM ======
  podiumSection: { paddingHorizontal: 16, paddingTop: 20, marginBottom: 8 },
  podiumTabs: {
    flexDirection: 'row', gap: 8, marginBottom: 18, justifyContent: 'center',
  },
  podiumTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    backgroundColor: '#7C3AED' + '0C', borderWidth: 1.5, borderColor: '#7C3AED' + '18',
  },
  podiumTabActive: {
    backgroundColor: '#7C3AED', borderColor: '#7C3AED',
  },
  podiumTabText: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
  podiumTabTextActive: { color: '#FFF' },
  podiumRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center',
    gap: 8, paddingHorizontal: 8,
  },
  podiumCol: { flex: 1, alignItems: 'center' },
  podiumColGold: { marginTop: -16 },
  podiumCard: { alignItems: 'center', width: '100%' },
  podiumBar: {
    width: '100%', borderTopLeftRadius: 14, borderTopRightRadius: 14,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 8,
    flexDirection: 'row', gap: 4, minHeight: 40,
  },
  podiumBarGold: { backgroundColor: '#D4A017', minHeight: 56 },
  podiumBarSilver: { backgroundColor: '#90A4AE', minHeight: 44 },
  podiumBarBronze: { backgroundColor: '#A1887F', minHeight: 36 },
  podiumRank: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  podiumAvatarWrap: {
    marginTop: -22, marginBottom: 8,
    borderRadius: 22, borderWidth: 3, borderColor: '#FFF',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 },
      android: { elevation: 4 },
      default: {},
    }),
  },
  podiumAvatarWrapGold: { marginTop: -28, borderWidth: 3, borderColor: '#FEF3C7' },
  podiumAvatar: { width: 44, height: 44, borderRadius: 19, overflow: 'hidden' as const },
  podiumAvatarGold: { width: 56, height: 56, borderRadius: 24, overflow: 'hidden' as const },
  podiumAvatarLetter: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  podiumName: { fontSize: 12, fontWeight: '700', color: theme.textPrimary, textAlign: 'center', maxWidth: '100%' },
  podiumValue: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  podiumMetric: { fontSize: 9, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.3, marginTop: 1 },

  // ====== PARTNERS ======
  partnersSection: { paddingTop: 16, marginBottom: 8 },
  partnerIntroCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: 16, marginBottom: 24,
    backgroundColor: theme.surface, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: theme.primary + '12',
    ...theme.shadows.card,
  },
  partnerIntroIcon: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: theme.primary + '0C', alignItems: 'center', justifyContent: 'center',
  },
  partnerIntroTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 },
  partnerIntroDesc: { fontSize: 12, color: theme.textSecondary, lineHeight: 18 },

  // Partner category
  partnerCategoryBlock: { marginBottom: 20, paddingHorizontal: 16 },
  partnerCatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  partnerCatIconBg: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  partnerCatTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  partnerCatCountBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  partnerCatCountText: { fontSize: 10, fontWeight: '700' },

  // Partner slots grid
  partnerSlotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  partnerSlotsGridGold: {},
  partnerSlotCard: {
    flex: 1, minWidth: 160,
    backgroundColor: theme.surface, borderRadius: 16,
    padding: 16, alignItems: 'center',
    borderWidth: 1.5, borderStyle: 'dashed' as any,
    ...theme.shadows.card,
  },
  partnerSlotCardGold: { minWidth: 180, paddingVertical: 24 },
  partnerSlotCardModern: {
    borderStyle: 'solid' as any,
    borderTopWidth: 3.5,
    overflow: 'hidden' as const,
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.08, shadowRadius: 16 },
      android: { elevation: 5 },
      default: {},
    }),
  },
  partnerSlotIconBg: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  partnerSlotTitle: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 2 },
  partnerSlotCategory: { fontSize: 11, color: theme.textMuted, marginBottom: 12 },
  partnerLogo: { width: 80, height: 80, borderRadius: 22, overflow: 'hidden' as const, marginBottom: 10 },
  partnerLogoGold: { width: 96, height: 96, borderRadius: 26, overflow: 'hidden' as const },
  partnerLogoFallback: { width: 80, height: 80, borderRadius: 22, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 10, overflow: 'hidden' as const },
  partnerTierBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, marginTop: 4, marginBottom: 6 },
  partnerTierBadgeText: { fontSize: 8, fontWeight: '900' as const, color: '#FFF', letterSpacing: 0.5 },
  partnerStatsRow: { flexDirection: 'row' as const, gap: 8, marginBottom: 8 },
  partnerStatChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  partnerStatText: { fontSize: 11, fontWeight: '700' as const, color: theme.textPrimary },
  partnerSlotBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5,
  },
  partnerSlotBtnText: { fontSize: 11, fontWeight: '600' },

  // ====== CTA ======
  ctaGradient: {
    marginHorizontal: 16, marginBottom: 8, borderRadius: 24,
    overflow: 'hidden', position: 'relative' as const,
  },
  ctaDecoCircle: {
    position: 'absolute', top: -20, right: -20, width: 120, height: 120,
    borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)',
  },
  ctaContent: { alignItems: 'center', padding: 28, position: 'relative' as const, zIndex: 1 },
  ctaIconBg: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  ctaTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 10, textAlign: 'center' },
  ctaDescription: { fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 20, marginBottom: 20, maxWidth: 320 },
  ctaBenefits: { gap: 10, marginBottom: 24, width: '100%' },
  ctaBenefitItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ctaBenefitDot: {
    width: 30, height: 30, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center',
  },
  ctaBenefitText: { fontSize: 14, fontWeight: '500', color: 'rgba(255,255,255,0.9)' },
  ctaButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#FFF', paddingVertical: 16, paddingHorizontal: 32,
    borderRadius: 16, width: '100%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 },
      android: { elevation: 4 },
      default: {},
    }),
  },
  ctaButtonText: { fontSize: 16, fontWeight: '700', color: '#2563EB' },
  // Comparison
  compareCheckbox: { position: 'absolute' as const, top: 8, right: 8, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: '#FFF', alignItems: 'center' as const, justifyContent: 'center' as const },
  compareCheckboxActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  compareBar: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 8 }, android: { elevation: 8 }, default: {} }) },
  compareBarContent: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
  compareBarText: { flex: 1, fontSize: 13, fontWeight: '600' as const, color: '#7C3AED' },
  compareBarClose: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center' as const, justifyContent: 'center' as const },
  compareHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  compareHeaderText: { fontSize: 15, fontWeight: '700' as const, color: '#0F172A' },
  compareRow: { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 10 },
  compareCell: { flex: 1, alignItems: 'center' as const, gap: 4 },
  compareLabelCell: { width: 70, alignItems: 'center' as const },
  compareName: { fontSize: 13, fontWeight: '700' as const, color: '#0F172A', textAlign: 'center' as const },
  compareLabelText: { fontSize: 10, fontWeight: '600' as const, color: '#94A3B8', textAlign: 'center' as const },
  compareValue: { fontSize: 18, fontWeight: '700' as const, color: '#64748B' },
  compareBarTrack: { width: '80%' as any, height: 5, backgroundColor: '#F1F5F9', borderRadius: 2.5, overflow: 'hidden' as const },
  compareBarFill: { height: '100%' as any, borderRadius: 2.5 },
  compareResetBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 10, marginTop: 6, backgroundColor: '#7C3AED0A', borderRadius: 10 },
  compareResetText: { fontSize: 12, fontWeight: '600' as const, color: '#7C3AED' },
});
