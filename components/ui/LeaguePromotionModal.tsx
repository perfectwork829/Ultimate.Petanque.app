/**
 * LeaguePromotionModal — Celebration modal when a player is promoted or relegated in league tier.
 * Shows before/after league with gradients+emblems, match trigger summary, and share button.
 */
import React, { useEffect, memo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Platform, Share } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown, FadeInUp, ZoomIn, FadeInLeft, FadeInRight } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { LeagueTier } from '@/services/globalRankingService';
import { router } from 'expo-router';

interface Props {
  visible: boolean;
  onClose: () => void;
  type: 'promotion' | 'relegation';
  newTier: LeagueTier;
  previousTier: LeagueTier;
  elo: number;
  language: string;
}

function LeaguePromotionModal({ visible, onClose, type, newTier, previousTier, elo, language }: Props) {
  const fr = language === 'fr';
  const isPromotion = type === 'promotion';
  const isGrandMaster = (newTier as any).id === 'grand_master' || newTier.minElo >= 2000;
  const eloDelta = elo - (isPromotion ? newTier.minElo : previousTier.minElo);

  useEffect(() => {
    if (visible && isPromotion) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (visible) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  }, [visible, isPromotion]);

  const handleShare = async () => {
    Haptics.selectionAsync();
    const tierName = fr ? newTier.name.fr : newTier.name.en;
    const msg = isPromotion
      ? (fr
        ? `${newTier.emblem} Je viens d'atteindre la ligue ${tierName} (${elo} ELO) sur Ultimate Petanque ! #petanque #elo`
        : `${newTier.emblem} Just reached the ${tierName} league (${elo} ELO) on Ultimate Petanque! #petanque #elo`)
      : '';
    if (msg) {
      try { await Share.share({ message: msg }); } catch { /* silent */ }
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Animated.View entering={ZoomIn.duration(400).springify()} style={s.card}>
          {/* Gradient header — uses NEW tier gradient */}
          <LinearGradient
            colors={isPromotion ? newTier.gradient : ['#374151', '#4B5563']}
            style={s.header}
          >
            {/* Confetti particles for promotion */}
            {isPromotion ? (
              <>
                {[...Array(isGrandMaster ? 20 : 12)].map((_, i) => (
                  <Animated.View
                    key={i}
                    entering={FadeIn.duration(300).delay(200 + i * 50)}
                    style={[s.confettiDot, {
                      top: 8 + (i % 5) * 14,
                      left: 10 + (i * 26) % 300,
                      backgroundColor: isGrandMaster
                        ? ['#FFD700', '#FFF', '#FFD700', '#FCD34D', '#FFF', '#FBBF24', '#FFD700', '#FFF', '#FCD34D', '#FFD700', '#FFF', '#FBBF24', '#FFD700', '#FFF', '#FCD34D', '#FFD700', '#FBBF24', '#FFF', '#FFD700', '#FCD34D'][i]
                        : ['#FCD34D', '#FFF', '#A78BFA', '#34D399', '#F87171', '#60A5FA', '#FBBF24', '#FFF', '#E879F9', '#FCD34D', '#34D399', '#A78BFA'][i % 12],
                      width: isGrandMaster ? 4 + (i % 3) * 2 : 3 + (i % 3) * 2,
                      height: isGrandMaster ? 4 + (i % 3) * 2 : 3 + (i % 3) * 2,
                      borderRadius: 6,
                      opacity: 0.7 + (i % 3) * 0.1,
                    }]}
                  />
                ))}
              </>
            ) : null}

            <Animated.View entering={FadeInDown.duration(400).delay(100)} style={[s.emblemContainer, isGrandMaster && s.emblemContainerGM]}>
              <Text style={[s.emblem, isGrandMaster && { fontSize: 42 }]}>{newTier.emblem}</Text>
            </Animated.View>

            <Animated.Text entering={FadeInDown.duration(400).delay(200)} style={s.typeLabel}>
              {isPromotion
                ? (isGrandMaster ? (fr ? 'ASCENSION SUPREME !' : 'SUPREME ASCENSION!') : (fr ? 'PROMOTION !' : 'PROMOTION!'))
                : (fr ? 'RELEGATION' : 'RELEGATION')}
            </Animated.Text>

            <Animated.Text entering={FadeInDown.duration(400).delay(300)} style={s.tierName}>
              {fr ? newTier.name.fr : newTier.name.en}
            </Animated.Text>

            {/* ELO badge in header */}
            <Animated.View entering={FadeIn.duration(300).delay(350)} style={s.headerEloBadge}>
              <Text style={s.headerEloText}>{elo} ELO</Text>
            </Animated.View>
          </LinearGradient>

          {/* Body */}
          <View style={s.body}>
            {/* Before → After transition with gradient tier cards */}
            <Animated.View entering={FadeInUp.duration(300).delay(400)} style={s.transitionRow}>
              <Animated.View entering={FadeInLeft.duration(300).delay(450)}>
                <LinearGradient colors={[previousTier.gradient[0] + '30', previousTier.gradient[1] + '15']} style={[s.tierCard, { borderColor: previousTier.color + '30' }]}>
                  <Text style={s.tierCardEmblem}>{previousTier.emblem}</Text>
                  <Text style={[s.tierCardName, { color: previousTier.color }]} numberOfLines={1}>
                    {fr ? previousTier.name.fr : previousTier.name.en}
                  </Text>
                  <Text style={s.tierCardRange}>{previousTier.minElo}+</Text>
                </LinearGradient>
              </Animated.View>

              <Animated.View entering={FadeIn.duration(200).delay(550)}>
                <View style={[s.arrowCircle, { backgroundColor: isPromotion ? '#10B98120' : '#EF444420' }]}>
                  <MaterialIcons
                    name={isPromotion ? 'arrow-forward' : 'arrow-forward'}
                    size={18}
                    color={isPromotion ? '#10B981' : '#EF4444'}
                  />
                </View>
              </Animated.View>

              <Animated.View entering={FadeInRight.duration(300).delay(450)}>
                <LinearGradient colors={newTier.gradient} style={[s.tierCard, s.tierCardNew, { borderColor: newTier.color + '50' }]}>
                  <Text style={s.tierCardEmblem}>{newTier.emblem}</Text>
                  <Text style={[s.tierCardName, { color: '#FFF' }]} numberOfLines={1}>
                    {fr ? newTier.name.fr : newTier.name.en}
                  </Text>
                  <Text style={[s.tierCardRange, { color: 'rgba(255,255,255,0.6)' }]}>{newTier.minElo}+</Text>
                </LinearGradient>
              </Animated.View>
            </Animated.View>

            {/* Message */}
            <Animated.Text entering={FadeIn.duration(300).delay(600)} style={s.message}>
              {isPromotion
                ? (isGrandMaster
                  ? (fr
                    ? `Legende ! Vous avez atteint le sommet : Grand Maitre (${elo} ELO). Vous faites partie de l'elite absolue de la petanque !`
                    : `Legend! You reached the summit: Grand Master (${elo} ELO). You are among the absolute elite of petanque!`)
                  : (fr
                    ? `Felicitations ! Vous avez atteint la ligue ${newTier.name.fr}. Continuez a jouer pour monter encore plus haut !`
                    : `Congratulations! You have reached the ${newTier.name.en} league. Keep playing to climb even higher!`))
                : (fr
                  ? `Vous etes descendu en ligue ${newTier.name.fr}. Jouez des matchs pour remonter !`
                  : `You have been relegated to the ${newTier.name.en} league. Play matches to climb back up!`)}
            </Animated.Text>

            {/* CTAs */}
            <View style={s.ctaRow}>
              {isPromotion ? (
                <Pressable style={[s.shareBtn, { borderColor: newTier.color + '40' }]} onPress={handleShare}>
                  <MaterialIcons name="share" size={16} color={newTier.color} />
                  <Text style={[s.shareBtnText, { color: newTier.color }]}>{fr ? 'Partager' : 'Share'}</Text>
                </Pressable>
              ) : null}
              <Pressable style={[s.cta, { backgroundColor: isPromotion ? newTier.color : theme.primary, flex: isPromotion ? 1 : undefined }]} onPress={() => { onClose(); if (!isPromotion) router.push('/match/new' as any); }}>
                <MaterialIcons name={isPromotion ? 'celebration' : 'sports'} size={18} color="#FFF" />
                <Text style={s.ctaText}>
                  {isPromotion
                    ? (fr ? 'Continuer' : 'Continue')
                    : (fr ? 'Jouer un match' : 'Play a match')}
                </Text>
              </Pressable>
            </View>

            {/* View ranking link */}
            <Pressable style={s.viewRankLink} onPress={() => { onClose(); router.push('/leaderboard' as any); }}>
              <MaterialIcons name="leaderboard" size={14} color={theme.textMuted} />
              <Text style={s.viewRankText}>{fr ? 'Voir le classement' : 'View ranking'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default memo(LeaguePromotionModal);

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#FFF',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.35, shadowRadius: 30 },
      android: { elevation: 16 },
      default: {},
    }),
  },
  header: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  confettiDot: {
    position: 'absolute',
    borderRadius: 10,
  },
  emblemContainer: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  emblemContainerGM: {
    width: 88,
    height: 88,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: '#FFD700',
    backgroundColor: 'rgba(255,215,0,0.3)',
    ...Platform.select({
      ios: { shadowColor: '#FFD700', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 16 },
      android: { elevation: 8 },
      default: {},
    }),
  },
  emblem: { fontSize: 36 },
  typeLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: 3,
    marginBottom: 4,
  },
  tierName: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFF',
    letterSpacing: -0.5,
  },
  headerEloBadge: {
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 10,
  },
  headerEloText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
  },
  body: {
    padding: 20,
    alignItems: 'center',
  },
  transitionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  tierCard: {
    width: 110,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  tierCardNew: {
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 8 },
      android: { elevation: 4 },
      default: {},
    }),
  },
  tierCardEmblem: { fontSize: 24, marginBottom: 4 },
  tierCardName: { fontSize: 12, fontWeight: '800', textAlign: 'center' },
  tierCardRange: { fontSize: 10, fontWeight: '600', color: theme.textMuted, marginTop: 2 },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  ctaRow: {
    flexDirection: 'row',
    width: '100%',
    gap: 10,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  shareBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 14,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  viewRankLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 6,
  },
  viewRankText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textMuted,
  },
});
