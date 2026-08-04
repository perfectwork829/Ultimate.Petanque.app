// ============================================
// AdBanner - Web: Gold sponsor replacement or null
// ============================================
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useAppUI } from '@/contexts/AppContext';
import {
  getActiveGoldSponsorForAdReplacement,
  subscribeGoldSponsorAdRefresh,
} from '@/services/goldSponsorAdReplacement';
import type { Ambassador } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';

interface AdBannerProps {
  position?: 'inline' | 'sticky';
  bottomOffset?: number;
}

const AdBanner = React.memo((_props: AdBannerProps) => {
  const { isPremium } = useAppUI();
  const [sponsor, setSponsor] = useState<Ambassador | null>(null);
  const [loaded, setLoaded] = useState(false);
  const impressionTracked = useRef(false);

  const refreshGoldSponsor = useCallback(async () => {
    try {
      const gold = await getActiveGoldSponsorForAdReplacement();
      setSponsor(gold);
    } catch {
      setSponsor(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refreshGoldSponsor();
    const unsubscribe = subscribeGoldSponsorAdRefresh(() => {
      refreshGoldSponsor();
    });
    return () => unsubscribe();
  }, [refreshGoldSponsor]);

  useFocusEffect(useCallback(() => {
    refreshGoldSponsor();
  }, [refreshGoldSponsor]));

  useEffect(() => {
    if (!sponsor || impressionTracked.current) return;
    impressionTracked.current = true;
    trackAmbassadorEvent(sponsor.id, 'banner_impression', undefined, { sourcePage: 'ad_replacement_web' });
  }, [sponsor]);

  // Hide all banners for premium users
  if (isPremium) return null;

  if (!loaded) return null;

  // Gold sponsor replaces the normal ad banner.
  if (!sponsor) {
    return (
      <View style={webStyles.adPlaceholder}>
        <Text style={webStyles.adLabel}>ADVERTISEMENT</Text>
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [webStyles.container, pressed && { opacity: 0.92 }]}
      onPress={() => {
        trackAmbassadorEvent(sponsor.id, 'profile_view', undefined, { sourcePage: 'ad_replacement_web' });
        router.push('/partners');
      }}
    >
      <LinearGradient colors={['#FFFBEB', '#FEF3C7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={webStyles.gradient}>
        <View style={webStyles.goldAccent} />
        <View style={webStyles.content}>
          {sponsor.photo ? (
            <Image source={{ uri: sponsor.photo }} style={webStyles.logo} contentFit="cover" transition={200} />
          ) : (
            <LinearGradient colors={['#B45309', '#F59E0B']} style={webStyles.logoFallback}>
              <MaterialIcons name="workspace-premium" size={16} color="#FFF" />
            </LinearGradient>
          )}
          <View style={{ flex: 1 }}>
            <View style={webStyles.labelRow}>
              <LinearGradient colors={['#B45309', '#D97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={webStyles.goldLabel}>
                <Text style={webStyles.goldLabelText}>SPONSOR OR</Text>
              </LinearGradient>
            </View>
            <Text style={webStyles.name} numberOfLines={1}>{sponsor.displayName}</Text>
          </View>
          <MaterialIcons name="open-in-new" size={14} color="#B45309" />
        </View>
      </LinearGradient>
    </Pressable>
  );
});

export default AdBanner;

const webStyles = StyleSheet.create({
  adPlaceholder: {
    marginVertical: 12,
    minHeight: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  adLabel: { fontSize: 10, fontWeight: '700' as const, color: '#94A3B8', letterSpacing: 1 },
  container: { marginVertical: 12, borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, borderColor: '#F59E0B' },
  gradient: { borderRadius: 12, position: 'relative' as const },
  goldAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, backgroundColor: '#F59E0B' },
  content: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 10, paddingHorizontal: 12, gap: 10 },
  logo: { width: 36, height: 36, borderRadius: 10 },
  logoFallback: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  labelRow: { flexDirection: 'row' as const, marginBottom: 2 },
  goldLabel: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  goldLabelText: { fontSize: 7, fontWeight: '900' as const, color: '#FFF', letterSpacing: 0.6 },
  name: { fontSize: 13, fontWeight: '700' as const, color: '#78350F' },
});
