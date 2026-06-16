/**
 * EloSection — Extracted heavy ELO display section from player/[id].tsx
 * Contains: ELO hero, role-specific ELO, sparkline chart, milestones, recent changes, rank history chart
 * Wrapped in React.memo to avoid re-renders when unrelated player data changes.
 */
import React, { memo, useMemo } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Svg, { Polygon, Line, Circle as SvgCircle, Text as SvgText, G } from 'react-native-svg';
import theme from '@/constants/theme';
import {
  EloHistoryEntry, ELO_INITIAL,
  getEloRank, getEloColor, formatEloDelta,
} from '@/services/eloService';

interface EloSectionProps {
  player: {
    id: string;
    eloRating?: number;
    userId?: string;
    lastMatchDate?: string;
  };
  eloHistory: EloHistoryEntry[];
  eloLoading: boolean;
  roleElos: { tireur: number; pointeur: number; milieu: number } | null;
  inactivityDecay: { decayAmount: number; daysSince: number } | null;
  rankHistory: Array<{ weekStart: string; rank: number; eloRating: number; matchesPlayed: number; winRate: number }>;
  rankHistoryLoading: boolean;
  language: string;
  t: (section: string, key: string) => string;
  screenWidth: number;
}

function EloSectionInner({
  player, eloHistory, eloLoading, roleElos, inactivityDecay,
  rankHistory, rankHistoryLoading, language, t, screenWidth,
}: EloSectionProps) {
  const currentEloRank = useMemo(() => getEloRank(player.eloRating || ELO_INITIAL), [player.eloRating]);

  const eloChartData = useMemo(() => {
    if (eloHistory.length === 0) return null;
    const sorted = [...eloHistory].reverse();
    const points = sorted.map(h => h.eloAfter);
    const min = Math.min(...points, ELO_INITIAL) - 30;
    const max = Math.max(...points, ELO_INITIAL) + 30;
    const currentElo = sorted[sorted.length - 1]?.eloAfter || player.eloRating || ELO_INITIAL;
    const weekAgoElo = sorted.length > 7 ? sorted[sorted.length - 8]?.eloAfter : sorted[0]?.eloAfter || ELO_INITIAL;
    const weekDelta = currentElo - weekAgoElo;
    return { points, min, max, currentElo, weekDelta, entries: sorted };
  }, [eloHistory, player.eloRating]);

  if (!player.eloRating && eloHistory.length === 0) return null;

  return (
    <View style={s.sectionCard}>
      <View style={s.sectionHeader}>
        <View style={[s.sectionIconBox, { backgroundColor: currentEloRank.color + '15' }]}>
          <MaterialIcons name={currentEloRank.icon as any} size={18} color={currentEloRank.color} />
        </View>
        <Text style={s.sectionTitle}>{t('leaderboard', 'eloRating')}</Text>
      </View>

      {/* ELO Hero */}
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <Text style={{ fontSize: 40, fontWeight: '900', color: currentEloRank.color }}>{player.eloRating || ELO_INITIAL}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <View style={{ backgroundColor: currentEloRank.color + '15', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: currentEloRank.color + '30' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: currentEloRank.color }}>
              {currentEloRank.label[language === 'fr' ? 'fr' : 'en']}
            </Text>
          </View>
          {eloChartData && eloChartData.weekDelta !== 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: eloChartData.weekDelta > 0 ? '#10B98115' : '#EF444415', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 }}>
              <MaterialIcons name={eloChartData.weekDelta > 0 ? 'arrow-upward' : 'arrow-downward'} size={12} color={eloChartData.weekDelta > 0 ? '#10B981' : '#EF4444'} />
              <Text style={{ fontSize: 12, fontWeight: '800', color: eloChartData.weekDelta > 0 ? '#10B981' : '#EF4444' }}>{formatEloDelta(eloChartData.weekDelta)}</Text>
            </View>
          ) : null}
        </View>

        {/* Inactivity decay warning */}
        {inactivityDecay ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#F59E0B12', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#F59E0B25' }}>
            <MaterialIcons name="warning" size={14} color="#F59E0B" />
            <Text style={{ fontSize: 11, fontWeight: '600', color: '#F59E0B' }}>
              {t('leaderboard', 'eloInactivityWarning').replace('{days}', String(inactivityDecay.daysSince)).replace('{decay}', String(inactivityDecay.decayAmount))}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Role-specific ELO */}
      {roleElos && (roleElos.tireur !== 1000 || roleElos.pointeur !== 1000 || roleElos.milieu !== 1000) ? (
        <View style={{ marginBottom: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{t('leaderboard', 'eloRoleSpecific')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[
              { label: t('leaderboard', 'eloRoleTireur'), value: roleElos.tireur, color: '#F97316', icon: 'gps-fixed' as const },
              { label: t('leaderboard', 'eloRolePointeur'), value: roleElos.pointeur, color: '#3B82F6', icon: 'adjust' as const },
              { label: t('leaderboard', 'eloRoleMilieu'), value: roleElos.milieu, color: '#8B5CF6', icon: 'swap-horiz' as const },
            ].map((role, idx) => {
              const rRank = getEloRank(role.value);
              return (
                <View key={idx} style={{ flex: 1, alignItems: 'center', backgroundColor: role.color + '08', borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: role.color + '20' }}>
                  <MaterialIcons name={role.icon} size={16} color={role.color} />
                  <Text style={{ fontSize: 18, fontWeight: '800', color: role.color, marginTop: 4 }}>{role.value}</Text>
                  <Text style={{ fontSize: 9, color: theme.textMuted, marginTop: 2 }}>{role.label}</Text>
                  <View style={{ backgroundColor: rRank.color + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginTop: 4 }}>
                    <Text style={{ fontSize: 8, fontWeight: '700', color: rRank.color }}>{rRank.label[language === 'fr' ? 'fr' : 'en']}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* ELO Sparkline Chart */}
      {eloChartData && eloChartData.points.length >= 2 ? (() => {
        const chartW = Math.max(1, screenWidth - 96);
        const chartH = 100;
        const pts = eloChartData.points;
        const range = Math.max(eloChartData.max - eloChartData.min, 1);
        const stepX = chartW / Math.max(pts.length - 1, 1);
        const getY = (val: number) => chartH - ((val - eloChartData.min) / range) * (chartH - 10) - 5;
        const lastPt = { x: (pts.length - 1) * stepX, y: getY(pts[pts.length - 1]) };
        const trend = pts[pts.length - 1] >= pts[0];
        const lineColor = trend ? '#10B981' : '#EF4444';
        return (
          <View style={{ marginBottom: 12, paddingHorizontal: 8 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textMuted, marginBottom: 8 }}>{t('leaderboard', 'eloLast30')}</Text>
            <Svg width={chartW} height={chartH + 10}>
              {ELO_INITIAL >= eloChartData.min && ELO_INITIAL <= eloChartData.max ? (
                <Line x1={0} y1={getY(ELO_INITIAL)} x2={chartW} y2={getY(ELO_INITIAL)} stroke={theme.border} strokeWidth={1} strokeDasharray="4,4" />
              ) : null}
              <Polygon
                points={`0,${chartH + 5} ${pts.map((v, i) => `${i * stepX},${getY(v)}`).join(' ')} ${(pts.length - 1) * stepX},${chartH + 5}`}
                fill={lineColor + '10'}
              />
              <Polygon points="" />
              <Line x1={0} y1={0} x2={0} y2={0} stroke="transparent" />
              {pts.length > 1 ? (
                <G>
                  {pts.slice(1).map((v, i) => (
                    <Line key={i} x1={i * stepX} y1={getY(pts[i])} x2={(i + 1) * stepX} y2={getY(v)} stroke={lineColor} strokeWidth={2.5} />
                  ))}
                </G>
              ) : null}
              <SvgCircle cx={lastPt.x} cy={lastPt.y} r={5} fill={lineColor} stroke="#FFF" strokeWidth={2} />
              <SvgText x={Math.min(lastPt.x, chartW - 25)} y={lastPt.y - 10} fontSize="11" fill={lineColor} fontWeight="700" textAnchor="middle">
                {pts[pts.length - 1]}
              </SvgText>
            </Svg>
          </View>
        );
      })() : eloLoading ? (
        <View style={{ alignItems: 'center', paddingVertical: 20 }}>
          <ActivityIndicator size="small" color={currentEloRank.color} />
        </View>
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <Text style={{ fontSize: 12, color: theme.textMuted }}>{t('leaderboard', 'eloNoHistory')}</Text>
          <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>{t('leaderboard', 'eloNoHistoryDesc')}</Text>
        </View>
      )}

      {/* ELO Milestones Timeline */}
      {eloHistory.length > 2 ? (() => {
        const sorted = [...eloHistory].reverse();
        const milestones: { date: string; oldRank: string; newRank: string; elo: number; matchId?: string; direction: 'up' | 'down' }[] = [];
        for (let i = 1; i < sorted.length; i++) {
          const prev = getEloRank(sorted[i - 1].eloAfter);
          const curr = getEloRank(sorted[i].eloAfter);
          if (prev.tier !== curr.tier) {
            milestones.push({
              date: sorted[i].recordedAt,
              oldRank: prev.tier,
              newRank: curr.tier,
              elo: sorted[i].eloAfter,
              matchId: sorted[i].matchId,
              direction: sorted[i].eloAfter > sorted[i - 1].eloAfter ? 'up' : 'down',
            });
          }
        }
        if (milestones.length === 0) return null;
        return (
          <View style={{ marginBottom: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
              {language === 'fr' ? 'JALONS ELO' : 'ELO MILESTONES'}
            </Text>
            {milestones.slice(-5).reverse().map((ms, idx) => {
              const rank = getEloRank(ms.elo);
              const isPromo = ms.direction === 'up';
              return (
                <Pressable key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: idx < Math.min(milestones.length, 5) - 1 ? 1 : 0, borderBottomColor: theme.border + '40' }} onPress={ms.matchId ? () => router.push(`/match/${ms.matchId}`) : undefined}>
                  <View style={{ width: 4, height: 32, borderRadius: 2, backgroundColor: isPromo ? '#10B981' : '#EF4444' }} />
                  <View style={[{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, { backgroundColor: rank.color + '15' }]}>
                    <MaterialIcons name={isPromo ? 'arrow-upward' : 'arrow-downward'} size={16} color={isPromo ? '#10B981' : '#EF4444'} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ backgroundColor: rank.color + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, borderWidth: 1, borderColor: rank.color + '30' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: rank.color }}>
                          {rank.label[language === 'fr' ? 'fr' : 'en']}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: rank.color }}>{ms.elo}</Text>
                    </View>
                    <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                      {new Date(ms.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <MaterialIcons name={isPromo ? 'celebration' : 'trending-down'} size={16} color={isPromo ? '#10B981' : '#EF4444'} />
                </Pressable>
              );
            })}
          </View>
        );
      })() : null}

      {/* Recent ELO changes */}
      {eloHistory.length > 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 12 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{t('leaderboard', 'eloHistory')}</Text>
          {eloHistory.slice(0, 5).map((entry, idx) => (
            <Pressable key={entry.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: idx < 4 && idx < eloHistory.length - 1 ? 1 : 0, borderBottomColor: theme.border + '40' }} onPress={entry.matchId ? () => router.push(`/match/${entry.matchId}`) : undefined}>
              <View style={{ width: 4, height: 28, borderRadius: 2, backgroundColor: entry.won ? '#10B981' : '#EF4444' }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }} numberOfLines={1}>
                  vs {entry.opponentName || '?'}
                </Text>
                <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>
                  {new Date(entry.recordedAt).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
                  {entry.opponentElo ? ` • ELO ${entry.opponentElo}` : ''}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.textPrimary }}>{entry.eloAfter}</Text>
                <View style={{ backgroundColor: entry.eloDelta >= 0 ? '#10B98115' : '#EF444415', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: entry.eloDelta >= 0 ? '#10B981' : '#EF4444' }}>
                    {formatEloDelta(entry.eloDelta)}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* Leaderboard Rank History Chart */}
      {rankHistory.length >= 2 ? (() => {
        const chartW = Math.max(1, screenWidth - 96);
        const chartH = 100;
        const ranks = rankHistory.map(h => h.rank);
        const maxRank = Math.max(...ranks, 1);
        const minRank = Math.min(...ranks, 1);
        const range = Math.max(maxRank - minRank, 1);
        const stepX = chartW / Math.max(ranks.length - 1, 1);
        const getYR = (rank: number) => 10 + ((rank - minRank) / range) * (chartH - 20);
        const lastPtR = { x: (ranks.length - 1) * stepX, y: getYR(ranks[ranks.length - 1]) };
        const trendR = ranks[ranks.length - 1] <= ranks[0];
        const lineColorR = trendR ? '#10B981' : '#EF4444';
        return (
          <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <MaterialIcons name="leaderboard" size={14} color="#D97706" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t('leaderboard', 'eloLeaderboardHistory')}
              </Text>
              <Text style={{ fontSize: 10, color: theme.textMuted }}>({rankHistory.length} {t('leaderboard', 'eloLeaderboardHistoryDesc')})</Text>
            </View>
            <Svg width={chartW} height={chartH + 20}>
              {[minRank, Math.round((minRank + maxRank) / 2), maxRank].filter((v, i, a) => a.indexOf(v) === i).map((rank, i) => (
                <G key={`ref-${i}`}>
                  <Line x1={0} y1={getYR(rank)} x2={chartW} y2={getYR(rank)} stroke={theme.border} strokeWidth={0.8} strokeDasharray="4,4" />
                  <SvgText x={chartW - 2} y={getYR(rank) - 4} fontSize="9" fill={theme.textMuted} textAnchor="end" fontWeight="600">#{rank}</SvgText>
                </G>
              ))}
              <Polygon
                points={`0,${chartH + 5} ${ranks.map((r, i) => `${i * stepX},${getYR(r)}`).join(' ')} ${(ranks.length - 1) * stepX},${chartH + 5}`}
                fill={lineColorR + '10'}
              />
              {ranks.length > 1 ? (
                <G>
                  {ranks.slice(1).map((r, i) => (
                    <Line key={i} x1={i * stepX} y1={getYR(ranks[i])} x2={(i + 1) * stepX} y2={getYR(r)} stroke={lineColorR} strokeWidth={2.5} />
                  ))}
                </G>
              ) : null}
              {ranks.map((r, i) => (
                <SvgCircle key={i} cx={i * stepX} cy={getYR(r)} r={i === ranks.length - 1 ? 5 : 3} fill={i === ranks.length - 1 ? lineColorR : lineColorR + '80'} stroke="#FFF" strokeWidth={i === ranks.length - 1 ? 2 : 1} />
              ))}
              <SvgText x={Math.min(lastPtR.x, chartW - 20)} y={lastPtR.y - 10} fontSize="12" fill={lineColorR} fontWeight="800" textAnchor="middle">
                #{ranks[ranks.length - 1]}
              </SvgText>
              {rankHistory.map((h, i) => {
                if (rankHistory.length > 6 && i % 2 !== 0 && i !== rankHistory.length - 1) return null;
                const d = new Date(h.weekStart);
                const label = `${d.getDate()}/${d.getMonth() + 1}`;
                return (
                  <SvgText key={`wl-${i}`} x={i * stepX} y={chartH + 14} fontSize="8" fill={theme.textMuted} textAnchor="middle" fontWeight="500">
                    {label}
                  </SvgText>
                );
              })}
            </Svg>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 10, color: theme.textMuted }}>
                {language === 'fr' ? 'Meilleur' : 'Best'}: #{minRank}
              </Text>
              <Pressable onPress={() => router.push('/leaderboard' as any)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={{ fontSize: 10, fontWeight: '600', color: '#D97706' }}>{t('leaderboard', 'seeFullLeaderboard')}</Text>
                <MaterialIcons name="chevron-right" size={12} color="#D97706" />
              </Pressable>
            </View>
          </View>
        );
      })() : rankHistory.length === 0 && !rankHistoryLoading && player.userId ? (
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border, alignItems: 'center', paddingVertical: 16 }}>
          <MaterialIcons name="leaderboard" size={24} color={theme.textMuted} />
          <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>{t('leaderboard', 'eloNoLeaderboardHistory')}</Text>
          <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 3, textAlign: 'center', paddingHorizontal: 16 }}>{t('leaderboard', 'eloNoLeaderboardHistoryDesc')}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  sectionCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 14, ...theme.shadows.card },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
});

export default memo(EloSectionInner);
