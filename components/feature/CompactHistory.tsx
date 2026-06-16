import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import theme from '@/constants/theme';
import { HistorySkeleton } from '@/components/ui/SkeletonLoader';
import { getMatchValidationLevel, getValidationColor, getValidationIcon } from '@/services/trustScoreService';

interface HistoryItem {
  type: 'match' | 'challenge';
  id: string;
  date: string;
  title: string;
  subtitle: string;
  result: 'win' | 'loss' | 'draw' | 'neutral';
  score?: string;
  icon: keyof typeof MaterialIcons.glyphMap;
}

interface Props {
  recentResults: HistoryItem[];
  matches: any[];
  hasData: boolean;
  language: string;
  t: (ns: string, key: string) => string;
}

const resultColor = (r: string) =>
  r === 'win' ? theme.success : r === 'loss' ? theme.error : r === 'draw' ? theme.warning : theme.textMuted;

function CompactHistory({ recentResults, matches, hasData, language, t }: Props) {
  // Show skeleton when data exists but results not yet computed
  if (recentResults.length === 0 && hasData) {
    return (
      <View>
        <View style={s.headerRow}>
          <MaterialIcons name="history" size={18} color={theme.primary} />
          <Text style={s.headerTitle}>{t('history', 'history')}</Text>
        </View>
        <HistorySkeleton />
      </View>
    );
  }

  if (recentResults.length === 0) return null;

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const getGroup = (dateStr: string) => {
    const d = new Date(dateStr);
    if (d.toDateString() === today.toDateString()) return 'today';
    if (d.toDateString() === yesterday.toDateString()) return 'yesterday';
    if (d >= weekAgo) return 'week';
    return 'older';
  };

  const groupLabels: Record<string, string> = {
    today: language === 'fr' ? "Aujourd'hui" : 'Today',
    yesterday: language === 'fr' ? 'Hier' : 'Yesterday',
    week: language === 'fr' ? 'Cette semaine' : 'This week',
    older: language === 'fr' ? 'Plus ancien' : 'Older',
  };

  let lastGroup = '';

  return (
    <View>
      <View style={s.headerRow}>
        <MaterialIcons name="history" size={18} color={theme.primary} />
        <Text style={s.headerTitle}>{t('history', 'history')}</Text>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => router.push('/history')} style={s.seeAllBtn}>
          <Text style={s.seeAllText}>{t('common', 'seeAll')}</Text>
          <MaterialIcons name="chevron-right" size={16} color={theme.primary} />
        </Pressable>
      </View>
      <View style={s.list}>
        {recentResults.map((item, idx) => {
          const d = new Date(item.date);
          const group = getGroup(item.date);
          const showHeader = group !== lastGroup;
          lastGroup = group;
          const isLast = idx === recentResults.length - 1;

          return (
            <React.Fragment key={item.id}>
              {showHeader ? (
                <View style={s.dateHeader}>
                  <View style={s.dateDot} />
                  <Text style={s.dateLabel}>{groupLabels[group]}</Text>
                  <View style={s.dateLine} />
                </View>
              ) : null}
              <Pressable
                style={({ pressed }) => [s.row, !isLast && s.rowBorder, pressed && { opacity: 0.75, backgroundColor: theme.backgroundSecondary }]}
                onPress={() => item.type === 'match'
                  ? router.push(`/match-detail/${item.id}` as any)
                  : router.push(`/challenge/${item.id}` as any)}
              >
                <View style={[s.dot, { backgroundColor: resultColor(item.result) }]} />
                <View style={[s.typeIcon, { backgroundColor: (item.type === 'match' ? theme.primary : theme.accent) + '12' }]}>
                  <MaterialIcons name={item.icon} size={14} color={item.type === 'match' ? theme.primary : theme.accent} />
                </View>
                <View style={s.info}>
                  <Text style={s.title} numberOfLines={1}>{item.title}</Text>
                  <View style={s.subRow}>
                    <Text style={s.sub} numberOfLines={1}>
                      {item.subtitle} {' • '} {d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                    </Text>
                    {item.type === 'match' ? (() => {
                      const match = matches.find((m: any) => m.id === item.id);
                      const pIds = (match as any)?.participantUserIds || [];
                      const vLevel = getMatchValidationLevel(Array.isArray(pIds) ? pIds.length : 0);
                      const vColor = getValidationColor(vLevel);
                      return (
                        <View style={s.validation}>
                          <MaterialIcons name={getValidationIcon(vLevel) as any} size={9} color={vColor} />
                          <Text style={{ fontSize: 8, fontWeight: '700', color: vColor }}>
                            {vLevel === 'solo' ? '0.3x' : vLevel === 'shared_2' ? '1x' : vLevel === 'shared_3plus' ? '1.5x' : '2x'}
                          </Text>
                        </View>
                      );
                    })() : null}
                  </View>
                </View>
                <Text style={[s.score, { color: resultColor(item.result) }]}>{item.score}</Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

export default memo(CompactHistory, (prev, next) => {
  // Skip re-render if the data that drives the UI hasn't changed
  if (prev.recentResults.length !== next.recentResults.length) return false;
  if (prev.hasData !== next.hasData) return false;
  if (prev.language !== next.language) return false;
  if (prev.matches.length !== next.matches.length) return false;
  // Deep-compare recent results by id + score (avoids re-render from new array references)
  for (let i = 0; i < prev.recentResults.length; i++) {
    const a = prev.recentResults[i];
    const b = next.recentResults[i];
    if (a.id !== b.id || a.score !== b.score || a.result !== b.result) return false;
  }
  return true;
});

const s = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 13, fontWeight: '600', color: theme.primary },
  list: { backgroundColor: '#FFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', overflow: 'hidden' },
  dateHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, gap: 6 },
  dateDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: theme.primary },
  dateLabel: { fontSize: 11, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  dateLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0', marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, gap: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  typeIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, marginRight: 4, overflow: 'hidden' },
  title: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, overflow: 'hidden' },
  sub: { fontSize: 12, color: theme.textSecondary, flexShrink: 1 },
  validation: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, flexShrink: 0 },
  score: { fontSize: 16, fontWeight: '900', minWidth: 44, maxWidth: 60, textAlign: 'right' },
});
