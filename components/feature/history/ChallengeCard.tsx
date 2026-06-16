import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import theme from '@/constants/theme';
import type { Challenge } from '@/types/petanque';

const CHALLENGE_CONFIG = {
  '10_tirs': { nameKey: 'tenShots', icon: 'gps-fixed' as const, color: '#F97316' },
  '10_tirs_sautee': { nameKey: 'tenShotsLob', icon: 'sports' as const, color: '#3B82F6' },
  'precision': { nameKey: 'precision', icon: 'stars' as const, color: '#F59E0B' },
} as const;

export { CHALLENGE_CONFIG };

interface ChallengeCardProps {
  challenge: Challenge;
  onPress: () => void;
  t: (s: string, k: string) => string;
  language: 'fr' | 'en';
  isShared?: boolean;
  sharedPermission?: 'read' | 'write' | null;
}

export const ChallengeCard = React.memo(({ challenge, onPress, t, language, isShared, sharedPermission }: ChallengeCardProps) => {
  const config = CHALLENGE_CONFIG[challenge.type];
  const challengeName = t('challenge', config.nameKey);
  const score = challenge.type === 'precision' ? challenge.totalPoints || 0 : challenge.successRate || 0;
  const percentage = Math.min(100, score);
  const is1v1 = challenge.mode === '1v1';

  return (
    <Pressable style={styles.challengeCard} onPress={onPress}>
      <View style={[styles.challengeIndicator, { backgroundColor: config.color }]} />
      <View style={styles.challengeContent}>
        <View style={styles.challengeHeader}>
          <View style={[styles.challengeIconBox, { backgroundColor: config.color + '15' }]}>
            <MaterialIcons name={config.icon} size={20} color={config.color} />
          </View>
          <View style={styles.challengeInfo}>
            <Text style={styles.challengeName}>{challengeName}</Text>
            {challenge.playerName ? (
              <Text style={styles.challengePlayer} numberOfLines={1}>
                {is1v1 ? `${challenge.playerName} vs ${challenge.opponentName}` : challenge.playerName}
              </Text>
            ) : null}
          </View>
          <View style={styles.challengeScoreBox}>
            <Text style={[styles.challengeScoreValue, { color: config.color }]}>
              {score}{challenge.type === 'precision' ? '' : '%'}
            </Text>
            <Text style={styles.challengeScoreLabel}>
              {challenge.type === 'precision' ? 'pts' : t('history', 'success')}
            </Text>
          </View>
        </View>
        <View style={styles.challengeProgress}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${percentage}%`, backgroundColor: config.color }]} />
          </View>
          {challenge.successCount !== undefined ? (
            <Text style={styles.progressLabel}>{challenge.successCount}/{challenge.totalShots}</Text>
          ) : null}
        </View>
        {challenge.sponsorId ? (
          <View style={styles.challengeSponsorRow}>
            {challenge.sponsorPhoto ? (
              <Image source={{ uri: challenge.sponsorPhoto }} style={styles.challengeSponsorPhoto} contentFit="cover" transition={200} />
            ) : null}
            <Text style={styles.challengeSponsorName} numberOfLines={1}>{challenge.sponsorName}</Text>
            <View style={styles.challengeSponsorBadge}>
              <MaterialIcons name="verified" size={9} color="#FFF" />
              <Text style={styles.challengeSponsorBadgeText}>{t('challenge', 'sponsoredBadge')}</Text>
            </View>
          </View>
        ) : null}
        <View style={styles.challengeFooter}>
          {isShared ? (
            <View style={styles.sharedInlineBadge}>
              <MaterialIcons name={sharedPermission === 'write' ? 'edit' : 'visibility'} size={10} color={sharedPermission === 'write' ? theme.accent : theme.primary} />
              <Text style={[styles.sharedInlineBadgeText, { color: sharedPermission === 'write' ? theme.accent : theme.primary }]}>
                {language === 'fr' ? 'Partage' : 'Shared'}
              </Text>
            </View>
          ) : null}
          {is1v1 && challenge.winner ? (
            <View style={[styles.challengeWinnerBadge, { backgroundColor: challenge.winner === 'player' ? theme.success : challenge.winner === 'opponent' ? theme.error : theme.warning }]}>
              <MaterialIcons name={challenge.winner === 'draw' ? 'handshake' : challenge.winner === 'player' ? 'emoji-events' : 'sentiment-dissatisfied'} size={12} color="#FFF" />
              <Text style={styles.challengeWinnerText}>
                {challenge.winner === 'draw' ? t('history', 'draw') : challenge.winner === 'player' ? t('history', 'victory') : t('history', 'defeat')}
              </Text>
            </View>
          ) : null}
          {is1v1 ? (
            <View style={[styles.modeBadge, { backgroundColor: theme.accent + '15' }]}>
              <MaterialIcons name="people" size={10} color={theme.accent} />
              <Text style={[styles.modeBadgeText, { color: theme.accent }]}>1v1</Text>
            </View>
          ) : null}
          {challenge.carreauCount && challenge.carreauCount > 0 ? (
            <View style={[styles.modeBadge, { backgroundColor: theme.carreauColor + '15' }]}>
              <MaterialIcons name="stars" size={10} color={theme.carreauColor} />
              <Text style={[styles.modeBadgeText, { color: theme.carreauColor }]}>{challenge.carreauCount} {challenge.carreauCount > 1 ? t('history', 'carreauxPlural') : t('history', 'carreauSingular')}</Text>
            </View>
          ) : null}
          <Text style={styles.challengeTime}>
            {new Date(challenge.date).toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}, (prev, next) => {
  return prev.challenge.id === next.challenge.id &&
    prev.challenge.successRate === next.challenge.successRate &&
    prev.challenge.totalPoints === next.challenge.totalPoints &&
    prev.challenge.successCount === next.challenge.successCount &&
    prev.challenge.carreauCount === next.challenge.carreauCount &&
    prev.challenge.winner === next.challenge.winner &&
    prev.isShared === next.isShared &&
    prev.sharedPermission === next.sharedPermission &&
    prev.language === next.language;
});

const styles = StyleSheet.create({
  challengeCard: { flexDirection: 'row', backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, marginBottom: 10, overflow: 'hidden', ...theme.shadows.card },
  challengeIndicator: { width: 4 },
  challengeContent: { flex: 1, padding: 12 },
  challengeHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  challengeIconBox: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  challengeInfo: { flex: 1 },
  challengeName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  challengePlayer: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  challengeScoreBox: { alignItems: 'flex-end' },
  challengeScoreValue: { fontSize: 22, fontWeight: '800' },
  challengeScoreLabel: { fontSize: 10, color: theme.textMuted },
  challengeProgress: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  progressTrack: { flex: 1, height: 5, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel: { fontSize: 11, color: theme.textSecondary, fontWeight: '500' },
  challengeSponsorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#FDE68A' },
  challengeSponsorPhoto: { width: 20, height: 20, borderRadius: 6, overflow: 'hidden' as const },
  challengeSponsorName: { flex: 1, fontSize: 11, fontWeight: '600', color: '#92400E' },
  challengeSponsorBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F59E0B', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  challengeSponsorBadgeText: { fontSize: 8, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  challengeFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  challengeWinnerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.borderRadius.full },
  challengeWinnerText: { fontSize: 10, fontWeight: '600', color: '#FFF' },
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: theme.borderRadius.sm },
  modeBadgeText: { fontSize: 10, fontWeight: '600' },
  challengeTime: { fontSize: 10, color: theme.textMuted, marginLeft: 'auto' },
  sharedInlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: theme.borderRadius.full, backgroundColor: theme.primary + '10', borderWidth: 1, borderColor: theme.primary + '20' },
  sharedInlineBadgeText: { fontSize: 10, fontWeight: '700' },
});
