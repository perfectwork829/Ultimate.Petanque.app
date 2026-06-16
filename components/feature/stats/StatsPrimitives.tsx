/**
 * Shared UI primitives for the Stats screen.
 * Extracted from app/(tabs)/stats.tsx for modularity.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import theme from '@/constants/theme';

// ============================================
// ProgressRing
// ============================================
export function ProgressRing({
  value,
  size = 80,
  strokeWidth = 6,
  color = theme.primary,
  label,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  label?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(value, 100) / 100) * circumference;
  const glowRadius = radius + strokeWidth + 4;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size + 8} height={size + 8}>
        <Circle cx={(size + 8) / 2} cy={(size + 8) / 2} r={glowRadius} stroke={color + '12'} strokeWidth={12} fill="none" />
        <Circle cx={(size + 8) / 2} cy={(size + 8) / 2} r={radius} stroke={color + '15'} strokeWidth={strokeWidth} fill="none" />
        <Circle cx={(size + 8) / 2} cy={(size + 8) / 2} r={radius} stroke={color} strokeWidth={strokeWidth + 1} strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" fill="none" rotation="-90" origin={`${(size + 8) / 2}, ${(size + 8) / 2}`} />
      </Svg>
      <View style={StyleSheet.absoluteFill as any}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={[s.ringValue, { color, fontSize: size * 0.24 }]}>{value}%</Text>
          {label ? <Text style={[s.ringLabel, { fontSize: size * 0.10 }]}>{label}</Text> : null}
        </View>
      </View>
    </View>
  );
}

// ============================================
// StatRow
// ============================================
export function StatRow({
  label,
  value,
  subValue,
  icon,
  color,
  isNA = false,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  icon?: string;
  color?: string;
  isNA?: boolean;
}) {
  return (
    <View style={s.statRow}>
      {icon ? (
        <View style={[s.statRowIcon, { backgroundColor: (color || theme.primary) + '15' }]}>
          <MaterialIcons name={icon as any} size={16} color={color || theme.primary} />
        </View>
      ) : null}
      <View style={s.statRowContent}>
        <Text style={s.statRowLabel}>{label}</Text>
        {subValue ? <Text style={s.statRowSubValue}>{subValue}</Text> : null}
      </View>
      <Text style={[s.statRowValue, isNA && s.statRowValueNA, color ? { color } : null]}>
        {isNA ? 'N/A' : value}
      </Text>
    </View>
  );
}

// ============================================
// SectionHeader
// ============================================
export function SectionHeader({ title, subtitle, icon, color }: {
  title: string;
  subtitle?: string;
  icon?: string;
  color?: string;
}) {
  const c = color || theme.primary;
  return (
    <View style={s.sectionHeader}>
      {icon ? (
        <View style={[s.sectionIcon, { backgroundColor: c + '10', borderWidth: 1, borderColor: c + '18' }]}>
          <MaterialIcons name={icon as any} size={17} color={c} />
        </View>
      ) : null}
      <View style={s.sectionHeaderText}>
        <Text style={s.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={s.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[s.sectionAccent, { backgroundColor: c + '08' }]} />
    </View>
  );
}

// ============================================
// ProgressBar
// ============================================
export function ProgressBar({ value, color, showValue = true }: { value: number; color: string; showValue?: boolean }) {
  return (
    <View style={s.progressBarContainer}>
      <View style={s.progressBarTrack}>
        <Animated.View
          entering={FadeIn.duration(600)}
          style={[s.progressBarFill, { width: `${Math.min(value, 100)}%`, backgroundColor: color }]}
        />
        <View style={[s.progressBarShine, { width: `${Math.min(value, 100)}%` }]} />
      </View>
      {showValue ? (
        <View style={[s.progressBarValueBg, { backgroundColor: color + '12' }]}>
          <Text style={[s.progressBarValue, { color }]}>{value}%</Text>
        </View>
      ) : null}
    </View>
  );
}

// ============================================
// BreakdownBar
// ============================================
export function BreakdownBar({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  return (
    <View style={s.breakdownContainer}>
      <View style={s.breakdownBar}>
        {items.map((item, i) => (
          <View
            key={i}
            style={[
              s.breakdownSegment,
              {
                width: total > 0 ? `${(item.value / total) * 100}%` : '0%',
                backgroundColor: item.color,
                borderTopLeftRadius: i === 0 ? 4 : 0,
                borderBottomLeftRadius: i === 0 ? 4 : 0,
                borderTopRightRadius: i === items.length - 1 ? 4 : 0,
                borderBottomRightRadius: i === items.length - 1 ? 4 : 0,
              }
            ]}
          />
        ))}
      </View>
      <View style={s.breakdownLegend}>
        {items.map((item, i) => (
          <View key={i} style={s.breakdownLegendItem}>
            <View style={[s.breakdownDot, { backgroundColor: item.color }]} />
            <Text style={s.breakdownLegendText}>{item.label}</Text>
            <Text style={s.breakdownLegendValue}>{total > 0 ? Math.round((item.value / total) * 100) : 0}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ============================================
// NAPlaceholder
// ============================================
export function NAPlaceholder({ message }: { message: string }) {
  return (
    <View style={s.naPlaceholder}>
      <MaterialIcons name="hourglass-empty" size={20} color={theme.textMuted} />
      <Text style={s.naText}>{message}</Text>
    </View>
  );
}

// ============================================
// InsightBox
// ============================================
export function InsightBox({ icon, color, children }: { icon: string; color: string; children: React.ReactNode }) {
  return (
    <View style={s.insightBox}>
      <MaterialIcons name={icon as any} size={16} color={color} />
      <Text style={s.insightText}>{children}</Text>
    </View>
  );
}

// ============================================
// Styles
// ============================================
const s = StyleSheet.create({
  ringValue: { fontWeight: '800', letterSpacing: -0.5 },
  ringLabel: { color: theme.textSecondary, marginTop: -1, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  statRowIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  statRowContent: { flex: 1 },
  statRowLabel: { fontSize: 13, color: theme.textPrimary, fontWeight: '500' },
  statRowSubValue: { fontSize: 10, color: theme.textMuted, marginTop: 1 },
  statRowValue: { fontSize: 16, fontWeight: '800', color: theme.textPrimary, letterSpacing: -0.3 },
  statRowValueNA: { color: theme.textMuted, fontWeight: '500', fontStyle: 'italic' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10, position: 'relative' as const },
  sectionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, letterSpacing: -0.1 },
  sectionSubtitle: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  sectionAccent: { position: 'absolute', right: 0, top: 4, bottom: 4, width: 3, borderRadius: 2 },
  progressBarContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressBarTrack: { flex: 1, height: 10, backgroundColor: '#F1F5F9', borderRadius: 5, overflow: 'hidden', position: 'relative' as const },
  progressBarFill: { height: '100%', borderRadius: 5 },
  progressBarShine: { position: 'absolute', top: 0, left: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 5 },
  progressBarValueBg: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, minWidth: 50, alignItems: 'center' as const },
  progressBarValue: { fontSize: 13, fontWeight: '800' },
  breakdownContainer: { gap: 12 },
  breakdownBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', backgroundColor: theme.backgroundSecondary },
  breakdownSegment: { height: '100%' },
  breakdownLegend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 12 },
  breakdownLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownLegendText: { fontSize: 11, color: theme.textSecondary },
  breakdownLegendValue: { fontSize: 11, fontWeight: '600', color: theme.textPrimary },
  naPlaceholder: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 8, marginTop: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 8 },
  naText: { fontSize: 11, color: theme.textMuted, flex: 1 },
  insightBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, padding: 14, backgroundColor: '#FFFBEB', borderRadius: 14, borderLeftWidth: 3, borderLeftColor: '#F59E0B', borderWidth: 1, borderTopColor: '#FEF3C7', borderRightColor: '#FEF3C7', borderBottomColor: '#FEF3C7' },
  insightText: { flex: 1, fontSize: 12, color: '#78350F', lineHeight: 18 },
});
