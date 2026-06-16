/**
 * EloSparkline — Mini sparkline chart showing ELO progression.
 * Renders using simple Views (no SVG dependency for this component).
 * Shows last N ELO points with win/loss coloring and trend indicator.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '@/constants/theme';

interface EloPoint {
  elo: number;
  won: boolean;
}

interface Props {
  points: EloPoint[];
  currentElo: number;
  weekDelta: number;
  width?: number;
  height?: number;
  language?: string;
}

export default function EloSparkline({ points, currentElo, weekDelta, width = 200, height = 48, language = 'fr' }: Props) {
  if (points.length < 2) return null;

  const fr = language === 'fr';
  const elos = points.map(p => p.elo);
  const min = Math.min(...elos) - 15;
  const max = Math.max(...elos) + 15;
  const range = Math.max(max - min, 1);
  const barWidth = Math.max(2, Math.floor((width - 8) / points.length) - 1);
  const gap = 1;

  return (
    <View style={[s.container, { width }]}>
      {/* Sparkline bars */}
      <View style={[s.chartArea, { height }]}>
        {points.map((p, i) => {
          const h = Math.max(3, ((p.elo - min) / range) * (height - 4));
          const isLast = i === points.length - 1;
          return (
            <View
              key={i}
              style={[
                s.bar,
                {
                  width: barWidth,
                  height: h,
                  backgroundColor: p.won ? '#22C55E' : '#EF4444',
                  opacity: isLast ? 1 : 0.5 + (i / points.length) * 0.5,
                  borderRadius: barWidth > 3 ? 2 : 1,
                },
              ]}
            />
          );
        })}
      </View>
      {/* Trend indicator */}
      <View style={s.trendRow}>
        {weekDelta !== 0 ? (
          <View style={[s.trendBadge, { backgroundColor: weekDelta > 0 ? '#22C55E12' : '#EF444412' }]}>
            <MaterialIcons
              name={weekDelta > 0 ? 'trending-up' : 'trending-down'}
              size={12}
              color={weekDelta > 0 ? '#22C55E' : '#EF4444'}
            />
            <Text style={[s.trendText, { color: weekDelta > 0 ? '#22C55E' : '#EF4444' }]}>
              {weekDelta > 0 ? '+' : ''}{weekDelta}
            </Text>
          </View>
        ) : (
          <View style={[s.trendBadge, { backgroundColor: theme.backgroundSecondary }]}>
            <MaterialIcons name="trending-flat" size={12} color={theme.textMuted} />
            <Text style={[s.trendText, { color: theme.textMuted }]}>=</Text>
          </View>
        )}
        <Text style={s.periodText}>{fr ? '7j' : '7d'}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1,
    paddingHorizontal: 4,
  },
  bar: {
    minHeight: 3,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  trendText: {
    fontSize: 10,
    fontWeight: '700',
  },
  periodText: {
    fontSize: 9,
    fontWeight: '600',
    color: theme.textMuted,
  },
});
