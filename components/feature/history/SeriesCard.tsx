import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeIn, useAnimatedStyle, withTiming, useSharedValue } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import type { Match } from '@/types/petanque';
import { MatchCard } from './MatchCard';

export interface SeriesGroup {
  seriesId: string;
  matches: Match[];
  teamAWins: number;
  teamBWins: number;
  seriesWinner: 'A' | 'B' | null;
  isComplete: boolean;
  format: string;
  teamANames: string[];
  teamBNames: string[];
  date: string;
}

interface SeriesCardProps {
  series: SeriesGroup;
  onMatchPress: (match: Match) => void;
  t: (s: string, k: string) => string;
  language: 'fr' | 'en';
}

export const SeriesCard = React.memo(({ series, onMatchPress, t, language }: SeriesCardProps) => {
  const [expanded, setExpanded] = useState(false);
  const rotateAnim = useSharedValue(0);

  const isWin = series.seriesWinner === 'A';
  const seriesScore = `${series.teamAWins}-${series.teamBWins}`;

  const handleToggle = useCallback(() => {
    Haptics.selectionAsync();
    rotateAnim.value = withTiming(expanded ? 0 : 1, { duration: 200 });
    setExpanded(!expanded);
  }, [expanded, rotateAnim]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateAnim.value * 180}deg` }],
  }));

  const getResultText = () => {
    if (!series.isComplete) return t('history', 'inProgress');
    return isWin ? t('history', 'seriesWon') : t('history', 'seriesLost');
  };

  return (
    <View style={styles.seriesCard}>
      <Pressable style={styles.seriesHeader} onPress={handleToggle}>
        <View style={[styles.seriesIndicator, { backgroundColor: isWin ? theme.success : series.isComplete ? theme.error : theme.warning }]} />
        <View style={styles.seriesHeaderContent}>
          <View style={styles.seriesHeaderTop}>
            <View style={styles.seriesBadgeContainer}>
              <View style={[styles.seriesBadge, { backgroundColor: theme.accent + '15' }]}>
                <MaterialIcons name="replay" size={12} color={theme.accent} />
                <Text style={[styles.badgeText, { color: theme.accent }]}>Best of 3</Text>
              </View>
              <View style={[styles.badge, { backgroundColor: theme.primary + '15' }]}>
                <MaterialIcons name="fitness-center" size={12} color={theme.primary} />
                <Text style={[styles.badgeText, { color: theme.primary }]}>{t('formats', series.format)}</Text>
              </View>
            </View>
            <Text style={styles.timeText}>
              {new Date(series.date).toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={styles.seriesTeamsRow}>
            <View style={styles.seriesTeamCol}>
              <Text style={styles.seriesTeamLabel}>{t('history', 'me')}</Text>
              <Text style={styles.seriesTeamNames} numberOfLines={1}>{series.teamANames.slice(0, 2).join(' • ')}</Text>
            </View>
            <View style={styles.seriesScoreContainer}>
              <View style={[styles.seriesScoreBadge, { backgroundColor: isWin ? theme.success : series.isComplete ? theme.error : theme.warning }]}>
                <Text style={styles.seriesScoreText}>{seriesScore}</Text>
              </View>
              <Text style={[styles.seriesResultLabel, { color: isWin ? theme.success : series.isComplete ? theme.error : theme.warning }]}>{getResultText()}</Text>
            </View>
            <View style={[styles.seriesTeamCol, styles.teamRight]}>
              <Text style={styles.seriesTeamLabel}>{t('history', 'opp')}</Text>
              <Text style={styles.seriesTeamNames} numberOfLines={1}>{series.teamBNames.slice(0, 2).join(' • ')}</Text>
            </View>
          </View>
          <View style={styles.seriesFooter}>
            <View style={styles.matchCountRow}>
              {series.matches.map((match) => (
                <View key={match.id} style={[styles.matchDot, { backgroundColor: match.winner === 'A' ? theme.success : theme.error }]} />
              ))}
            </View>
            <View style={styles.expandButton}>
              <Text style={styles.expandText}>{expanded ? t('history', 'collapse') : t('history', 'seeMatches')}</Text>
              <Animated.View style={chevronStyle}>
                <MaterialIcons name="expand-more" size={18} color={theme.primary} />
              </Animated.View>
            </View>
          </View>
        </View>
      </Pressable>
      {expanded ? (
        <Animated.View entering={FadeIn.duration(200)} style={styles.seriesMatchList}>
          {series.matches.map((match) => (
            <MatchCard key={match.id} match={match} onPress={() => onMatchPress(match)} compact t={t} language={language} />
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}, (prev, next) => {
  return prev.series.seriesId === next.series.seriesId &&
    prev.series.teamAWins === next.series.teamAWins &&
    prev.series.teamBWins === next.series.teamBWins &&
    prev.series.isComplete === next.series.isComplete &&
    prev.series.matches.length === next.series.matches.length &&
    prev.language === next.language;
});

const styles = StyleSheet.create({
  seriesCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, marginBottom: 10, ...theme.shadows.card },
  seriesHeader: { flexDirection: 'row' },
  seriesIndicator: { width: 4 },
  seriesHeaderContent: { flex: 1, padding: 12 },
  seriesHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  seriesBadgeContainer: { flexDirection: 'row', gap: 6 },
  seriesBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.borderRadius.full },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.borderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '600' },
  timeText: { fontSize: 11, color: theme.textMuted },
  seriesTeamsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  seriesTeamCol: { flex: 1 },
  teamRight: { alignItems: 'flex-end' },
  seriesTeamLabel: { fontSize: 9, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 2 },
  seriesTeamNames: { fontSize: 12, fontWeight: '500', color: theme.textPrimary },
  seriesScoreContainer: { alignItems: 'center', paddingHorizontal: 12 },
  seriesScoreBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: theme.borderRadius.md, marginBottom: 4 },
  seriesScoreText: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  seriesResultLabel: { fontSize: 10, fontWeight: '600' },
  seriesFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  matchCountRow: { flexDirection: 'row', gap: 6 },
  matchDot: { width: 10, height: 10, borderRadius: 5 },
  expandButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  expandText: { fontSize: 12, fontWeight: '600', color: theme.primary },
  seriesMatchList: { paddingHorizontal: 12, paddingBottom: 12, gap: 8, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10, backgroundColor: theme.surface, borderBottomLeftRadius: theme.borderRadius.md, borderBottomRightRadius: theme.borderRadius.md },
});
