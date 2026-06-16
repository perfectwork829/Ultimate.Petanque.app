/**
 * LevelUpModal — Animated modal shown when an ambassador reaches the next level.
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeIn,
  ZoomIn,
  SlideInUp,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import { AmbassadorLevel, AMBASSADOR_LEVELS } from '@/services/ambassadorService';
import theme from '@/constants/theme';

interface Props {
  visible: boolean;
  newLevel: AmbassadorLevel | null;
  language: 'fr' | 'en';
  onClose: () => void;
}

const LEVEL_CONFIG: Record<AmbassadorLevel, {
  nameFr: string;
  nameEn: string;
  descFr: string;
  descEn: string;
  celebrationFr: string;
  celebrationEn: string;
}> = {
  decouverte: {
    nameFr: 'Decouverte',
    nameEn: 'Discovery',
    descFr: 'Bienvenue dans le programme ambassadeur !',
    descEn: 'Welcome to the ambassador program!',
    celebrationFr: 'Premiers pas !',
    celebrationEn: 'First steps!',
  },
  confirme: {
    nameFr: 'Confirme',
    nameEn: 'Confirmed',
    descFr: 'Vous etes desormais un ambassadeur reconnu avec une banniere rotative, un dashboard complet et des defis illimites.',
    descEn: 'You are now a recognized ambassador with rotating banner, full dashboard and unlimited challenges.',
    celebrationFr: 'Ambassadeur Confirme !',
    celebrationEn: 'Confirmed Ambassador!',
  },
  elite: {
    nameFr: 'Elite',
    nameEn: 'Elite',
    descFr: 'Vous avez atteint le sommet ! Banniere permanente, push illimites, section onboarding dediee et analytics avances.',
    descEn: 'You reached the top! Permanent banner, unlimited push, dedicated onboarding section and advanced analytics.',
    celebrationFr: 'Ambassadeur Elite !',
    celebrationEn: 'Elite Ambassador!',
  },
};

export default function LevelUpModal({ visible, newLevel, language, onClose }: Props) {
  const levelConf = newLevel ? AMBASSADOR_LEVELS[newLevel] : null;
  const levelInfo = newLevel ? LEVEL_CONFIG[newLevel] : null;

  const pulseScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0);
  const confettiRotate = useSharedValue(0);

  useEffect(() => {
    if (visible && newLevel) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.18, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
      glowOpacity.value = withDelay(
        200,
        withRepeat(
          withSequence(
            withTiming(0.7, { duration: 900 }),
            withTiming(0.15, { duration: 900 })
          ),
          -1,
          true
        )
      );
      confettiRotate.value = withRepeat(
        withTiming(360, { duration: 8000, easing: Easing.linear }),
        -1,
        false
      );
    }
  }, [visible, newLevel]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const confettiStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${confettiRotate.value}deg` }],
  }));

  if (!newLevel || !levelConf || !levelInfo) return null;

  const fr = language === 'fr';
  const color = levelConf.color;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(300)} style={s.overlay}>
        <Animated.View entering={ZoomIn.duration(600).springify()} style={s.card}>
          {/* Glow ring */}
          <Animated.View style={[s.glowRing, { borderColor: color }, glowStyle]} />

          {/* Decorative confetti circles */}
          <Animated.View style={[s.confettiContainer, confettiStyle]} pointerEvents="none">
            {[0, 60, 120, 180, 240, 300].map((deg, i) => {
              const rad = (deg * Math.PI) / 180;
              const r = 130;
              const colors = ['#F59E0B', '#7C3AED', '#3B82F6', '#10B981', '#EF4444', '#EC4899'];
              return (
                <View
                  key={i}
                  style={[
                    s.confettiDot,
                    {
                      backgroundColor: colors[i],
                      left: 150 + Math.cos(rad) * r - 5,
                      top: 150 + Math.sin(rad) * r - 5,
                    },
                  ]}
                />
              );
            })}
          </Animated.View>

          {/* Level icon */}
          <Animated.View style={[s.iconContainer, { backgroundColor: color + '20' }, pulseStyle]}>
            <View style={[s.iconInner, { backgroundColor: color }]}>
              <MaterialIcons name={levelConf.icon as any} size={44} color="#FFF" />
            </View>
          </Animated.View>

          {/* Title */}
          <Animated.View entering={SlideInUp.duration(400).delay(250)}>
            <Text style={s.unlockLabel}>
              {fr ? '🚀 NIVEAU SUPERIEUR !' : '🚀 LEVEL UP!'}
            </Text>
            <Text style={[s.levelName, { color }]}>
              {fr ? levelInfo.celebrationFr : levelInfo.celebrationEn}
            </Text>
            <Text style={s.levelDesc}>
              {fr ? levelInfo.descFr : levelInfo.descEn}
            </Text>
          </Animated.View>

          {/* New benefits preview */}
          <Animated.View entering={FadeIn.duration(300).delay(500)} style={s.benefitsCard}>
            <Text style={s.benefitsTitle}>
              {fr ? 'Nouveaux avantages' : 'New benefits'}
            </Text>
            {newLevel === 'confirme' ? (
              <>
                <BenefitRow icon="view-carousel" color="#7C3AED" text={fr ? 'Banniere rotative accueil' : 'Rotating home banner'} />
                <BenefitRow icon="dashboard" color="#3B82F6" text={fr ? 'Dashboard analytics complet' : 'Full analytics dashboard'} />
                <BenefitRow icon="all-inclusive" color="#10B981" text={fr ? 'Defis sponsorises illimites' : 'Unlimited sponsored challenges'} />
              </>
            ) : newLevel === 'elite' ? (
              <>
                <BenefitRow icon="push-pin" color="#F59E0B" text={fr ? 'Banniere permanente' : 'Permanent banner'} />
                <BenefitRow icon="notifications-active" color="#7C3AED" text={fr ? 'Push notifications illimitees' : 'Unlimited push notifications'} />
                <BenefitRow icon="download" color="#3B82F6" text={fr ? 'Analytics avances + export' : 'Advanced analytics + export'} />
                <BenefitRow icon="star" color="#EF4444" text={fr ? 'Section onboarding dediee' : 'Dedicated onboarding section'} />
              </>
            ) : null}
          </Animated.View>

          {/* Close */}
          <Pressable
            style={({ pressed }) => [s.closeBtn, { backgroundColor: color }, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
            onPress={onClose}
          >
            <Text style={s.closeBtnText}>{fr ? 'Genial !' : 'Awesome!'}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function BenefitRow({ icon, color, text }: { icon: string; color: string; text: string }) {
  return (
    <View style={s.benefitRow}>
      <View style={[s.benefitIcon, { backgroundColor: color + '15' }]}>
        <MaterialIcons name={icon as any} size={14} color={color} />
      </View>
      <Text style={s.benefitText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 40,
    paddingHorizontal: 28,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
    position: 'relative',
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  glowRing: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 32,
    borderWidth: 3,
  },
  confettiContainer: {
    position: 'absolute',
    width: 300,
    height: 300,
    top: -20,
    left: '50%',
    marginLeft: -150,
  },
  confettiDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    opacity: 0.3,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  iconInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  unlockLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#78350F',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 8,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    overflow: 'hidden',
  },
  levelName: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  levelDesc: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  benefitsCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  benefitsTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  benefitIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    flex: 1,
  },
  closeBtn: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
  },
  closeBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
  },
});
