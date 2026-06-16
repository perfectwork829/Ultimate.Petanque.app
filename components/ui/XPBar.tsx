/**
 * XPBar — Visual XP progress bar with level display.
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { getLevelFromXp, getXpProgress, getNextLevel, XP_LEVELS } from '@/services/badgeService';
import theme from '@/constants/theme';

interface Props {
  xp: number;
  language: 'fr' | 'en';
  onPress?: () => void;
}

export default function XPBar({ xp, language, onPress }: Props) {
  const level = getLevelFromXp(xp);
  const progress = getXpProgress(xp);
  const next = getNextLevel(xp);
  const animWidth = useSharedValue(0);

  useEffect(() => {
    animWidth.value = withTiming(progress.percent, {
      duration: 800,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress.percent]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${animWidth.value}%`,
  }));

  const levelColor = (() => {
    switch (level.name) {
      case 'Débutant': return '#10B981';
      case 'Intermédiaire': return '#3B82F6';
      case 'Confirmé': return '#F59E0B';
      case 'Expert': return '#EF4444';
      default: return theme.primary;
    }
  })();

  return (
    <Pressable style={s.container} onPress={onPress} disabled={!onPress}>
      <View style={s.header}>
        <View style={s.levelBadge}>
          <View style={[s.levelIcon, { backgroundColor: levelColor + '20' }]}>
            <MaterialIcons name={level.icon as any} size={16} color={levelColor} />
          </View>
          <Text style={[s.levelName, { color: levelColor }]}>
            {language === 'fr' ? level.name : level.nameEn}
          </Text>
        </View>
        <View style={s.xpInfo}>
          <MaterialIcons name="bolt" size={14} color="#F59E0B" />
          <Text style={s.xpText}>{xp} XP</Text>
        </View>
      </View>

      <View style={s.barOuter}>
        <Animated.View style={[s.barInner, { backgroundColor: levelColor }, barStyle]} />
      </View>

      {next ? (
        <Text style={s.nextLabel}>
          {language === 'fr'
            ? `${progress.current}/${progress.max} XP — ${next.xpNeeded} XP pour ${next.level.name}`
            : `${progress.current}/${progress.max} XP — ${next.xpNeeded} XP to ${next.level.nameEn}`}
        </Text>
      ) : (
        <Text style={s.nextLabel}>
          {language === 'fr' ? 'Niveau maximum atteint !' : 'Maximum level reached!'}
        </Text>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  levelIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelName: {
    fontSize: 15,
    fontWeight: '700',
  },
  xpInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  xpText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#D97706',
  },
  barOuter: {
    height: 8,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  barInner: {
    height: '100%',
    borderRadius: 4,
    minWidth: 4,
  },
  nextLabel: {
    fontSize: 11,
    color: theme.textMuted,
    fontWeight: '500',
  },
});
