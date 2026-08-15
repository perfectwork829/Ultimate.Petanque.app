/**
 * BadgeUnlockModal — Fullscreen badge unlock celebration.
 *
 * Important Android layout rule:
 * Keep title, description, XP, and CTA in normal vertical flow.
 * Do not use absolute/elevation/animated wrappers around the CTA, because they
 * can visually overlap text and block the button hit area on small screens.
 */
import React, { useCallback, useEffect, useRef } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from '@/services/haptics';
import {
  BADGES,
  getBadgeCategoryLabel,
  getBadgeDescription,
  getBadgeName,
} from '@/services/badgeService';

interface Props {
  visible: boolean;
  badgeId: string | null;
  language: 'fr' | 'en';
  onClose: () => void;
}

export default function BadgeUnlockModal({ visible, badgeId, language, onClose }: Props) {
  const badge = BADGES.find(b => b.id === badgeId);
  const insets = useSafeAreaInsets();
  const hapticBadgeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || !badgeId || hapticBadgeRef.current === badgeId) return;
    hapticBadgeRef.current = badgeId;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [visible, badgeId]);

  const handleClose = useCallback(() => {
    hapticBadgeRef.current = null;
    onClose();
  }, [onClose]);

  if (!badge || !badgeId) return null;

  const isFr = language === 'fr';
  const badgeName = getBadgeName(badgeId, language);
  const badgeDescription = getBadgeDescription(badgeId, language);
  const categoryLabel = getBadgeCategoryLabel(badge.category, language);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <LinearGradient
          colors={['rgba(15,23,42,0.96)', badge.color + '2E', 'rgba(15,23,42,0.97)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.gradient}
        >
          <SafeAreaView style={styles.safe}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingTop: Math.max(22, insets.top + 12),
                  paddingBottom: Math.max(28, insets.bottom + 22),
                },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              removeClippedSubviews={false}
            >
              <View style={styles.content}>
                <View style={styles.unlockPill} pointerEvents="none">
                  <Text style={styles.unlockText}>{isFr ? 'BADGE DEBLOQUE !' : 'BADGE UNLOCKED!'}</Text>
                </View>

                <View style={styles.iconArea} pointerEvents="none">
                  <View style={[styles.outerRing, { borderColor: badge.color + '75' }]} />
                  <View style={[styles.middleRing, { borderColor: badge.color + '45', backgroundColor: badge.color + '18' }]}> 
                    <View style={[styles.iconCircle, { backgroundColor: badge.color }]}> 
                      <MaterialIcons name={badge.icon as any} size={42} color="#FFF" />
                    </View>
                  </View>
                </View>

                <Text
                  style={[styles.badgeName, { color: badge.color }]}
                  numberOfLines={3}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                >
                  {badgeName}
                </Text>

                <View style={[styles.categoryChip, { backgroundColor: badge.color + '18', borderColor: badge.color + '38' }]}>
                  <Text
                    style={[styles.categoryText, { color: badge.color }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    {categoryLabel}
                  </Text>
                </View>

                <Text style={styles.description}>{badgeDescription}</Text>

                <View style={[styles.xpChip, { borderColor: badge.color + '30' }]} pointerEvents="none">
                  <MaterialIcons name="bolt" size={22} color="#FCD34D" />
                  <Text style={styles.xpText}>+{badge.xpReward} XP</Text>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.closeButton,
                    { backgroundColor: badge.color },
                    pressed && styles.closeButtonPressed,
                  ]}
                  onPress={handleClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <MaterialIcons name="celebration" size={20} color="#FFF" />
                  <Text style={styles.closeText}>{isFr ? 'Super !' : 'Awesome!'}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </SafeAreaView>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.96)',
  },
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  content: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  unlockPill: {
    alignSelf: 'center',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.30)',
    marginBottom: 34,
  },
  unlockText: {
    color: '#FCD34D',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
    textAlign: 'center',
    includeFontPadding: false,
  },
  iconArea: {
    width: 142,
    height: 142,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 26,
    overflow: 'visible',
  },
  outerRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    opacity: 0.82,
  },
  middleRing: {
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 14 },
      android: { elevation: 0 },
      default: {},
    }),
  },
  badgeName: {
    width: '100%',
    fontSize: 25,
    lineHeight: 31,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 12,
    includeFontPadding: false,
  },
  categoryChip: {
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 18,
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    includeFontPadding: false,
  },
  description: {
    width: '100%',
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    textAlign: 'center',
    marginBottom: 22,
    includeFontPadding: true,
  },
  xpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(245,158,11,0.14)',
    marginBottom: 26,
  },
  xpText: {
    fontSize: 21,
    fontWeight: '900',
    color: '#FCD34D',
    includeFontPadding: false,
  },
  closeButton: {
    width: '100%',
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    zIndex: 1,
    elevation: 0,
  },
  closeButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  closeText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    includeFontPadding: false,
  },
});
