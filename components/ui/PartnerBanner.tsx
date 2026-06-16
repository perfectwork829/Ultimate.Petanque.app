import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { fetchAmbassadors, Ambassador } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';

interface PartnerBannerProps {
  style?: any;
  page?: string;
  /** Only show partners at or above this tier */
  minTier?: 'partner' | 'sponsor' | 'gold_sponsor';
  /** If provided, only show the partner whose user_id matches this club/terrain owner */
  ownerUserId?: string;
}

const TIER_CONFIG = {
  gold_sponsor: { label: 'PARTENAIRE OR', labelEn: 'GOLD PARTNER', color: '#D4A017', bg: '#F59E0B', icon: 'star' as const, order: 0 },
  sponsor: { label: 'PARTENAIRE ARGENT', labelEn: 'SILVER PARTNER', color: '#78909C', bg: '#90A4AE', icon: 'workspace-premium' as const, order: 1 },
  partner: { label: 'PARTENAIRE BRONZE', labelEn: 'BRONZE PARTNER', color: '#A1887F', bg: '#8D6E63', icon: 'workspace-premium' as const, order: 2 },
};

/**
 * Partner Banner for club/terrain detail pages.
 * Silver+ partners get a banner on their club/terrain pages.
 * Gold partners get an enhanced banner with pulse indicator and social links.
 */
export default function PartnerBanner({ style, page = 'detail', minTier = 'sponsor', ownerUserId }: PartnerBannerProps) {
  const [partner, setPartner] = useState<Ambassador | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [expiryInfo, setExpiryInfo] = useState<{ daysLeft: number; isExpired: boolean } | null>(null);
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
    fetchAmbassadors().then(({ ambassadors }) => {
      const validTiers = minTier === 'partner' 
        ? ['gold_sponsor', 'sponsor', 'partner'] 
        : minTier === 'sponsor' 
          ? ['gold_sponsor', 'sponsor'] 
          : ['gold_sponsor'];

      // Filter out expired partners
      const now = Date.now();
      const activeAmbassadors = ambassadors.filter(a => {
        if (!(a as any).expiresAt) return true; // no expiration
        // We still show if within grace period (show expired badge)
        return true;
      });

      let match: Ambassador | undefined;
      if (ownerUserId) {
        // Only show banner if the owner is explicitly a partner — no fallback to featured partners
        match = activeAmbassadors.find(a => a.userId === ownerUserId && validTiers.includes(a.badgeType));
      } else {
        // No ownerUserId provided — show a featured partner (generic pages only)
        match = activeAmbassadors.find(a => a.badgeType === 'gold_sponsor' && a.isFeatured);
        if (!match) match = activeAmbassadors.find(a => validTiers.includes(a.badgeType) && a.isFeatured);
      }
      if (match) {
        setPartner(match);
        // Check expiry from raw data (Ambassador type doesn't have expiresAt, so we query)
        const raw = ambassadors.find(a => a.id === match!.id);
        if (raw && (raw as any).expiresAt) {
          const exp = new Date((raw as any).expiresAt).getTime();
          const daysLeft = Math.ceil((exp - now) / (24 * 60 * 60 * 1000));
          setExpiryInfo({ daysLeft, isExpired: daysLeft <= 0 });
        }
      }
      setLoaded(true);
    });
  }, [ownerUserId, minTier]);

  useEffect(() => {
    if (!partner || impressionTracked.current) return;
    // Don't track impressions for expired partners
    if (expiryInfo?.isExpired) return;
    impressionTracked.current = true;
    trackAmbassadorEvent(partner.id, 'banner_impression', undefined, { sourcePage: page });
  }, [partner, page, expiryInfo]);

  const handlePress = useCallback(() => {
    if (!partner) return;
    trackAmbassadorEvent(partner.id, 'profile_view', undefined, { sourcePage: page });
    router.push(`/partner/${partner.id}` as any);
  }, [partner, page]);

  const handleSocialPress = useCallback((platform: string, url: string) => {
    if (!partner) return;
    trackAmbassadorEvent(partner.id, 'social_click', platform, { sourcePage: page });
  }, [partner, page]);

  if (!loaded || !partner) return null;
  // Hide completely if expired
  if (expiryInfo?.isExpired) return null;

  const tier = TIER_CONFIG[partner.badgeType as keyof typeof TIER_CONFIG] || TIER_CONFIG.partner;
  const isGold = partner.badgeType === 'gold_sponsor';
  const isSilver = partner.badgeType === 'sponsor';
  const brandColor = partner.brandColor || tier.bg;
  const hasSocials = partner.instagramHandle || partner.tiktokUrl || partner.youtubeUrl || partner.websiteUrl;

  return (
    <Animated.View entering={FadeInDown.duration(400).delay(100)} style={[styles.container, style]}>
      <Pressable
        style={({ pressed }) => [
          styles.banner,
          { backgroundColor: brandColor + (isGold ? '14' : '0A'), borderColor: brandColor + (isGold ? '40' : '25') },
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
            {partner.photo ? (
              <View style={[styles.photoWrap, { borderColor: brandColor + '50' }]}>
                <Image source={{ uri: partner.photo }} style={styles.photo} contentFit="cover" transition={200} cachePolicy="memory-disk" />
              </View>
            ) : (
              <View style={[styles.photoWrap, styles.photoFallback, { backgroundColor: brandColor + '18', borderColor: brandColor + '40' }]}>
                <MaterialIcons name={tier.icon} size={isGold ? 26 : 22} color={brandColor} />
              </View>
            )}
            {/* Active pulse for gold */}
            {isGold ? (
              <Animated.View style={[styles.activePulse, { backgroundColor: brandColor }, pulseStyle]} />
            ) : null}
          </View>

          {/* Info section */}
          <View style={styles.info}>
            <View style={styles.labelRow}>
              <View style={[styles.tierLabel, { backgroundColor: brandColor }]}>
                <MaterialIcons name={tier.icon} size={8} color="#FFF" />
                <Text style={styles.tierLabelText}>{tier.label}</Text>
              </View>
              {expiryInfo && expiryInfo.daysLeft <= 30 ? (
                <View style={[styles.expiryChip, { backgroundColor: expiryInfo.daysLeft <= 7 ? '#EF444412' : '#F59E0B12' }]}>
                  <MaterialIcons name="schedule" size={8} color={expiryInfo.daysLeft <= 7 ? '#EF4444' : '#F59E0B'} />
                  <Text style={[styles.expiryChipText, { color: expiryInfo.daysLeft <= 7 ? '#EF4444' : '#F59E0B' }]}>
                    {expiryInfo.daysLeft}j
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.name, isGold && { color: '#78350F', fontSize: 15 }]} numberOfLines={1}>
              {partner.displayName}
            </Text>
            {partner.bio ? (
              <Text style={styles.bio} numberOfLines={isGold ? 2 : 1}>{partner.bio}</Text>
            ) : null}

            {/* Social links for gold partners */}
            {isGold && hasSocials ? (
              <View style={styles.socialRow}>
                {partner.instagramHandle ? (
                  <Pressable style={[styles.socialBtn, { backgroundColor: '#E4405F18' }]} onPress={() => handleSocialPress('instagram', partner.instagramHandle!)} hitSlop={4}>
                    <MaterialIcons name="camera-alt" size={12} color="#E4405F" />
                  </Pressable>
                ) : null}
                {partner.youtubeUrl ? (
                  <Pressable style={[styles.socialBtn, { backgroundColor: '#FF000018' }]} onPress={() => handleSocialPress('youtube', partner.youtubeUrl!)} hitSlop={4}>
                    <MaterialIcons name="play-circle-filled" size={12} color="#FF0000" />
                  </Pressable>
                ) : null}
                {partner.tiktokUrl ? (
                  <Pressable style={[styles.socialBtn, { backgroundColor: '#00000012' }]} onPress={() => handleSocialPress('tiktok', partner.tiktokUrl!)} hitSlop={4}>
                    <MaterialIcons name="music-note" size={12} color="#000" />
                  </Pressable>
                ) : null}
                {partner.websiteUrl ? (
                  <Pressable style={[styles.socialBtn, { backgroundColor: theme.primary + '12' }]} onPress={() => handleSocialPress('website', partner.websiteUrl!)} hitSlop={4}>
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

        {/* Gold shimmer decorative elements */}
        {isGold ? (
          <>
            <View style={[styles.goldCornerTL, { borderColor: brandColor + '20' }]} />
            <View style={[styles.goldCornerBR, { borderColor: brandColor + '20' }]} />
          </>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  banner: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    position: 'relative',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10 },
      android: { elevation: 3 },
      default: {},
    }),
  },
  bannerGold: {
    borderWidth: 2,
    ...Platform.select({
      ios: { shadowColor: '#F59E0B', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 },
      android: { elevation: 4 },
      default: {},
    }),
  },
  topStripe: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
  },
  content: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingTop: 16, gap: 12 },
  avatarSection: { position: 'relative' },
  photoWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 2,
  },
  photo: { width: 44, height: 44, borderRadius: 12 },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  activePulse: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  info: { flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  tierLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  tierLabelText: { fontSize: 7, fontWeight: '900', color: '#FFF', letterSpacing: 0.8 },
  expiryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
  },
  expiryChipText: { fontSize: 8, fontWeight: '800' },
  name: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  bio: { fontSize: 11, color: theme.textSecondary, marginTop: 2, lineHeight: 15 },
  socialRow: { flexDirection: 'row', gap: 6, marginTop: 6 },
  socialBtn: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cta: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldCornerTL: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 16,
    height: 16,
    borderTopWidth: 1.5,
    borderLeftWidth: 1.5,
    borderTopLeftRadius: 6,
  },
  goldCornerBR: {
    position: 'absolute',
    bottom: 3,
    right: 3,
    width: 16,
    height: 16,
    borderBottomWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomRightRadius: 6,
  },
});
