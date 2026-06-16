import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { fetchAmbassadors, Ambassador } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import * as Linking from 'expo-linking';

interface SponsoredItemBannerProps {
  /** The sponsor_id from the terrain/club/tournament/player record */
  sponsorId: string | null | undefined;
  /** Page context for analytics tracking */
  page?: string;
  style?: any;
}

const TIER_CONFIG: Record<string, { label: string; labelEn: string; color: string; icon: string }> = {
  gold_sponsor: { label: 'PARTENAIRE OR', labelEn: 'GOLD PARTNER', color: '#D4A017', icon: 'star' },
  sponsor: { label: 'PARTENAIRE ARGENT', labelEn: 'SILVER PARTNER', color: '#78909C', icon: 'workspace-premium' },
  partner: { label: 'PARTENAIRE BRONZE', labelEn: 'BRONZE PARTNER', color: '#A1887F', icon: 'workspace-premium' },
};

/**
 * Displays a sponsor banner only when a specific sponsor_id is set on a terrain/club/tournament.
 * This ensures banners appear only for explicitly associated sponsors, not based on ownership.
 */
export default function SponsoredItemBanner({ sponsorId, page = 'detail', style }: SponsoredItemBannerProps) {
  const [sponsor, setSponsor] = useState<Ambassador | null>(null);
  const [loaded, setLoaded] = useState(false);
  const impressionTracked = useRef(false);

  // Gold pulse animation
  const pulseOpacity = useSharedValue(0.6);
  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);
  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));

  useEffect(() => {
    if (!sponsorId) { setLoaded(true); return; }
    fetchAmbassadors().then(({ ambassadors }) => {
      const match = ambassadors.find(a => a.id === sponsorId);
      if (match) {
        // Check expiration
        const raw = ambassadors.find(a => a.id === sponsorId) as any;
        if (raw?.expiresAt) {
          const daysLeft = Math.ceil((new Date(raw.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
          if (daysLeft <= 0) { setLoaded(true); return; } // Expired, don't show
        }
        setSponsor(match);
      }
      setLoaded(true);
    });
  }, [sponsorId]);

  useEffect(() => {
    if (!sponsor || impressionTracked.current) return;
    impressionTracked.current = true;
    trackAmbassadorEvent(sponsor.id, 'banner_impression', undefined, { sourcePage: page });
  }, [sponsor, page]);

  const handlePress = useCallback(() => {
    if (!sponsor) return;
    trackAmbassadorEvent(sponsor.id, 'profile_view', undefined, { sourcePage: page });
    router.push(`/partner/${sponsor.id}` as any);
  }, [sponsor, page]);

  if (!loaded || !sponsor || !sponsorId) return null;

  const tier = TIER_CONFIG[sponsor.badgeType] || TIER_CONFIG.partner;
  const isGold = sponsor.badgeType === 'gold_sponsor';
  const isSilverPlus = isGold || sponsor.badgeType === 'sponsor';
  const brandColor = sponsor.brandColor || tier.color;

  // Bronze partners do not get sponsor banners — Silver and Gold only
  if (!isSilverPlus) return null;
  const hasSocials = sponsor.instagramHandle || sponsor.tiktokUrl || sponsor.youtubeUrl || sponsor.websiteUrl;

  return (
    <View style={[styles.container, style]}>
      <Pressable
        style={({ pressed }) => [
          styles.banner,
          { backgroundColor: isGold ? brandColor + '20' : brandColor + '12', borderColor: brandColor + (isGold ? '50' : '30') },
          isGold && styles.bannerGold,
          pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] },
        ]}
        onPress={handlePress}
      >
        {/* Top accent stripe */}
        <View style={[styles.topStripe, { backgroundColor: brandColor, height: isGold ? 3 : 2 }]} />

        {/* Main content */}
        <View style={styles.content}>
          {/* Avatar section */}
          <View style={styles.avatarSection}>
            {sponsor.photo ? (
              <View style={[styles.photoWrap, { borderColor: brandColor + '50' }]}>
                <Image source={{ uri: sponsor.photo }} style={styles.photo} contentFit="cover" transition={200} cachePolicy="memory-disk" />
              </View>
            ) : (
              <View style={[styles.photoWrap, styles.photoFallback, { backgroundColor: brandColor + '18', borderColor: brandColor + '40' }]}>
                <MaterialIcons name={tier.icon as any} size={isGold ? 26 : 22} color={brandColor} />
              </View>
            )}
            {isGold ? (
              <Animated.View style={[styles.activePulse, { backgroundColor: brandColor }, pulseStyle]} />
            ) : null}
          </View>

          {/* Info section */}
          <View style={styles.info}>
            <View style={styles.labelRow}>
              <View style={[styles.tierLabel, { backgroundColor: brandColor }]}>
                <MaterialIcons name={tier.icon as any} size={8} color="#FFF" />
                <Text style={styles.tierLabelText}>{tier.label}</Text>
              </View>
              <View style={[styles.sponsorChip, { backgroundColor: '#2563EB12' }]}>
                <MaterialIcons name="handshake" size={8} color="#2563EB" />
                <Text style={styles.sponsorChipText}>SPONSOR</Text>
              </View>
            </View>
            <Text style={[styles.name, isGold && { color: '#78350F', fontSize: 15 }]} numberOfLines={1}>
              {sponsor.displayName}
            </Text>
            {sponsor.bio ? (
              <Text style={styles.bio} numberOfLines={isGold ? 2 : 1}>{sponsor.bio}</Text>
            ) : null}

            {/* Social links for gold sponsors */}
            {isGold && hasSocials ? (
              <View style={styles.socialRow}>
                {sponsor.instagramHandle ? (
                  <Pressable style={[styles.socialBtn, { backgroundColor: '#E4405F18' }]} onPress={() => { trackAmbassadorEvent(sponsor.id, 'social_click', 'instagram', { sourcePage: page }); Linking.openURL(`https://instagram.com/${sponsor.instagramHandle!.replace('@', '')}`); }} hitSlop={4}>
                    <MaterialIcons name="camera-alt" size={12} color="#E4405F" />
                  </Pressable>
                ) : null}
                {sponsor.youtubeUrl ? (
                  <Pressable style={[styles.socialBtn, { backgroundColor: '#FF000018' }]} onPress={() => { trackAmbassadorEvent(sponsor.id, 'social_click', 'youtube', { sourcePage: page }); Linking.openURL(sponsor.youtubeUrl!); }} hitSlop={4}>
                    <MaterialIcons name="play-circle-filled" size={12} color="#FF0000" />
                  </Pressable>
                ) : null}
                {sponsor.tiktokUrl ? (
                  <Pressable style={[styles.socialBtn, { backgroundColor: '#00000012' }]} onPress={() => { trackAmbassadorEvent(sponsor.id, 'social_click', 'tiktok', { sourcePage: page }); Linking.openURL(sponsor.tiktokUrl!); }} hitSlop={4}>
                    <MaterialIcons name="music-note" size={12} color="#000" />
                  </Pressable>
                ) : null}
                {sponsor.websiteUrl ? (
                  <Pressable style={[styles.socialBtn, { backgroundColor: theme.primary + '12' }]} onPress={() => { trackAmbassadorEvent(sponsor.id, 'social_click', 'website', { sourcePage: page }); Linking.openURL(sponsor.websiteUrl!.startsWith('http') ? sponsor.websiteUrl! : `https://${sponsor.websiteUrl}`); }} hitSlop={4}>
                    <MaterialIcons name="language" size={12} color={theme.primary} />
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>

          {/* CTA */}
          <View style={[styles.cta, { backgroundColor: brandColor + '18' }]}>
            <MaterialIcons name="chevron-right" size={20} color={brandColor} />
          </View>
        </View>

        {/* Gold decorative corners */}
        {isGold ? (
          <>
            <View style={[styles.goldCornerTL, { borderColor: brandColor + '20' }]} />
            <View style={[styles.goldCornerBR, { borderColor: brandColor + '20' }]} />
          </>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  banner: {
    borderRadius: 16,
    overflow: 'visible',
    borderWidth: 1.5,
    position: 'relative',
  },
  bannerGold: {
    borderWidth: 2,
  },
  topStripe: { position: 'absolute', top: 0, left: 0, right: 0, borderTopLeftRadius: 15, borderTopRightRadius: 15, overflow: 'hidden' },
  content: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingTop: 16, gap: 12 },
  avatarSection: { position: 'relative' },
  photoWrap: { width: 52, height: 52, borderRadius: 16, overflow: 'hidden', borderWidth: 2 },
  photo: { width: 48, height: 48, borderRadius: 14 },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  activePulse: { position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#FFF' },
  info: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  tierLabel: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  tierLabelText: { fontSize: 8, fontWeight: '900', color: '#FFF', letterSpacing: 0.8 },
  sponsorChip: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 6, paddingVertical: 2.5, borderRadius: 6 },
  sponsorChipText: { fontSize: 7, fontWeight: '800', color: '#2563EB', letterSpacing: 0.5 },
  name: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  bio: { fontSize: 12, color: theme.textSecondary, marginTop: 3, lineHeight: 16 },
  socialRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  socialBtn: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  cta: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 11, fontWeight: '700', color: '#2563EB', marginTop: 4 },
  goldCornerTL: { position: 'absolute', top: 3, left: 3, width: 16, height: 16, borderTopWidth: 1.5, borderLeftWidth: 1.5, borderTopLeftRadius: 6 },
  goldCornerBR: { position: 'absolute', bottom: 3, right: 3, width: 16, height: 16, borderBottomWidth: 1.5, borderRightWidth: 1.5, borderBottomRightRadius: 6 },
});
