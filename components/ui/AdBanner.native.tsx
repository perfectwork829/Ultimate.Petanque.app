// ============================================
// AdBanner - Native implementation with Google AdMob
// Gold sponsors replace ads with branded content
// ============================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, AppState } from 'react-native';
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
// MAIN AdBanner COMPONENT
// ============================================
const AdBanner = React.memo(({ position = 'inline', bottomOffset = 0 }: AdBannerProps) => {
  const [isAvailable, setIsAvailable] = useState(true);
  const [nonPersonalized, setNonPersonalized] = useState(true);
  const [goldSponsor, setGoldSponsor] = useState<Ambassador | null>(null);
  const [goldLoaded, setGoldLoaded] = useState(false);
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
    if (!adsModuleAvailable) {
      setIsAvailable(false);
    }
    canShowPersonalizedAds().then(can => setNonPersonalized(!can));
    refreshGoldSponsor();
    const unsubscribe = subscribeGoldSponsorAdRefresh(() => {
      refreshGoldSponsor();
    });
    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') refreshGoldSponsor();
    });
    return () => {
      unsubscribe();
      appStateSub.remove();
    };
  }, [refreshGoldSponsor]);

  useFocusEffect(useCallback(() => {
    refreshGoldSponsor();
  }, [refreshGoldSponsor]));

  // Hide ads for premium users
  if (isPremium) return null;

  // Gold sponsor replaces ad content
  if (goldLoaded && goldSponsor) {
    return <GoldSponsorInline sponsor={goldSponsor} />;
  }

  if (!isAvailable || !adsModuleAvailable || !BannerAdComponent || !AD_UNIT_IDS.banner) {
    return null;
  }

  if (position === 'sticky') {
    return (
      <View style={[styles.stickyContainer, { paddingBottom: bottomOffset }]}>
        <BannerAdComponent
          unitId={AD_UNIT_IDS.banner}
          size={BannerAdSizeEnum.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: nonPersonalized }}
          onAdFailedToLoad={() => setIsAvailable(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.inlineContainer}>
      <BannerAdComponent
        unitId={AD_UNIT_IDS.banner}
        size={BannerAdSizeEnum.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={{ requestNonPersonalizedAdsOnly: nonPersonalized }}
        onAdFailedToLoad={() => setIsAvailable(false)}
      />
    </View>
  );
});

export default AdBanner;

const styles = StyleSheet.create({
  inlineContainer: {
    alignItems: 'center',
    marginVertical: 12,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
  },
  stickyContainer: {
    alignItems: 'center',
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
});
