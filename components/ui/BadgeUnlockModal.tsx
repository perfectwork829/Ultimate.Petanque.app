/**
 * BadgeUnlockModal — safe badge unlock popup.
 * The layout avoids absolute/animated stacking around the text and CTA so long
 * badge names/descriptions cannot overlap the button on small Android screens.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Platform, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from '@/services/haptics';
import { BADGES, getBadgeName, getBadgeDescription, getBadgeCategoryLabel } from '@/services/badgeService';

interface Props {
  visible: boolean;
  badgeId: string | null;
  language: 'fr' | 'en';
  onClose: () => void;
}

export default function BadgeUnlockModal({ visible, badgeId, language, onClose }: Props) {
  const badge = BADGES.find(b => b.id === badgeId);
  const insets = useSafeAreaInsets();
  const hapticPlayedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || !badgeId || hapticPlayedRef.current === badgeId) return;
    hapticPlayedRef.current = badgeId;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [visible, badgeId]);

  const handleClose = useCallback(() => {
    hapticPlayedRef.current = null;
    onClose();
  }, [onClose]);

  if (!badge || !badgeId) return null;

  const isFr = language === 'fr';
  const badgeName = getBadgeName(badgeId, language);
  const badgeDescription = getBadgeDescription(badgeId, language);
  const catLabel = getBadgeCategoryLabel(badge.category, language);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose} statusBarTranslucent>
      <View style={s.overlay}>
        <LinearGradient
          colors={['#0F172AF8', badge.color + '45', '#0F172AF8']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={s.gradient}
        >
          <View style={s.decorTopLeft} pointerEvents="none" />
          <View style={s.decorBottomRight} pointerEvents="none" />

          <ScrollView
            style={s.scroll}
            contentContainerStyle={[
              s.scrollContent,
              { paddingTop: insets.top + 26, paddingBottom: insets.bottom + 28 },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={false}
          >
            <View style={s.card} pointerEvents="box-none">
              <View style={s.unlockPill}>
                <MaterialIcons name="military-tech" size={16} color="#FCD34D" />
                <Text style={s.unlockText}>{isFr ? 'BADGE DEBLOQUE !' : 'BADGE UNLOCKED!'}</Text>
              </View>

              <View style={[s.iconOuter, { borderColor: badge.color + '55', backgroundColor: badge.color + '18' }]}>
                <View style={[s.iconMiddle, { borderColor: badge.color + '55' }]}>
                  <View style={[s.iconInner, { backgroundColor: badge.color }]}>
                    <MaterialIcons name={badge.icon as any} size={44} color="#FFF" />
                  </View>
                </View>
              </View>

              <Text style={[s.badgeName, { color: badge.color }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>
                {badgeName}
              </Text>

              <View style={[s.catChip, { backgroundColor: badge.color + '18', borderColor: badge.color + '40' }]}>
                <Text style={[s.catChipText, { color: badge.color }]} numberOfLines={1} adjustsFontSizeToFit>
                  {catLabel}
                </Text>
              </View>

              <Text style={s.badgeDesc}>{badgeDescription}</Text>

              <View style={[s.xpReward, { borderColor: badge.color + '35' }]}>
                <MaterialIcons name="bolt" size={22} color="#FCD34D" />
                <Text style={s.xpRewardText}>+{badge.xpReward} XP</Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  s.closeBtn,
                  { backgroundColor: badge.color },
                  pressed && { opacity: 0.86, transform: [{ scale: 0.98 }] },
                ]}
                onPress={handleClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialIcons name="celebration" size={20} color="#FFF" />
                <Text style={s.closeBtnText}>{isFr ? 'Super !' : 'Awesome!'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </LinearGradient>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  gradient: {
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
  decorTopLeft: {
    position: 'absolute',
    top: -80,
    left: -80,
    width: 210,
    height: 210,
    borderRadius: 105,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  decorBottomRight: {
    position: 'absolute',
    bottom: -100,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderRadius: 28,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  unlockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.28)',
    marginBottom: 22,
  },
  unlockText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FCD34D',
    letterSpacing: 1.2,
    includeFontPadding: false,
  },
  iconOuter: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconMiddle: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16 },
      android: { elevation: 0 },
    }),
  },
  badgeName: {
    width: '100%',
    fontSize: 25,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 31,
    marginBottom: 10,
    includeFontPadding: false,
  },
  catChip: {
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 14,
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    textAlign: 'center',
    includeFontPadding: false,
  },
  badgeDesc: {
    width: '100%',
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.76)',
    textAlign: 'center',
    marginBottom: 18,
  },
  xpReward: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.13)',
    borderWidth: 1,
    marginBottom: 22,
  },
  xpRewardText: {
    fontSize: 21,
    fontWeight: '900',
    color: '#FCD34D',
    includeFontPadding: false,
  },
  closeBtn: {
    width: '100%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRadius: 18,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.26, shadowRadius: 12 },
      android: { elevation: 0 },
    }),
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
    includeFontPadding: false,
  },
});
