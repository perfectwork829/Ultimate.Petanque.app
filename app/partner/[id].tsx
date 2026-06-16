import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Linking, Dimensions,
  ActivityIndicator, Platform, Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import QRCode from 'react-native-qrcode-svg';
import * as Haptics from '@/services/haptics';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { getSupabaseClient } from '@/template';
import { useAuth } from '@/template';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import { SponsoredEvent } from '@/services/sponsoredEventService';

const GALLERY_PLACEHOLDER_HEIGHT = 220;

const SOCIAL_CONFIG: Record<string, { icon: string; color: string; label: string; bg: string }> = {
  youtube: { icon: 'play-arrow', color: '#FF0000', bg: '#FF000008', label: 'YouTube' },
  tiktok: { icon: 'music-note', color: '#010101', bg: '#01010106', label: 'TikTok' },
  instagram: { icon: 'camera-alt', color: '#E4405F', bg: '#E4405F08', label: 'Instagram' },
  twitter: { icon: 'alternate-email', color: '#1DA1F2', bg: '#1DA1F208', label: 'X / Twitter' },
  website: { icon: 'language', color: '#6366F1', bg: '#6366F108', label: 'Site web' },
};

export default function PartnerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const fr = language === 'fr';
  const { user } = useAuth();
  const supabase = getSupabaseClient();

  const [loading, setLoading] = useState(true);
  const [partner, setPartner] = useState<any | null>(null);
  const [events, setEvents] = useState<SponsoredEvent[]>([]);
  const [codeCopied, setCodeCopied] = useState(false);
  const [sponsoredPlayers, setSponsoredPlayers] = useState<any[]>([]);
  const [loadingSponsoredPlayers, setLoadingSponsoredPlayers] = useState(false);
  const [sponsoredTerrains, setSponsoredTerrains] = useState<any[]>([]);
  const [sponsoredClubs, setSponsoredClubs] = useState<any[]>([]);
  const [sponsoredTournaments, setSponsoredTournaments] = useState<any[]>([]);
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0);

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);

  const loadPartner = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('ambassadors')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();
      setPartner(data);

      if (data) {
        trackAmbassadorEvent(data.id, 'profile_view', undefined, { sourcePage: 'partner_detail' });

        // Set gallery photos
        if (data.gallery_photos && Array.isArray(data.gallery_photos) && data.gallery_photos.length > 0) {
          setGalleryPhotos(data.gallery_photos.filter((p: string) => p && p.startsWith('http')));
        }

        // Load sponsored items in parallel
        setLoadingSponsoredPlayers(true);
        const [plRes, tRes, cRes, toRes, evtsRes] = await Promise.all([
          supabase.from('players').select('id, name, avatar, city, elo_rating, role, stats').eq('sponsor_id', data.id).eq('is_public', true).limit(20),
          supabase.from('terrains').select('id, name, city, type, is_public').eq('sponsor_id', data.id).limit(20),
          supabase.from('clubs').select('id, name, city, logo, members_count, is_public').eq('sponsor_id', data.id).limit(20),
          supabase.from('tournaments').select('id, name, date, format, status, is_public').eq('sponsor_id', data.id).order('date', { ascending: false }).limit(20),
          supabase.from('sponsored_events').select('*').eq('ambassador_id', data.id).order('event_date', { ascending: false }).limit(5),
        ]);
        setSponsoredPlayers(plRes.data || []);
        setSponsoredTerrains(tRes.data || []);
        setSponsoredClubs(cRes.data || []);
        setSponsoredTournaments(toRes.data || []);
        setLoadingSponsoredPlayers(false);

        if (evtsRes.data) {
          setEvents(evtsRes.data.map((e: any) => ({
            id: e.id, ambassadorId: e.ambassador_id, creatorUserId: e.creator_user_id,
            title: e.title, description: e.description, challengeType: e.challenge_type,
            challengeMode: e.challenge_mode, eventDate: e.event_date, startTime: e.start_time,
            endTime: e.end_time, scope: e.scope, terrainId: e.terrain_id, terrainName: e.terrain_name,
            city: e.city, country: e.country, maxParticipants: e.max_participants,
            minWitnesses: e.min_witnesses, status: e.status, shareCode: e.share_code,
            resultsPublished: e.results_published,
          })));
        }
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [id, supabase, fr]);

  useEffect(() => { loadPartner(); }, [loadPartner]);

  const handleShare = async () => {
    if (!partner) return;
    Haptics.selectionAsync();
    try {
      await Share.share({
        message: `${partner.display_name} - ${fr ? 'Partenaire' : 'Partner'} Ultimate Petanque\nhttps://ultimatepetanque.app/partners?id=${partner.id}`,
      });
    } catch { /* silent */ }
  };

  const handleSocialPress = (platform: string, url: string) => {
    if (!partner) return;
    Haptics.selectionAsync();
    trackAmbassadorEvent(partner.id, 'social_click', platform, { sourcePage: 'partner_detail' });
    Linking.openURL(url);
  };

  const handleCopyCode = async () => {
    if (!partner?.referral_code) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(partner.referral_code);
    } catch { /* silent */ }
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.loadingWrap}><ActivityIndicator size="large" color="#D4A017" /></View>
      </SafeAreaView>
    );
  }

  if (!partner) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.headerRow}>
          <Pressable style={st.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>{fr ? 'Partenaire' : 'Partner'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={st.loadingWrap}>
          <MaterialIcons name="search-off" size={48} color={theme.textMuted} />
          <Text style={st.emptyText}>{fr ? 'Partenaire non trouve' : 'Partner not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isGold = partner.badge_type === 'gold_sponsor';
  const isSilver = partner.badge_type === 'sponsor';
  const tierColor = partner.brand_color || (isGold ? '#D4A017' : isSilver ? '#78909C' : '#A1887F');
  const tierLabel = isGold ? (fr ? 'Partenaire Or' : 'Gold Partner') : isSilver ? (fr ? 'Partenaire Argent' : 'Silver Partner') : (fr ? 'Partenaire Bronze' : 'Bronze Partner');
  const tierGradient: [string, string] = isGold ? ['#78350F', '#D4A017'] : isSilver ? ['#334155', '#78909C'] : ['#44403C', '#A1887F'];
  const tierIcon = isGold ? 'emoji-events' : isSilver ? 'workspace-premium' : 'military-tech';

  const totalSponsoredItems = sponsoredTerrains.length + sponsoredClubs.length + sponsoredTournaments.length + sponsoredPlayers.length;

  // Tier advantages for public display
  const tierAdvantages: { icon: string; text: string }[] = isGold ? [
    { icon: 'star', text: fr ? 'Banniere sponsor sur les fiches' : 'Sponsor banner on detail pages' },
    { icon: 'people', text: fr ? 'Sponsoring de joueurs' : 'Player sponsoring' },
    { icon: 'map', text: fr ? 'Marqueurs carte distinctifs' : 'Distinctive map markers' },
    { icon: 'event', text: fr ? 'Organisation d evenements sponsorises' : 'Sponsored event hosting' },
    { icon: 'auto-awesome', text: fr ? 'Mise en avant prioritaire' : 'Priority placement' },
    { icon: 'home-filled', text: fr ? 'Carousel rotatif sur l accueil' : 'Rotating home page carousel' },
  ] : isSilver ? [
    { icon: 'star', text: fr ? 'Banniere sponsor sur les fiches' : 'Sponsor banner on detail pages' },
    { icon: 'people', text: fr ? 'Sponsoring de joueurs' : 'Player sponsoring' },
    { icon: 'map', text: fr ? 'Marqueurs carte distinctifs' : 'Distinctive map markers' },
    { icon: 'event', text: fr ? 'Organisation d evenements sponsorises' : 'Sponsored event hosting' },
  ] : [
    { icon: 'verified', text: fr ? 'Profil partenaire verifie' : 'Verified partner profile' },
    { icon: 'badge', text: fr ? 'Badge visible dans l annuaire' : 'Badge visible in directory' },
  ];

  const socialLinks: { platform: string; url: string; label: string }[] = [];
  if (partner.youtube_url) socialLinks.push({ platform: 'youtube', url: partner.youtube_url, label: 'YouTube' });
  if (partner.tiktok_url) socialLinks.push({ platform: 'tiktok', url: partner.tiktok_url, label: 'TikTok' });
  if (partner.instagram_handle) {
    const h = partner.instagram_handle.replace('@', '');
    socialLinks.push({ platform: 'instagram', url: `https://instagram.com/${h}`, label: `@${h}` });
  }
  if (partner.twitter_handle) {
    const h = partner.twitter_handle.replace('@', '');
    socialLinks.push({ platform: 'twitter', url: `https://x.com/${h}`, label: partner.twitter_handle });
  }
  if (partner.website_url) {
    const url = partner.website_url.startsWith('http') ? partner.website_url : `https://${partner.website_url}`;
    socialLinks.push({ platform: 'website', url, label: fr ? 'Site web' : 'Website' });
  }

  const isOwner = user?.id === partner.user_id;
  const memberSince = partner.created_at ? new Date(partner.created_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { month: 'long', year: 'numeric' }) : null;

  return (
    <SafeAreaView edges={['top']} style={st.container}>
      {/* Transparent header overlay */}
      <View style={st.headerRow}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color={theme.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>{fr ? 'Partenaire' : 'Partner'}</Text>
        <Pressable style={[st.shareBtn, { backgroundColor: tierColor + '10' }]} onPress={handleShare}>
          <MaterialIcons name="share" size={18} color={tierColor} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ====== FULL-WIDTH HERO ====== */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <LinearGradient
            colors={[tierGradient[0], tierGradient[1], tierGradient[1] + 'DD']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={st.hero}
          >
            {/* Decorative elements */}
            <View style={st.heroDeco1} />
            <View style={st.heroDeco2} />
            <View style={st.heroDeco3} />

            <View style={st.heroContent}>
              {/* Large avatar with brand ring */}
              <View style={st.heroAvatarContainer}>
                {partner.photo ? (
                  <Image source={{ uri: partner.photo }} style={st.heroAvatar} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                ) : (
                  <View style={[st.heroAvatar, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
                    <MaterialIcons name={tierIcon as any} size={64} color="#FFF" />
                  </View>
                )}
                {/* Tier badge overlay */}
                <View style={[st.heroTierBadge, { backgroundColor: tierColor }]}>
                  <MaterialIcons name={tierIcon as any} size={18} color="#FFF" />
                </View>
              </View>

              <Text style={st.heroName}>{partner.display_name}</Text>

              {/* Tier label pill */}
              <View style={st.heroBadge}>
                <MaterialIcons name={tierIcon as any} size={11} color="#FFF" />
                <Text style={st.heroBadgeText}>{tierLabel.toUpperCase()}</Text>
              </View>

              {/* Member since */}
              {memberSince ? (
                <Text style={st.heroMemberSince}>
                  {fr ? `Partenaire depuis ${memberSince}` : `Partner since ${memberSince}`}
                </Text>
              ) : null}

              {/* Public stats pills in hero */}
              <View style={st.heroStatsRow}>
                {totalSponsoredItems > 0 ? (
                  <View style={st.heroStatPill}>
                    <MaterialIcons name="handshake" size={13} color="rgba(255,255,255,0.9)" />
                    <Text style={st.heroStatValue}>{totalSponsoredItems} {fr ? 'sponsorises' : 'sponsored'}</Text>
                  </View>
                ) : null}
                {events.length > 0 ? (
                  <View style={st.heroStatPill}>
                    <MaterialIcons name="event" size={13} color="rgba(255,255,255,0.9)" />
                    <Text style={st.heroStatValue}>{events.length} {fr ? 'evenement(s)' : 'event(s)'}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        <View style={st.contentWrap}>
          {/* ====== TIER ADVANTAGES (public) ====== */}
          <Animated.View entering={FadeInDown.duration(400).delay(100)} style={st.card}>
            <View style={st.cardHeader}>
              <View style={[st.cardIconBg, { backgroundColor: tierColor + '10' }]}>
                <MaterialIcons name={tierIcon as any} size={18} color={tierColor} />
              </View>
              <Text style={st.cardTitle}>{fr ? 'Avantages partenaire' : 'Partner benefits'}</Text>
              <View style={[st.eventCountBadge, { backgroundColor: tierColor + '12' }]}>
                <Text style={[st.eventCountText, { color: tierColor }]}>{tierLabel.split(' ')[tierLabel.split(' ').length - 1] || tierLabel}</Text>
              </View>
            </View>
            <View style={{ gap: 10 }}>
              {tierAdvantages.map((adv, i) => (
                <View key={i} style={st.advantageRow}>
                  <View style={[st.advantageIconBg, { backgroundColor: tierColor + '10' }]}>
                    <MaterialIcons name={adv.icon as any} size={16} color={tierColor} />
                  </View>
                  <Text style={st.advantageText}>{adv.text}</Text>
                </View>
              ))}
            </View>
            {!isGold ? (
              <View style={[st.upgradeBanner, { backgroundColor: '#D4A01708', borderColor: '#D4A01720' }]}>
                <MaterialIcons name="arrow-upward" size={14} color="#D4A017" />
                <Text style={st.upgradeBannerText}>
                  {fr ? 'Niveaux superieurs disponibles avec plus d avantages' : 'Higher tiers available with more benefits'}
                </Text>
              </View>
            ) : null}
          </Animated.View>

          {/* ====== TESTIMONIAL / BIO QUOTE ====== */}
          {partner.bio ? (
            <Animated.View entering={FadeInDown.duration(400).delay(150)} style={[st.card, { borderLeftWidth: 4, borderLeftColor: tierColor + '60' }]}>
              <View style={st.cardHeader}>
                <View style={[st.cardIconBg, { backgroundColor: tierColor + '10' }]}>
                  <MaterialIcons name="format-quote" size={18} color={tierColor} />
                </View>
                <Text style={st.cardTitle}>{fr ? 'Mot du partenaire' : 'Partner message'}</Text>
              </View>
              <View style={{ position: 'relative', paddingLeft: 8 }}>
                <Text style={{ fontSize: 28, fontWeight: '900', color: tierColor + '15', position: 'absolute', top: -8, left: -4 }}>"</Text>
                <Text style={[st.bioText, { fontStyle: 'italic', lineHeight: 26 }]}>{partner.bio}</Text>
                <Text style={{ fontSize: 28, fontWeight: '900', color: tierColor + '15', textAlign: 'right', marginTop: -8 }}>"</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
                {partner.photo ? (
                  <Image source={{ uri: partner.photo }} style={{ width: 32, height: 32, borderRadius: 10, borderWidth: 1.5, borderColor: tierColor + '30' }} contentFit="cover" transition={200} />
                ) : (
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: tierColor + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name={tierIcon as any} size={16} color={tierColor} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#334155' }}>{partner.display_name}</Text>
                  <Text style={{ fontSize: 11, color: '#94A3B8' }}>{tierLabel}</Text>
                </View>
              </View>
            </Animated.View>
          ) : null}

          {/* ====== PHOTO GALLERY ====== */}
          {galleryPhotos.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(400).delay(175)} style={st.card}>
              <View style={st.cardHeader}>
                <View style={[st.cardIconBg, { backgroundColor: tierColor + '10' }]}>
                  <MaterialIcons name="photo-library" size={18} color={tierColor} />
                </View>
                <Text style={st.cardTitle}>{fr ? 'Galerie' : 'Gallery'}</Text>
                <View style={[st.eventCountBadge, { backgroundColor: tierColor + '12' }]}>
                  <Text style={[st.eventCountText, { color: tierColor }]}>{galleryPhotos.length}</Text>
                </View>
              </View>
              <View style={{ borderRadius: 16, overflow: 'hidden', marginBottom: 8 }}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const idx = Math.round(e.nativeEvent.contentOffset.x / (screenWidth - 68));
                    setActiveGalleryIndex(Math.max(0, Math.min(idx, galleryPhotos.length - 1)));
                  }}
                  decelerationRate="fast"
                >
                  {galleryPhotos.map((photoUri, idx) => (
                    <View key={idx} style={{ width: screenWidth - 68, height: GALLERY_PLACEHOLDER_HEIGHT }}>
                      <Image
                        source={{ uri: photoUri }}
                        style={{ width: '100%', height: '100%', borderRadius: 14 }}
                        contentFit="cover"
                        transition={300}
                        cachePolicy="memory-disk"
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
              {/* Pagination dots */}
              {galleryPhotos.length > 1 ? (
                <View style={st.galleryDotsRow}>
                  {galleryPhotos.map((_, idx) => (
                    <View
                      key={idx}
                      style={[
                        st.galleryDot,
                        idx === activeGalleryIndex
                          ? { backgroundColor: tierColor, width: 20 }
                          : { backgroundColor: tierColor + '30' },
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </Animated.View>
          ) : null}

          {/* ====== SPONSORED ITEMS (Terrains, Clubs, Tournaments) ====== */}
          {(sponsoredTerrains.length > 0 || sponsoredClubs.length > 0 || sponsoredTournaments.length > 0) ? (
            <Animated.View entering={FadeInDown.duration(400).delay(200)} style={st.card}>
              <View style={st.cardHeader}>
                <View style={[st.cardIconBg, { backgroundColor: tierColor + '10' }]}>
                  <MaterialIcons name="location-city" size={18} color={tierColor} />
                </View>
                <Text style={st.cardTitle}>{fr ? 'Lieux & Competitions sponsorises' : 'Sponsored venues & competitions'}</Text>
                <View style={[st.eventCountBadge, { backgroundColor: tierColor + '12' }]}>
                  <Text style={[st.eventCountText, { color: tierColor }]}>{sponsoredTerrains.length + sponsoredClubs.length + sponsoredTournaments.length}</Text>
                </View>
              </View>
              {/* Terrains */}
              {sponsoredTerrains.map((t: any) => (
                <Pressable
                  key={`t-${t.id}`}
                  style={({ pressed }) => [st.eventItem, pressed && { opacity: 0.85, backgroundColor: '#F8FAFC' }]}
                  onPress={() => router.push(`/terrain/${t.id}` as any)}
                >
                  <View style={[st.eventIconBg, { backgroundColor: '#22C55E12' }]}>
                    <MaterialIcons name="sports-soccer" size={16} color="#22C55E" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.eventTitle} numberOfLines={1}>{t.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      {t.city ? <Text style={st.eventDate}>{t.city}</Text> : null}
                      {t.type ? (
                        <>
                          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1' }} />
                          <Text style={st.eventDate}>{t.type}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  <View style={[st.sponsoredTypeBadge, { backgroundColor: '#22C55E12' }]}>
                    <Text style={[st.sponsoredTypeText, { color: '#22C55E' }]}>{fr ? 'Terrain' : 'Court'}</Text>
                  </View>
                </Pressable>
              ))}
              {/* Clubs */}
              {sponsoredClubs.map((c: any) => (
                <Pressable
                  key={`c-${c.id}`}
                  style={({ pressed }) => [st.eventItem, pressed && { opacity: 0.85, backgroundColor: '#F8FAFC' }]}
                  onPress={() => router.push(`/club/${c.id}` as any)}
                >
                  <View style={[st.eventIconBg, { backgroundColor: '#7C3AED12' }]}>
                    <MaterialIcons name="home" size={16} color="#7C3AED" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.eventTitle} numberOfLines={1}>{c.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      {c.city ? <Text style={st.eventDate}>{c.city}</Text> : null}
                      {c.members_count > 0 ? (
                        <>
                          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1' }} />
                          <Text style={st.eventDate}>{c.members_count} {fr ? 'membres' : 'members'}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  <View style={[st.sponsoredTypeBadge, { backgroundColor: '#7C3AED12' }]}>
                    <Text style={[st.sponsoredTypeText, { color: '#7C3AED' }]}>Club</Text>
                  </View>
                </Pressable>
              ))}
              {/* Tournaments */}
              {sponsoredTournaments.map((to: any) => (
                <Pressable
                  key={`to-${to.id}`}
                  style={({ pressed }) => [st.eventItem, pressed && { opacity: 0.85, backgroundColor: '#F8FAFC' }]}
                  onPress={() => router.push(`/tournament/${to.id}` as any)}
                >
                  <View style={[st.eventIconBg, { backgroundColor: '#F59E0B12' }]}>
                    <MaterialIcons name="emoji-events" size={16} color="#F59E0B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.eventTitle} numberOfLines={1}>{to.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <Text style={st.eventDate}>
                        {new Date(to.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                      </Text>
                      {to.format ? (
                        <>
                          <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1' }} />
                          <Text style={st.eventDate}>{to.format}</Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                  <View style={[st.sponsoredTypeBadge, { backgroundColor: '#F59E0B12' }]}>
                    <Text style={[st.sponsoredTypeText, { color: '#F59E0B' }]}>{fr ? 'Tournoi' : 'Tournament'}</Text>
                  </View>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}

          {/* ====== SOCIAL LINKS ====== */}
          {socialLinks.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(400).delay(250)} style={st.card}>
              <View style={st.cardHeader}>
                <View style={[st.cardIconBg, { backgroundColor: '#6366F110' }]}>
                  <MaterialIcons name="share" size={18} color="#6366F1" />
                </View>
                <Text style={st.cardTitle}>{fr ? 'Reseaux sociaux' : 'Social media'}</Text>
              </View>
              <View style={st.socialGrid}>
                {socialLinks.map((link, i) => {
                  const cfg = SOCIAL_CONFIG[link.platform];
                  return (
                    <Animated.View key={link.platform} entering={FadeIn.duration(300).delay(250 + i * 50)}>
                      <Pressable
                        style={({ pressed }) => [st.socialBtn, { borderColor: cfg.color + '18', backgroundColor: cfg.bg }, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
                        onPress={() => handleSocialPress(link.platform, link.url)}
                      >
                        <View style={[st.socialIcon, { backgroundColor: cfg.color + '15' }]}>
                          <MaterialIcons name={cfg.icon as any} size={20} color={cfg.color} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.socialLabel}>{cfg.label}</Text>
                          <Text style={st.socialHandle} numberOfLines={1}>{link.label}</Text>
                        </View>
                        <View style={[st.socialArrow, { backgroundColor: cfg.color + '10' }]}>
                          <MaterialIcons name="open-in-new" size={14} color={cfg.color} />
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            </Animated.View>
          ) : null}

          {/* ====== SPONSORED EVENTS ====== */}
          {events.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(400).delay(300)} style={st.card}>
              <View style={st.cardHeader}>
                <View style={[st.cardIconBg, { backgroundColor: '#F59E0B10' }]}>
                  <MaterialIcons name="event" size={18} color="#F59E0B" />
                </View>
                <Text style={st.cardTitle}>{fr ? 'Evenements sponsorises' : 'Sponsored events'}</Text>
                <View style={[st.eventCountBadge, { backgroundColor: tierColor + '12' }]}>
                  <Text style={[st.eventCountText, { color: tierColor }]}>{events.length}</Text>
                </View>
              </View>
              {events.map((ev, i) => {
                const statusColor = ev.status === 'active' ? '#22C55E' : ev.status === 'completed' ? '#3B82F6' : '#F59E0B';
                const statusLabel = ev.status === 'upcoming' ? (fr ? 'A venir' : 'Upcoming') : ev.status === 'active' ? (fr ? 'En cours' : 'Active') : (fr ? 'Termine' : 'Done');
                return (
                  <Pressable
                    key={ev.id}
                    style={({ pressed }) => [st.eventItem, pressed && { opacity: 0.85, backgroundColor: '#F8FAFC' }]}
                    onPress={() => router.push(`/sponsored-event/${ev.id}` as any)}
                  >
                    <View style={[st.eventIconBg, { backgroundColor: statusColor + '12' }]}>
                      <MaterialIcons name="emoji-events" size={16} color={statusColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.eventTitle} numberOfLines={1}>{ev.title}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <Text style={st.eventDate}>
                          {new Date(ev.eventDate).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                        </Text>
                        {ev.city ? (
                          <>
                            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1' }} />
                            <Text style={st.eventDate}>{ev.city}</Text>
                          </>
                        ) : null}
                      </View>
                    </View>
                    <View style={[st.eventStatusBadge, { backgroundColor: statusColor + '12' }]}>
                      <View style={[st.eventStatusDot, { backgroundColor: statusColor }]} />
                      <Text style={[st.eventStatusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </Animated.View>
          ) : null}

          {/* ====== REFERRAL CODE CTA (owner only) ====== */}
          {isOwner && partner.referral_code ? (
            <Animated.View entering={FadeInDown.duration(400).delay(350)}>
              <LinearGradient
                colors={[tierColor + '08', tierColor + '15']}
                style={st.referralCard}
              >
                <View style={st.referralHeader}>
                  <View style={[st.referralIconBg, { backgroundColor: tierColor + '18' }]}>
                    <MaterialIcons name="card-giftcard" size={24} color={tierColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.referralTitle}>{fr ? 'Code parrainage' : 'Referral code'}</Text>
                    <Text style={st.referralSub}>
                      {fr ? `${partner.referral_count || 0} parrainage(s) valide(s)` : `${partner.referral_count || 0} valid referral(s)`}
                    </Text>
                  </View>
                </View>

                {/* Code display with copy button */}
                <Pressable
                  style={({ pressed }) => [st.codeBlock, { borderColor: tierColor + '30' }, pressed && { transform: [{ scale: 0.98 }] }]}
                  onPress={handleCopyCode}
                >
                  <Text style={[st.codeText, { color: tierColor }]}>{partner.referral_code}</Text>
                  <View style={[st.codeCopyBtn, { backgroundColor: codeCopied ? '#10B981' : tierColor }]}>
                    <MaterialIcons name={codeCopied ? 'check' : 'content-copy'} size={16} color="#FFF" />
                  </View>
                </Pressable>
                <Text style={st.codeHint}>
                  {codeCopied
                    ? (fr ? 'Code copie !' : 'Code copied!')
                    : (fr ? 'Appuyez pour copier le code' : 'Tap to copy the code')}
                </Text>

                {/* Referral XP indicator */}
                {partner.total_referral_xp > 0 ? (
                  <View style={st.referralXpRow}>
                    <MaterialIcons name="star" size={14} color={tierColor} />
                    <Text style={[st.referralXpText, { color: tierColor }]}>{partner.total_referral_xp} XP</Text>
                  </View>
                ) : null}
              </LinearGradient>
            </Animated.View>
          ) : null}

          {/* ====== QR CODE CARD (owner only) ====== */}
          {isOwner ? <Animated.View entering={FadeInDown.duration(400).delay(375)} style={st.card}>
            <View style={st.cardHeader}>
              <View style={[st.cardIconBg, { backgroundColor: tierColor + '10' }]}>
                <MaterialIcons name="qr-code-2" size={18} color={tierColor} />
              </View>
              <Text style={st.cardTitle}>{fr ? 'QR Code Partenaire' : 'Partner QR Code'}</Text>
            </View>
            <Text style={{ fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 16 }}>
              {fr
                ? 'Scannez ou partagez ce QR code pour acceder directement au profil partenaire.'
                : 'Scan or share this QR code to access the partner profile directly.'}
            </Text>
            <View style={st.qrContainer}>
              <View style={[st.qrFrame, { borderColor: tierColor + '25' }]}>
                <View style={[st.qrCornerTL, { borderColor: tierColor }]} />
                <View style={[st.qrCornerTR, { borderColor: tierColor }]} />
                <View style={[st.qrCornerBL, { borderColor: tierColor }]} />
                <View style={[st.qrCornerBR, { borderColor: tierColor }]} />
                <QRCode
                  value={`https://ultimatepetanque.app/partners?id=${partner.id}`}
                  size={180}
                  color={tierColor}
                  backgroundColor="#FFFFFF"
                />
              </View>
              <Text style={[st.qrLabel, { color: tierColor }]}>{partner.display_name}</Text>
              <Text style={st.qrUrl}>ultimatepetanque.app</Text>
            </View>
            <View style={st.qrActions}>
              <Pressable
                style={({ pressed }) => [st.qrShareBtn, { backgroundColor: tierColor }, pressed && { opacity: 0.9, transform: [{ scale: 0.97 }] }]}
                onPress={async () => {
                  Haptics.selectionAsync();
                  try {
                    await Share.share({
                      message: `${partner.display_name} - ${fr ? 'Partenaire' : 'Partner'} Ultimate Petanque\nhttps://ultimatepetanque.app/partners?id=${partner.id}`,
                    });
                  } catch { /* silent */ }
                }}
              >
                <MaterialIcons name="share" size={16} color="#FFF" />
                <Text style={st.qrShareBtnText}>{fr ? 'Partager le QR' : 'Share QR'}</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [st.qrCopyBtn, { borderColor: tierColor + '30' }, pressed && { opacity: 0.8 }]}
                onPress={async () => {
                  Haptics.selectionAsync();
                  try {
                    const Clipboard = require('expo-clipboard');
                    await Clipboard.setStringAsync(`https://ultimatepetanque.app/partners?id=${partner.id}`);
                  } catch { /* silent */ }
                }}
              >
                <MaterialIcons name="content-copy" size={16} color={tierColor} />
                <Text style={[st.qrCopyBtnText, { color: tierColor }]}>{fr ? 'Copier le lien' : 'Copy link'}</Text>
              </Pressable>
            </View>
            <View style={st.qrTip}>
              <MaterialIcons name="lightbulb-outline" size={14} color="#94A3B8" />
              <Text style={st.qrTipText}>
                {fr
                  ? 'Ideal pour vos supports marketing, flyers et reseaux sociaux'
                  : 'Ideal for your marketing materials, flyers and social media'}
              </Text>
            </View>
          </Animated.View> : null}

          {/* ====== SPONSORED PLAYERS ====== */}
          {sponsoredPlayers.length > 0 ? (
            <Animated.View entering={FadeInDown.duration(400).delay(380)} style={st.card}>
              <View style={st.cardHeader}>
                <View style={[st.cardIconBg, { backgroundColor: tierColor + '10' }]}>
                  <MaterialIcons name="people" size={18} color={tierColor} />
                </View>
                <Text style={st.cardTitle}>{fr ? 'Joueurs sponsorises' : 'Sponsored players'}</Text>
                <View style={[st.eventCountBadge, { backgroundColor: tierColor + '12' }]}>
                  <Text style={[st.eventCountText, { color: tierColor }]}>{sponsoredPlayers.length}</Text>
                </View>
              </View>
              {sponsoredPlayers.map((pl: any) => {
                const eloVal = pl.elo_rating || 1000;
                const winR = pl.stats?.winRate || 0;
                return (
                  <Pressable
                    key={pl.id}
                    style={({ pressed }) => [st.eventItem, pressed && { opacity: 0.85, backgroundColor: '#F8FAFC' }]}
                    onPress={() => router.push(`/player/${pl.id}` as any)}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 13, overflow: 'hidden', borderWidth: 2, borderColor: tierColor + '50' }}>
                      {pl.avatar ? (
                        <Image source={{ uri: pl.avatar }} style={{ width: 36, height: 36, borderRadius: 11 }} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                      ) : (
                        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: tierColor + '15', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 14, fontWeight: '700', color: tierColor }}>{(pl.name || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.eventTitle} numberOfLines={1}>{pl.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: tierColor }}>{eloVal} ELO</Text>
                        {pl.city ? (
                          <>
                            <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1' }} />
                            <Text style={st.eventDate}>{pl.city}</Text>
                          </>
                        ) : null}
                        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#CBD5E1' }} />
                        <Text style={st.eventDate}>{winR}%</Text>
                      </View>
                    </View>
                    <View style={[st.eventStatusBadge, { backgroundColor: tierColor + '12' }]}>
                      <MaterialIcons name="handshake" size={10} color={tierColor} />
                    </View>
                  </Pressable>
                );
              })}
            </Animated.View>
          ) : null}

          {/* ====== WEBSITE CTA ====== */}
          {partner.website_url ? (
            <Animated.View entering={FadeInDown.duration(400).delay(400)}>
              <Pressable
                style={({ pressed }) => [st.ctaBtn, { backgroundColor: tierColor }, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                onPress={() => Linking.openURL(partner.website_url.startsWith('http') ? partner.website_url : `https://${partner.website_url}`)}
              >
                <MaterialIcons name="language" size={20} color="#FFF" />
                <Text style={st.ctaBtnText}>{fr ? 'Visiter le site' : 'Visit website'}</Text>
                <MaterialIcons name="arrow-forward" size={18} color="rgba(255,255,255,0.6)" />
              </Pressable>
            </Animated.View>
          ) : null}

          {/* ====== BECOME A PARTNER CTA (non-owners) ====== */}
          {!isOwner ? (
            <Animated.View entering={FadeInDown.duration(400).delay(420)}>
              <LinearGradient
                colors={['#1E3A8A08', '#2563EB12']}
                style={st.becomePartnerCard}
              >
                <View style={st.becomePartnerIcon}>
                  <MaterialIcons name="handshake" size={28} color="#2563EB" />
                </View>
                <Text style={st.becomePartnerTitle}>
                  {fr ? 'Devenez partenaire' : 'Become a partner'}
                </Text>
                <Text style={st.becomePartnerDesc}>
                  {fr
                    ? 'Rejoignez le programme partenaire et gagnez en visibilite aupres de la communaute petanque.'
                    : 'Join the partner program and gain visibility within the petanque community.'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, width: '100%' }}>
                  <Pressable
                    style={({ pressed }) => [st.becomePartnerBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                    onPress={() => { Haptics.selectionAsync(); router.push('/partner-program' as any); }}
                  >
                    <MaterialIcons name="info-outline" size={16} color="#FFF" />
                    <Text style={st.becomePartnerBtnText}>{fr ? 'Decouvrir le programme' : 'Discover the program'}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [st.becomePartnerBtnSecondary, pressed && { opacity: 0.8 }]}
                    onPress={() => { Haptics.selectionAsync(); Linking.openURL('mailto:ultimate.petanque.app@gmail.com?subject=Partenariat%20Ultimate%20Petanque'); }}
                  >
                    <MaterialIcons name="email" size={16} color="#2563EB" />
                  </Pressable>
                </View>
              </LinearGradient>
            </Animated.View>
          ) : null}

          {/* ====== PARTNER FOOTER ====== */}
          <Animated.View entering={FadeIn.duration(300).delay(450)} style={st.footerCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <MaterialIcons name="verified" size={14} color={tierColor} />
              <Text style={[st.footerText, { color: tierColor }]}>
                {fr ? 'Partenaire verifie Ultimate Petanque' : 'Verified Ultimate Petanque Partner'}
              </Text>
            </View>
          </Animated.View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 14, color: theme.textMuted },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#FFFFFFEE', borderBottomWidth: 1, borderBottomColor: '#E2E8F010',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },
  shareBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { paddingTop: 0 },
  contentWrap: { paddingHorizontal: 16, maxWidth: 640, alignSelf: 'center' as const, width: '100%' },

  // ====== HERO ======
  hero: {
    paddingTop: 40, paddingBottom: 36, paddingHorizontal: 24,
    alignItems: 'center' as const, overflow: 'hidden' as const,
    position: 'relative' as const, marginBottom: 20,
  },
  heroDeco1: { position: 'absolute', top: -50, right: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.05)' },
  heroDeco2: { position: 'absolute', bottom: -30, left: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.04)' },
  heroDeco3: { position: 'absolute', top: 30, left: 20, width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(255,255,255,0.03)' },
  heroContent: { alignItems: 'center' as const, position: 'relative' as const, zIndex: 1 },
  heroAvatarContainer: { position: 'relative' as const, marginBottom: 16 },
  heroAvatar: {
    width: 160, height: 160, borderRadius: 40,
    borderWidth: 3.5, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 8 },
      default: {},
    }),
  },
  heroTierBadge: {
    position: 'absolute' as const, bottom: -4, right: -4,
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)',
  },
  heroName: { fontSize: 26, fontWeight: '900', color: '#FFF', marginBottom: 8, textAlign: 'center', letterSpacing: -0.3 },
  heroBadge: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  heroBadgeText: { fontSize: 10, fontWeight: '800', color: '#FFF', letterSpacing: 0.8 },
  heroMemberSince: { fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 8, fontWeight: '500' },
  heroStatsRow: { flexDirection: 'row' as const, gap: 8, marginTop: 16 },
  heroStatPill: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5,
    backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  heroStatValue: { fontSize: 13, fontWeight: '800', color: '#FFF' },

  // ====== ADVANTAGES ======
  advantageRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  advantageIconBg: { width: 36, height: 36, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  advantageText: { flex: 1, fontSize: 14, fontWeight: '500', color: '#475569', lineHeight: 20 },
  upgradeBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  upgradeBannerText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#D4A017' },

  // ====== SPONSORED TYPE BADGE ======
  sponsoredTypeBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  sponsoredTypeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  // ====== CARDS ======
  card: {
    backgroundColor: '#FFF', borderRadius: 20, padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 4 },
      android: { elevation: 1 },
      default: {},
    }),
  },
  cardHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 14 },
  cardIconBg: { width: 36, height: 36, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0F172A' },
  bioText: { fontSize: 15, color: '#475569', lineHeight: 24 },

  // ====== SOCIAL ======
  socialGrid: { gap: 8 },
  socialBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12,
    borderRadius: 16, padding: 14, borderWidth: 1,
  },
  socialIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  socialLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  socialHandle: { fontSize: 12, color: '#94A3B8', marginTop: 1 },
  socialArrow: { width: 32, height: 32, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },

  // ====== EVENTS ======
  eventCountBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  eventCountText: { fontSize: 12, fontWeight: '800' },
  eventItem: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', borderRadius: 10,
  },
  eventIconBg: { width: 36, height: 36, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  eventTitle: { fontSize: 14, fontWeight: '600', color: '#334155' },
  eventDate: { fontSize: 12, color: '#94A3B8' },
  eventStatusBadge: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  eventStatusDot: { width: 6, height: 6, borderRadius: 3 },
  eventStatusText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },

  // ====== REFERRAL ======
  referralCard: {
    borderRadius: 20, padding: 20, marginBottom: 14,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  referralHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 16 },
  referralIconBg: { width: 48, height: 48, borderRadius: 16, alignItems: 'center' as const, justifyContent: 'center' as const },
  referralTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  referralSub: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  codeBlock: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    backgroundColor: '#FFF', borderRadius: 16, padding: 16, gap: 12,
    borderWidth: 2, borderStyle: 'dashed' as any,
  },
  codeText: { fontSize: 24, fontWeight: '900', letterSpacing: 3, flex: 1, textAlign: 'center' as const },
  codeCopyBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center' as const, justifyContent: 'center' as const },
  codeHint: { fontSize: 12, color: '#94A3B8', textAlign: 'center' as const, marginTop: 10, fontWeight: '500' },
  referralXpRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 6, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.04)',
  },
  referralXpText: { fontSize: 14, fontWeight: '800' },

  // ====== CTA ======
  ctaBtn: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 10, paddingVertical: 18, borderRadius: 18, marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8 },
      android: { elevation: 4 },
      default: {},
    }),
  },
  ctaBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },

  // ====== FOOTER ======
  footerCard: {
    paddingVertical: 16, alignItems: 'center' as const,
    borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4,
  },
  footerText: { fontSize: 12, fontWeight: '600' },

  // ====== GALLERY ======
  galleryDotsRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 6, marginTop: 4,
  },
  galleryDot: {
    height: 6, width: 6, borderRadius: 3,
  },

  // ====== BECOME PARTNER CTA ======
  becomePartnerCard: {
    borderRadius: 20, padding: 24, marginBottom: 14, alignItems: 'center' as const,
    borderWidth: 1.5, borderColor: '#2563EB18',
  },
  becomePartnerIcon: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: '#2563EB12', alignItems: 'center' as const, justifyContent: 'center' as const,
    marginBottom: 14, borderWidth: 1, borderColor: '#2563EB15',
  },
  becomePartnerTitle: { fontSize: 18, fontWeight: '800', color: '#0F172A', marginBottom: 8, textAlign: 'center' as const },
  becomePartnerDesc: { fontSize: 13, color: '#64748B', textAlign: 'center' as const, lineHeight: 20, marginBottom: 18, maxWidth: 300 },
  becomePartnerBtn: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 8, backgroundColor: '#2563EB', paddingVertical: 14, borderRadius: 14,
  },
  becomePartnerBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  becomePartnerBtnSecondary: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#2563EB10', alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 1.5, borderColor: '#2563EB20',
  },

  // ====== QR CODE ======
  qrContainer: { alignItems: 'center' as const, marginBottom: 16 },
  qrFrame: {
    padding: 20, borderRadius: 20, borderWidth: 1.5,
    backgroundColor: '#FFF', position: 'relative' as const,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 3 },
      default: {},
    }),
  },
  qrCornerTL: { position: 'absolute' as const, top: -2, left: -2, width: 24, height: 24, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  qrCornerTR: { position: 'absolute' as const, top: -2, right: -2, width: 24, height: 24, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  qrCornerBL: { position: 'absolute' as const, bottom: -2, left: -2, width: 24, height: 24, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  qrCornerBR: { position: 'absolute' as const, bottom: -2, right: -2, width: 24, height: 24, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },
  qrLabel: { fontSize: 14, fontWeight: '800' as const, marginTop: 12, letterSpacing: 0.3 },
  qrUrl: { fontSize: 11, color: '#94A3B8', marginTop: 3, fontWeight: '500' as const },
  qrActions: { flexDirection: 'row' as const, gap: 10, marginBottom: 12 },
  qrShareBtn: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 8, paddingVertical: 13, borderRadius: 14,
  },
  qrShareBtnText: { fontSize: 13, fontWeight: '700' as const, color: '#FFF' },
  qrCopyBtn: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const,
    gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, backgroundColor: '#FFF',
  },
  qrCopyBtnText: { fontSize: 13, fontWeight: '700' as const },
  qrTip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12,
  },
  qrTipText: { flex: 1, fontSize: 11, color: '#94A3B8', lineHeight: 16, fontWeight: '500' as const },
});
