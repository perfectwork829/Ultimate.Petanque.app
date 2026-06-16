/**
 * BadgeUnlockModal — Fullscreen animated celebration when a new badge is unlocked.
 * All content is centered using flexbox. Animations do not displace anchor point.
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from '@/services/haptics';
import { BADGES, getBadgeName, getBadgeDescription, getBadgeCategoryLabel } from '@/services/badgeService';
import theme from '@/constants/theme';

interface Props {
  visible: boolean;
  badgeId: string | null;
  language: 'fr' | 'en';
  onClose: () => void;
}

export default function BadgeUnlockModal({ visible, badgeId, language, onClose }: Props) {
  const badge = BADGES.find(b => b.id === badgeId);
  const insets = useSafeAreaInsets();
  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const particleRotation = useSharedValue(0);
  const shimmer = useSharedValue(0);

  useEffect(() => {
    if (visible && badge) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      glowOpacity.value = withDelay(
        300,
        withRepeat(
          withSequence(
            withTiming(0.6, { duration: 1000 }),
            withTiming(0.15, { duration: 1000 })
          ),
          -1,
          true
        )
      );
      particleRotation.value = withRepeat(
        withTiming(360, { duration: 10000, easing: Easing.linear }),
        -1,
        false
      );
      shimmer.value = withDelay(
        500,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
            withTiming(0, { duration: 1200, easing: Easing.inOut(Easing.ease) })
          ),
          -1,
          true
        )
      );
    } else {
      pulseScale.value = 1;
      glowOpacity.value = 0;
      particleRotation.value = 0;
      shimmer.value = 0;
    }
  }, [visible, badge]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const particleStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${particleRotation.value}deg` }],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + shimmer.value * 0.4,
  }));

  if (!badge || !badgeId) return null;

  const isFr = language === 'fr';
  const catLabel = getBadgeCategoryLabel(badge.category, language);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.overlay}>
        <LinearGradient
          colors={['#0F172AEE', badge.color + '30', '#0F172AEE']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={s.gradient}
        >
          {/* Decorative particle ring — centered absolutely */}
          <View style={s.particleContainer}>
            <Animated.View style={[s.particleRing, particleStyle]}>
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg, i) => (
                <View
                  key={i}
                  style={[
                    s.particle,
                    {
                      transform: [{ rotate: `${deg}deg` }, { translateY: -130 }],
                      backgroundColor: i % 2 === 0 ? badge.color + '45' : '#F59E0B35',
                      width: i % 3 === 0 ? 10 : 6,
                      height: i % 3 === 0 ? 10 : 6,
                      borderRadius: i % 3 === 0 ? 5 : 3,
                    },
                  ]}
                />
              ))}
            </Animated.View>
          </View>

          {/* Centered column: flex bookends keep hero + CTA visually balanced */}
          <View style={[s.centeredContent, { paddingBottom: insets.bottom + 12 }]}>
            <View style={s.flexBookend} />
            <View style={s.heroColumn}>
              {/* Unlock banner first — keeps icon from overlapping the label on Android (FadeIn layout) */}
              <View style={s.unlockBannerSlot}>
                <Animated.View entering={FadeIn.duration(500).delay(100)} style={s.unlockBannerAnim}>
                  <LinearGradient
                    colors={['#F59E0B22', '#F59E0B08']}
                    style={s.unlockLabelGradient}
                  >
                    <Text style={s.unlockLabel}>
                      {isFr ? 'BADGE DEBLOQUE !' : 'BADGE UNLOCKED!'}
                    </Text>
                  </LinearGradient>
                </Animated.View>
              </View>

              {/* Badge icon — fixed-height slot below banner */}
              <View style={s.iconArea}>
                <Animated.View style={[s.glowRing, { borderColor: badge.color, shadowColor: badge.color }, glowStyle]} />
                <Animated.View style={[s.iconContainer, { backgroundColor: badge.color + '15' }, pulseStyle]}>
                  <View style={[s.iconRing, { borderColor: badge.color + '35' }]}>
                    <View style={[s.iconInner, { backgroundColor: badge.color }]}>
                      <MaterialIcons name={badge.icon as any} size={48} color="#FFF" />
                    </View>
                  </View>
                </Animated.View>
              </View>

              {/* Badge name */}
              <View style={s.titleSlot}>
                <Animated.View entering={FadeInUp.duration(500).delay(250)}>
                  <Text style={[s.badgeName, { color: badge.color }]}>{getBadgeName(badgeId, language)}</Text>
                </Animated.View>
              </View>

              {/* Category chip */}
              <View style={s.centeredSlot}>
                <Animated.View
                  entering={FadeIn.duration(400).delay(350)}
                  style={[s.catChip, { backgroundColor: badge.color + '15', borderColor: badge.color + '30' }]}
                >
                  <Text style={[s.catChipText, { color: badge.color }]}>{catLabel}</Text>
                </Animated.View>
              </View>

              {/* Description */}
              <View style={s.titleSlot}>
                <Animated.View entering={FadeIn.duration(400).delay(400)}>
                  <Text style={s.badgeDesc}>{getBadgeDescription(badgeId, language)}</Text>
                </Animated.View>
              </View>

              {/* XP reward */}
              <View style={s.centeredSlot}>
                <Animated.View entering={FadeIn.duration(400).delay(500)}>
                  <Animated.View style={[s.xpReward, { borderColor: badge.color + '30' }, shimmerStyle]}>
                    <MaterialIcons name="bolt" size={24} color="#FCD34D" />
                    <Text style={s.xpRewardText}>+{badge.xpReward} XP</Text>
                  </Animated.View>
                </Animated.View>
              </View>
            </View>

            <View style={s.flexBookend} />

            {/* Close button */}
            <Animated.View entering={FadeIn.duration(400).delay(600)} style={s.closeBtnWrap}>
              <Pressable
                style={({ pressed }) => [
                  s.closeBtn,
                  { backgroundColor: badge.color },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                ]}
                onPress={onClose}
              >
                <MaterialIcons name="celebration" size={20} color="#FFF" />
                <Text style={s.closeBtnText}>{isFr ? 'Super !' : 'Awesome!'}</Text>
              </Pressable>
            </Animated.View>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#0F172AEE',
  },
  gradient: {
    flex: 1,
  },
  // Particle ring container — absolutely centered
  particleContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 100, // shift particles up slightly to align with icon
  },
  particleRing: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  particle: {
    position: 'absolute',
  },
  // Main column: full width + flex bookends vertically center the hero block
  centeredContent: {
    flex: 1,
    width: '100%',
    flexDirection: 'column',
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  flexBookend: {
    flex: 1,
    minHeight: 8,
  },
  heroColumn: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    alignItems: 'center',
  },
  /** Reserves vertical space so entering animations never collapse into the icon. */
  unlockBannerSlot: {
    width: '100%',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  unlockBannerAnim: {
    alignSelf: 'center',
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: '100%',
  },
  titleSlot: {
    width: '100%',
    maxWidth: 320,
    alignItems: 'center',
    marginBottom: 14,
  },
  // Icon area — fixed box; pulse scale stays inside
  iconArea: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    width: 172,
    height: 172,
    flexShrink: 0,
  },
  glowRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 2,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 30 },
      android: { elevation: 8 },
    }),
  },
  iconContainer: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 20 },
      android: { elevation: 16 },
    }),
  },
  /** Full-width row that centers shrink-wrapped children (pills/chips). */
  centeredSlot: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
  },
  unlockLabelGradient: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F59E0B30',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  unlockLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FCD34D',
    letterSpacing: 1.5,
    textAlign: 'center',
    includeFontPadding: false,
  },
  badgeName: {
    fontSize: 26,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 32,
    letterSpacing: -0.3,
    width: '100%',
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  badgeDesc: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.55)',
    textAlign: 'center',
    lineHeight: 23,
    width: '100%',
  },
  xpReward: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#F59E0B12',
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 28,
    borderWidth: 1,
  },
  xpRewardText: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FCD34D',
  },
  closeBtnWrap: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    flexShrink: 0,
  },
  closeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 18,
    width: '100%',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.3,
  },
});
