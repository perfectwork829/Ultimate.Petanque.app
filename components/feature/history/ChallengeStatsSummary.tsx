import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '@/constants/theme';
import type { Challenge } from '@/types/petanque';
import { CHALLENGE_CONFIG } from './ChallengeCard';

interface ChallengeStatsSummaryProps {
  challenges: Challenge[];
  t: (s: string, k: string) => string;
}

export const ChallengeStatsSummary = React.memo(({ challenges, t }: ChallengeStatsSummaryProps) => {
  const stats = useMemo(() => {
    const byType = {
      '10_tirs': challenges.filter(c => c.type === '10_tirs'),
      '10_tirs_sautee': challenges.filter(c => c.type === '10_tirs_sautee'),
      'precision': challenges.filter(c => c.type === 'precision'),
    };

    const avgRate = (arr: Challenge[]) => {
      if (arr.length === 0) return 0;
      return Math.round(arr.reduce((sum, c) => sum + (c.successRate || c.totalPoints || 0), 0) / arr.length);
    };

    return {
      total: challenges.length,
      byType: {
        '10_tirs': { count: byType['10_tirs'].length, avg: avgRate(byType['10_tirs']) },
        '10_tirs_sautee': { count: byType['10_tirs_sautee'].length, avg: avgRate(byType['10_tirs_sautee']) },
        'precision': { count: byType['precision'].length, avg: avgRate(byType['precision']) },
      },
    };
  }, [challenges]);

  if (challenges.length === 0) return null;

  return (
    <View style={styles.challengeStatsCard}>
      <View style={styles.challengeStatsHeader}>
        <MaterialIcons name="track-changes" size={18} color={theme.primary} />
        <Text style={styles.challengeStatsTitle}>{t('history', 'challengeSummary')}</Text>
        <View style={styles.challengeStatsCount}>
          <Text style={styles.challengeStatsCountText}>{stats.total}</Text>
        </View>
      </View>
      <View style={styles.challengeStatsGrid}>
        {(Object.keys(CHALLENGE_CONFIG) as (keyof typeof CHALLENGE_CONFIG)[]).map(type => {
          const cfg = CHALLENGE_CONFIG[type];
          const challengeName = t('challenge', cfg.nameKey);
          const data = stats.byType[type];
          if (data.count === 0) return null;
          return (
            <View key={type} style={styles.challengeStatItem}>
              <View style={[styles.challengeStatIcon, { backgroundColor: cfg.color + '15' }]}>
                <MaterialIcons name={cfg.icon} size={16} color={cfg.color} />
              </View>
              <View style={styles.challengeStatInfo}>
                <Text style={styles.challengeStatName}>{challengeName}</Text>
                <Text style={styles.challengeStatMeta}>
                  {data.count} {data.count > 1 ? t('history', 'challenges').toLowerCase() : t('history', 'challenges').toLowerCase()} • {data.avg}{type === 'precision' ? ' pts' : '%'} {t('history', 'avg')}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  challengeStatsCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    marginBottom: 16,
    ...theme.shadows.card,
  },
  challengeStatsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  challengeStatsTitle: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  challengeStatsCount: { backgroundColor: theme.primary + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.borderRadius.full },
  challengeStatsCountText: { fontSize: 12, fontWeight: '700', color: theme.primary },
  challengeStatsGrid: { gap: 8 },
  challengeStatItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  challengeStatIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  challengeStatInfo: { flex: 1 },
  challengeStatName: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  challengeStatMeta: { fontSize: 11, color: theme.textSecondary, marginTop: 1 },
});
