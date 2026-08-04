// ============================================
// AdBanner - Native implementation with Google AdMob
// Gold sponsors replace ads with branded content
// ============================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { AD_UNIT_IDS } from '@/services/adService';
import { useAppUI } from '@/contexts/AppContext';
import { canShowPersonalizedAds } from '@/services/trackingService';
import { getGoogleMobileAdsModule } from '@/services/googleMobileAdsModule';
import {
  getActiveGoldSponsorForAdReplacement,
  subscribeGoldSponsorAdRefresh,
} from '@/services/goldSponsorAdReplacement';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import type { Ambassador } from '@/services/ambassadorService';
import theme from '@/constants/theme';

interface AdBannerProps {
  position?: 'inline' | 'sticky';
  bottomOffset?: number;
}

let BannerAdComponent: React.ComponentType<{
  unitId: string;
  size: string;
  requestOptions?: { requestNonPersonalizedAdsOnly?: boolean };
  onAdLoaded?: () => void;
  onAdFailedToLoad?: () => void;
}> | null = null;
let BannerAdSizeEnum: { ANCHORED_ADAPTIVE_BANNER: string } | null = null;
let adsModuleLoaded = false;
let adsModuleAvailable = false;

function loadAdsModule() {
  if (adsModuleLoaded) return;
  adsModuleLoaded = true;
  const mod = getGoogleMobileAdsModule();
  if (!mod) {
    adsModuleAvailable = false;
    return;
  }
  BannerAdComponent = mod.BannerAd;
  BannerAdSizeEnum = mod.BannerAdSize;
  adsModuleAvailable = true;
}

// ============================================
// GOLD SPONSOR INLINE BANNER (replaces AdBanner)
// ============================================
const GoldSponsorInline = React.memo(({ sponsor }: { sponsor: Ambassador }) => {
  const impressionTracked = useRef(false);

  useEffect(() => {
    if (impressionTracked.current) return;
    impressionTracked.current = true;
    trackAmbassadorEvent(sponsor.id, 'banner_impression', undefined, { sourcePage: 'ad_replacement' });
  }, [sponsor.id]);

  const handlePress = useCallback(() => {
    trackAmbassadorEvent(sponsor.id, 'profile_view', undefined, { sourcePage: 'ad_replacement' });
    router.push('/partners');
  }, [sponsor.id]);

  return (
    <Pressable
      style={({ pressed }) => [goldStyles.container, pressed && { opacity: 0.92, transform: [{ scale: 0.99 }] }]}
      onPress={handlePress}
    >
      <LinearGradient
        colors={['#FFFBEB', '#FEF3C7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={goldStyles.gradient}
      >
        <View style={goldStyles.goldAccent} />
        <View style={goldStyles.content}>
          {sponsor.photo ? (
            <Image source={{ uri: sponsor.photo }} style={goldStyles.logo} contentFit="cover" transition={200} cachePolicy="memory-disk" />
          ) : (
            <LinearGradient colors={['#B45309', '#F59E0B']} style={goldStyles.logoFallback}>
              <MaterialIcons name="workspace-premium" size={16} color="#FFF" />
            </LinearGradient>
          )}
          <View style={goldStyles.info}>
            <View style={goldStyles.labelRow}>
              <LinearGradient colors={['#B45309', '#D97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={goldStyles.goldLabel}>
                <MaterialIcons name="star" size={7} color="#FFF" />
                <Text style={goldStyles.goldLabelText}>SPONSOR OR</Text>
              </LinearGradient>
            </View>
            <Text style={goldStyles.name} numberOfLines={1}>{sponsor.displayName}</Text>
          </View>
          <View style={goldStyles.cta}>
            <MaterialIcons name="open-in-new" size={12} color="#B45309" />
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
});

const goldStyles = StyleSheet.create({
  container: {
    marginVertical: 12,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    ...Platform.select({
      ios: { shadowColor: '#B45309', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 },
      android: { elevation: 3 },
      default: {},
    }),
  },
  gradient: { borderRadius: 12, position: 'relative' as const },
  goldAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, backgroundColor: '#F59E0B', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  content: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 10, paddingHorizontal: 12, gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 10, overflow: 'hidden' as const },
  logoFallback: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  info: { flex: 1 },
  labelRow: { flexDirection: 'row' as const, marginBottom: 2 },
  goldLabel: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  goldLabelText: { fontSize: 7, fontWeight: '900' as const, color: '#FFF', letterSpacing: 0.6 },
  name: { fontSize: 13, fontWeight: '700' as const, color: '#78350F' },
  cta: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F59E0B20', alignItems: 'center' as const, justifyContent: 'center' as const },
});


// ============================================
// NORMAL AD FALLBACK
// Used only when no gold sponsor is active and the native AdMob component
// is unavailable in the current build. This keeps the Home ad slot visible
// as a normal ad banner instead of disappearing or showing a sponsor banner.
// ============================================
const NormalAdFallbackContent = React.memo(() => (
  <View style={styles.fallbackBanner}>
    <View style={styles.fallbackIconWrap}>
      <MaterialIcons name="campaign" size={17} color="#FFFFFF" />
    </View>
    <View style={styles.fallbackTextWrap}>
      <Text style={styles.fallbackLabel}>ADVERTISEMENT</Text>
      <Text style={styles.fallbackText} numberOfLines={1}>Ad banner</Text>
    </View>
  </View>
));

const NormalAdFallback = React.memo(({ position = 'inline', bottomOffset = 0 }: AdBannerProps) => {
  const content = <NormalAdFallbackContent />;

  if (position === 'sticky') {
    return (
      <View style={[styles.stickyContainer, { paddingBottom: bottomOffset }]}> 
        {content}
      </View>
    );
  }

  return (
    <View style={styles.inlineContainer}>
      {content}
    </View>
  );
});

// ============================================
// MAIN AdBanner COMPONENT
// ============================================
const AdBanner = React.memo(({ position = 'inline', bottomOffset = 0 }: AdBannerProps) => {
  const [nonPersonalized, setNonPersonalized] = useState(true);
  const [goldSponsor, setGoldSponsor] = useState<Ambassador | null>(null);
  const [goldLoaded, setGoldLoaded] = useState(false);
  const [adRetryKey, setAdRetryKey] = useState(0);
  const [adLoaded, setAdLoaded] = useState(false);
  const [adFailed, setAdFailed] = useState(false);
  const appUI = useAppUI();
  const isPremium = appUI.isPremium;

  const refreshGoldSponsor = useCallback(async () => {
    try {
      const gold = await getActiveGoldSponsorForAdReplacement();
      setGoldSponsor(gold);
    } catch {
      setGoldSponsor(null);
    } finally {
      setGoldLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadAdsModule();
    canShowPersonalizedAds().then(can => setNonPersonalized(!can));
    refreshGoldSponsor();
    const unsubscribe = subscribeGoldSponsorAdRefresh(() => {
      refreshGoldSponsor();
    });
    return () => {
      unsubscribe();
    };
  }, [refreshGoldSponsor]);

  useFocusEffect(useCallback(() => {
    refreshGoldSponsor();
    // If there is no gold sponsor, allow AdMob to request again when returning to this screen.
    setAdLoaded(false);
    setAdFailed(false);
    setAdRetryKey(prev => prev + 1);
  }, [refreshGoldSponsor]));

  // Hide banners for premium users.
  if (isPremium) return null;

  // Wait until the gold sponsor check finishes, then decide:
  // gold sponsor => sponsor banner, no gold sponsor => normal AdMob banner.
  if (!goldLoaded) return null;

  if (goldSponsor) {
    return <GoldSponsorInline sponsor={goldSponsor} />;
  }

  // No gold sponsor: show normal AdMob banner.
  // Gold sponsor replacement is only a privilege when there is an active gold sponsor.
  // If the native AdMob component is unavailable in this build, keep a normal
  // non-sponsor ad slot visible instead of returning null.
  if (!adsModuleAvailable || !BannerAdComponent || !BannerAdSizeEnum || !AD_UNIT_IDS.banner) {
    return <NormalAdFallback position={position} bottomOffset={bottomOffset} />;
  }

  const banner = (
    <BannerAdComponent
      key={`banner-${position}-${adRetryKey}`}
      unitId={AD_UNIT_IDS.banner}
      size={BannerAdSizeEnum.ANCHORED_ADAPTIVE_BANNER}
      requestOptions={{ requestNonPersonalizedAdsOnly: nonPersonalized }}
      onAdLoaded={() => {
        setAdLoaded(true);
        setAdFailed(false);
      }}
      onAdFailedToLoad={() => {
        setAdLoaded(false);
        setAdFailed(true);
        // Do not permanently hide the AdBanner. AdMob may return no-fill temporarily,
        // and the banner will retry on screen focus/remount.
      }}
    />
  );

  if (position === 'sticky') {
    return (
      <View style={[styles.stickyContainer, { paddingBottom: bottomOffset }]}> 
        {!adLoaded || adFailed ? <NormalAdFallbackContent /> : null}
        <View style={adLoaded && !adFailed ? undefined : styles.adMobLoadingLayer}>
          {banner}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.inlineContainer}>
      {!adLoaded || adFailed ? <NormalAdFallbackContent /> : null}
      <View style={adLoaded && !adFailed ? undefined : styles.adMobLoadingLayer}>
        {banner}
      </View>
    </View>
  );
});

export default AdBanner;

const styles = StyleSheet.create({
  inlineContainer: {
    alignItems: 'center',
    marginVertical: 12,
    backgroundColor: 'transparent',
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
  },
  fallbackBanner: {
    width: '100%',
    minHeight: 64,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1.5,
    borderColor: '#38BDF8',
    backgroundColor: '#E0F2FE',
  },
  fallbackIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#0284C7',
  },
  fallbackTextWrap: {
    alignItems: 'flex-start' as const,
  },
  fallbackLabel: {
    fontSize: 9,
    fontWeight: '900' as const,
    color: '#0369A1',
    letterSpacing: 1.1,
  },
  fallbackText: {
    marginTop: 1,
    fontSize: 13,
    fontWeight: '800' as const,
    color: '#0F172A',
  },
  adMobLoadingLayer: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    top: 0,
    alignItems: 'center' as const,
    opacity: 0,
  },
  stickyContainer: {
    alignItems: 'center',
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
});
