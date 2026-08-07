/**
 * BadgeUnlockModal — stable unlock popup.
 * Uses normal document flow only: no stacked/absolute CTA, no animated overlap.
 */
import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Platform, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
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
    <Modal
      visible={visible}
      transparent={false}
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent={false}
    >
      <LinearGradient
        colors={['#07111F', '#0F172A', '#07111F']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={s.screen}
      >
        <SafeAreaView style={s.safe}>
          <ScrollView
            style={s.scroll}
            contentContainerStyle={[
              s.scrollContent,
              { paddingTop: Math.max(18, insets.top + 12), paddingBottom: Math.max(28, insets.bottom + 22) },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="always"
            removeClippedSubviews={false}
          >
            <View style={s.card}>
              <View style={s.unlockPill}>
                <MaterialIcons name="military-tech" size={15} color="#FCD34D" />
                <Text style={s.unlockText}>{isFr ? 'BADGE DEBLOQUE !' : 'BADGE UNLOCKED!'}</Text>
              </View>

              <View style={[s.iconOuter, { borderColor: badge.color + '70', backgroundColor: badge.color + '18' }]}> 
                <View style={[s.iconMiddle, { borderColor: badge.color + '70' }]}> 
                  <View style={[s.iconInner, { backgroundColor: badge.color }]}> 
                    <MaterialIcons name={badge.icon as any} size={40} color="#FFF" />
                  </View>
                </View>
              </View>

              <Text style={[s.badgeName, { color: badge.color }]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.72}>
                {badgeName}
              </Text>

              <View style={[s.catChip, { backgroundColor: badge.color + '18', borderColor: badge.color + '45' }]}> 
                <Text style={[s.catChipText, { color: badge.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  {catLabel}
                </Text>
              </View>

              <View style={s.descriptionBox}>
                <Text style={s.badgeDesc}>{badgeDescription}</Text>
              </View>

              <View style={[s.xpReward, { borderColor: badge.color + '35' }]}> 
                <MaterialIcons name="bolt" size={21} color="#FCD34D" />
                <Text style={s.xpRewardText}>+{badge.xpReward} XP</Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  s.closeBtn,
                  { backgroundColor: badge.color },
                  pressed && { opacity: 0.86 },
                ]}
                onPress={handleClose}
                hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
                android_disableSound={false}
              >
                <MaterialIcons name="celebration" size={20} color="#FFF" />
                <Text style={s.closeBtnText}>{isFr ? 'Super !' : 'Awesome!'}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#07111F',
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
    paddingHorizontal: 18,
  },
  card: {
    width: '100%',
    maxWidth: 370,
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 18,
    borderRadius: 28,
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'visible',
    position: 'relative',
  },
  unlockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.30)',
    marginBottom: 22,
  },
  unlockText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FCD34D',
    letterSpacing: 1,
    includeFontPadding: false,
  },
  iconOuter: {
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  iconMiddle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 14 },
      android: { elevation: 0 },
    }),
  },
  badgeName: {
    width: '100%',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 10,
    includeFontPadding: false,
  },
  catChip: {
    maxWidth: '100%',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 16,
  },
  catChipText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
    textAlign: 'center',
    includeFontPadding: false,
  },
  descriptionBox: {
    width: '100%',
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginBottom: 18,
  },
  badgeDesc: {
    width: '100%',
    fontSize: 15,
    lineHeight: 23,
    color: 'rgba(255,255,255,0.86)',
    textAlign: 'center',
    includeFontPadding: true,
  },
  xpReward: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    marginBottom: 22,
  },
  xpRewardText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FCD34D',
    includeFontPadding: false,
  },
  closeBtn: {
    width: '100%',
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 18,
    position: 'relative',
    zIndex: 10,
    elevation: 0,
  },
  closeBtnText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFF',
    includeFontPadding: false,
  },
});
