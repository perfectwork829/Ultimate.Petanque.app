import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '@/constants/theme';
import type { Match } from '@/types/petanque';

interface MatchCardProps {
  match: Match;
  onPress: () => void;
  compact?: boolean;
  t: (s: string, k: string) => string;
  language: 'fr' | 'en';
  isShared?: boolean;
  sharedPermission?: 'read' | 'write' | null;
  eloDelta?: number | null;
}

export const MatchCard = React.memo(({ match, onPress, compact = false, t, language, isShared, sharedPermission, eloDelta }: MatchCardProps) => {
  const isWin = match.winner === 'A';
  const isTournament = match.mode === 'Tournoi';

  if (compact) {
    return (
      <Pressable style={styles.compactMatchCard} onPress={onPress}>
        <View style={[styles.compactIndicator, { backgroundColor: isWin ? theme.success : theme.error }]} />
        <View style={styles.compactMatchContent}>
          <Text style={styles.compactMatchLabel}>
            {match.seriesInfo?.isFinale ? t('history', 'finale') : `${t('history', 'matchN')} ${match.seriesInfo?.matchNumber}`}
          </Text>
          <View style={styles.compactScoreRow}>
            <Text style={[styles.compactScore, isWin && styles.compactScoreWin]}>{match.teamA.score}</Text>
            <Text style={styles.compactScoreSep}>-</Text>
            <Text style={[styles.compactScore, !isWin && styles.compactScoreLoss]}>{match.teamB.score}</Text>
          </View>
        </View>
        <MaterialIcons name={isWin ? 'check-circle' : 'cancel'} size={16} color={isWin ? theme.success : theme.error} />
      </Pressable>
    );
  }

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={[styles.cardIndicator, { backgroundColor: isWin ? theme.success : theme.error }]} />
      <View style={styles.cardContent}>
        <View style={styles.cardHeader}>
          <View style={[styles.badge, { backgroundColor: isTournament ? theme.carreauColor + '15' : theme.primary + '15' }]}>
            <MaterialIcons name={isTournament ? 'emoji-events' : 'fitness-center'} size={12} color={isTournament ? theme.carreauColor : theme.primary} />
            <Text style={[styles.badgeText, { color: isTournament ? theme.carreauColor : theme.primary }]}>
              {isTournament ? t('modes', 'tournament') : t('modes', 'training')}
            </Text>
          </View>
          <Text style={styles.timeText}>
            {new Date(match.date).toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        {isTournament && match.tournamentName ? <Text style={styles.tournamentName} numberOfLines={1}>{match.tournamentName}</Text> : null}
        <View style={styles.scoreRow}>
          <View style={styles.teamCol}>
            <Text style={styles.teamLabel}>{t('history', 'me')}</Text>
            <Text style={styles.teamNames} numberOfLines={1}>{match.teamA.playerNames.slice(0, 2).join(' • ')}</Text>
          </View>
          <View style={styles.scoreBox}>
            <Text style={[styles.scoreNum, isWin && styles.scoreWin]}>{match.teamA.score}</Text>
            <Text style={styles.scoreSep}>-</Text>
            <Text style={[styles.scoreNum, !isWin && styles.scoreLoss]}>{match.teamB.score}</Text>
          </View>
          <View style={[styles.teamCol, styles.teamRight]}>
            <Text style={styles.teamLabel}>{t('history', 'opp')}</Text>
            <Text style={styles.teamNames} numberOfLines={1}>{match.teamB.playerNames.slice(0, 2).join(' • ')}</Text>
          </View>
        </View>
        <View style={styles.cardFooter}>
          <View style={[styles.resultBadge, { backgroundColor: isWin ? theme.success + '15' : theme.error + '15' }]}>
            <MaterialIcons name={isWin ? 'check-circle' : 'cancel'} size={12} color={isWin ? theme.success : theme.error} />
            <Text style={[styles.resultText, { color: isWin ? theme.success : theme.error }]}>
              {isWin ? t('history', 'victory') : t('history', 'defeat')}
            </Text>
          </View>
          {eloDelta !== undefined && eloDelta !== null && eloDelta !== 0 ? (
            <View style={[styles.eloDeltaBadge, { backgroundColor: eloDelta > 0 ? '#10B98115' : '#EF444415' }]}>
              <MaterialIcons name={eloDelta > 0 ? 'arrow-upward' : 'arrow-downward'} size={10} color={eloDelta > 0 ? '#10B981' : '#EF4444'} />
              <Text style={[styles.eloDeltaText, { color: eloDelta > 0 ? '#10B981' : '#EF4444' }]}>
                {eloDelta > 0 ? `+${eloDelta}` : `${eloDelta}`} ELO
              </Text>
            </View>
          ) : null}
          {isShared ? (
            <View style={styles.sharedInlineBadge}>
              <MaterialIcons name={sharedPermission === 'write' ? 'edit' : 'visibility'} size={10} color={sharedPermission === 'write' ? theme.accent : theme.primary} />
              <Text style={[styles.sharedInlineBadgeText, { color: sharedPermission === 'write' ? theme.accent : theme.primary }]}>
                {language === 'fr' ? 'Partage' : 'Shared'}
              </Text>
            </View>
          ) : null}
          <Text style={styles.formatText}>{t('formats', match.format)}</Text>
        </View>
      </View>
    </Pressable>
  );
}, (prev, next) => {
  return prev.match.id === next.match.id &&
    prev.match.teamA.score === next.match.teamA.score &&
    prev.match.teamB.score === next.match.teamB.score &&
    prev.match.winner === next.match.winner &&
    prev.compact === next.compact &&
    prev.isShared === next.isShared &&
    prev.sharedPermission === next.sharedPermission &&
    prev.eloDelta === next.eloDelta &&
    prev.language === next.language;
});

const styles = StyleSheet.create({
  card: { flexDirection: 'row', backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, marginBottom: 10, overflow: 'hidden', ...theme.shadows.card },
  cardIndicator: { width: 4 },
  cardContent: { flex: 1, padding: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.borderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '600' },
  timeText: { fontSize: 11, color: theme.textMuted },
  tournamentName: { fontSize: 12, color: theme.textSecondary, marginBottom: 8 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  teamCol: { flex: 1 },
  teamRight: { alignItems: 'flex-end' },
  teamLabel: { fontSize: 9, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 2 },
  teamNames: { fontSize: 12, fontWeight: '500', color: theme.textPrimary },
  scoreBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, marginHorizontal: 8 },
  scoreNum: { fontSize: 18, fontWeight: '800', color: theme.textSecondary, minWidth: 20, textAlign: 'center' },
  scoreWin: { color: theme.success },
  scoreLoss: { color: theme.error },
  scoreSep: { fontSize: 14, color: theme.textMuted, marginHorizontal: 4 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.borderRadius.full },
  resultText: { fontSize: 11, fontWeight: '600' },
  formatText: { fontSize: 11, color: theme.textMuted },
  sharedInlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: theme.borderRadius.full, backgroundColor: theme.primary + '10', borderWidth: 1, borderColor: theme.primary + '20' },
  sharedInlineBadgeText: { fontSize: 10, fontWeight: '700' },
  compactMatchCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.sm, padding: 10, gap: 10 },
  compactIndicator: { width: 3, height: 28, borderRadius: 2 },
  compactMatchContent: { flex: 1 },
  compactMatchLabel: { fontSize: 11, fontWeight: '600', color: theme.textSecondary, marginBottom: 2 },
  compactScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  compactScore: { fontSize: 16, fontWeight: '700', color: theme.textSecondary },
  compactScoreWin: { color: theme.success },
  compactScoreLoss: { color: theme.error },
  compactScoreSep: { fontSize: 12, color: theme.textMuted },
  eloDeltaBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: theme.borderRadius.full },
  eloDeltaText: { fontSize: 10, fontWeight: '800' },
});

// Custom comparator for React.memo — avoid re-renders from stable-content object references
MatchCard.displayName = 'MatchCard';
