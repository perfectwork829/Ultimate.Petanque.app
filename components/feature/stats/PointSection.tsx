/**
 * Point section for the Stats tab.
 * Extracted from app/(tabs)/stats.tsx.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { ProgressRing, StatRow, SectionHeader, BreakdownBar } from './StatsPrimitives';
import { statsSharedStyles as ss } from './statsSharedStyles';

interface PointSectionProps {
  t: (section: string, key: string) => string;
  isTablet: boolean;
  pointStats: any;
  terrainTypeStats: any;
  filteredChallenges: any[];
  itemFilterType: string;
}

export function PointSection({ t, isTablet, pointStats, terrainTypeStats, filteredChallenges, itemFilterType }: PointSectionProps) {
  // Challenge-specific empty state
  if (itemFilterType === 'challenge' && filteredChallenges.length > 0 && pointStats.totalPoints === 0) {
    return (
      <Animated.View entering={FadeInDown.duration(400)} style={ss.section}>
        <View style={ss.card}>
          <View style={{ alignItems: 'center', paddingVertical: 24 }}>
            <MaterialIcons name="info-outline" size={40} color={theme.textMuted} />
            <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary, marginTop: 12 }}>{t('stats', 'challengeNoPointData')}</Text>
            <Text style={{ fontSize: 12, color: theme.textSecondary, textAlign: 'center', marginTop: 6, maxWidth: 260 }}>{t('stats', 'challengeNoPointDataDesc')}</Text>
          </View>
        </View>
      </Animated.View>
    );
  }

  return (
    <>
      {/* Hero */}
      <Animated.View entering={FadeInDown.duration(400)} style={[ss.heroCard, isTablet && ss.heroCardTablet]}>
        <View style={ss.heroContent}>
          <ProgressRing value={pointStats.successRate} size={isTablet ? 130 : 110} strokeWidth={isTablet ? 10 : 9} color={theme.pointColor} label={t('stats', 'successLabel')} />
          <View style={ss.heroStats}>
            <View style={ss.heroStatItem}><Text style={[ss.heroStatValue, { color: theme.success }]}>{pointStats.pointsSuccess}</Text><Text style={ss.heroStatLabel}>{t('stats', 'succeededLabel')}</Text></View>
            <View style={ss.heroStatItem}><Text style={[ss.heroStatValue, { color: theme.error }]}>{pointStats.totalPoints - pointStats.pointsSuccess}</Text><Text style={ss.heroStatLabel}>{t('stats', 'missedLabel')}</Text></View>
            <View style={ss.heroStatItem}><Text style={ss.heroStatValue}>{pointStats.totalPoints}</Text><Text style={ss.heroStatLabel}>{t('stats', 'totalLabel')}</Text></View>
          </View>
        </View>
      </Animated.View>

      {/* Success */}
      <Animated.View entering={FadeInDown.duration(400).delay(50)} style={ss.section}>
        <SectionHeader title={t('stats', 'successLabel')} icon="adjust" color={theme.pointColor} />
        <View style={ss.card}>
          <StatRow label={t('stats', 'pointsAttemptedLabel')} value={pointStats.totalPoints} icon="radio-button-unchecked" color={theme.textSecondary} />
          <StatRow label={t('stats', 'successPercent')} value={`${pointStats.successRate}%`} icon="percent" color={theme.pointColor} />
          <StatRow label={t('stats', 'pointsPerEndLabel')} value={pointStats.pointsPerMene} icon="timeline" color={theme.accent} />
        </View>
      </Animated.View>

      {/* Point Types */}
      {pointStats.hasDetailedData && (
        <Animated.View entering={FadeInDown.duration(400).delay(100)} style={ss.section}>
          <SectionHeader title={t('stats', 'pointTypesSection')} subtitle={`${pointStats.totalDetailedPoints} ${t('stats', 'pointAnalyzedLabel')}`} icon="category" color={theme.primary} />
          <View style={ss.card}>
            <StatRow label={t('stats', 'rolledPointLabel')} value={`${pointStats.pointRoule.success}/${pointStats.pointRoule.total}`} subValue={pointStats.pointRoule.total > 0 ? `${Math.round((pointStats.pointRoule.success / pointStats.pointRoule.total) * 100)}%` : ''} icon="sports-baseball" color={theme.pointColor} />
            <StatRow label={t('stats', 'droppedPointLabel')} value={`${pointStats.pointPlombe.success}/${pointStats.pointPlombe.total}`} subValue={pointStats.pointPlombe.total > 0 ? `${Math.round((pointStats.pointPlombe.success / pointStats.pointPlombe.total) * 100)}%` : ''} icon="flight-land" color={theme.tirColor} />
            {pointStats.pointDemiPortee.total > 0 && (
              <StatRow label={t('stats', 'halfCarryLabel')} value={`${pointStats.pointDemiPortee.success}/${pointStats.pointDemiPortee.total}`} subValue={`${Math.round((pointStats.pointDemiPortee.success / pointStats.pointDemiPortee.total) * 100)}%`} icon="height" color={theme.primary} />
            )}
            <StatRow label={t('stats', 'carriedPointLabel')} value={`${pointStats.pointPortee.success}/${pointStats.pointPortee.total}`} subValue={pointStats.pointPortee.total > 0 ? `${Math.round((pointStats.pointPortee.success / pointStats.pointPortee.total) * 100)}%` : ''} icon="flight" color={theme.accent} />
          </View>
        </Animated.View>
      )}

      {/* Success Quality */}
      {pointStats.successQualitiesTotal > 0 && (
        <Animated.View entering={FadeInDown.duration(400).delay(150)} style={ss.section}>
          <SectionHeader title={t('stats', 'successQualitySection')} subtitle={`${pointStats.successQualitiesTotal} ${t('stats', 'qualifiedLabel')}`} icon="straighten" color={theme.success} />
          <View style={ss.card}>
            <StatRow label={t('stats', 'excellentLabel')} value={pointStats.pointExcellent} subValue={`${Math.round((pointStats.pointExcellent / pointStats.successQualitiesTotal) * 100)}%`} icon="stars" color={theme.carreauColor} />
            <StatRow label={t('stats', 'goodLabel')} value={pointStats.pointBon} subValue={`${Math.round((pointStats.pointBon / pointStats.successQualitiesTotal) * 100)}%`} icon="check-circle" color={theme.success} />
            <StatRow label={t('stats', 'averageLabel')} value={pointStats.pointMoyen} subValue={`${Math.round((pointStats.pointMoyen / pointStats.successQualitiesTotal) * 100)}%`} icon="radio-button-checked" color={theme.warning} />
            <StatRow label={t('stats', 'atJackLabel')} value={pointStats.pointAuBouchon} subValue={`${Math.round((pointStats.pointAuBouchon / pointStats.successQualitiesTotal) * 100)}%`} icon="adjust" color={theme.primary} />
            <StatRow label={t('stats', 'inFrontBallLabel')} value={pointStats.pointDevantBoule} subValue={`${Math.round((pointStats.pointDevantBoule / pointStats.successQualitiesTotal) * 100)}%`} icon="sports-baseball" color={theme.accent} />
          </View>
        </Animated.View>
      )}

      {/* Cross Type x Quality */}
      {pointStats.hasCrossData && (
        <Animated.View entering={FadeInDown.duration(400).delay(175)} style={ss.section}>
          <SectionHeader title={t('stats', 'pointTypeQualitySection')} subtitle={`${pointStats.totalCrossTracked} ${t('stats', 'pointsCrossedLabel')}`} icon="grid-on" color={theme.accent} />
          <View style={ss.card}>
            <View style={ss.crossTableHeader}>
              <View style={ss.crossTableHeaderLabel}><Text style={ss.crossTableHeaderText}>{t('stats', 'typeLabel')}</Text></View>
              <View style={ss.crossTableHeaderCell}><MaterialIcons name="stars" size={12} color={theme.carreauColor} /><Text style={[ss.crossTableHeaderCellText, { color: theme.carreauColor }]}>{t('stats', 'excShort')}</Text></View>
              <View style={ss.crossTableHeaderCell}><MaterialIcons name="check-circle" size={12} color={theme.success} /><Text style={[ss.crossTableHeaderCellText, { color: theme.success }]}>{t('stats', 'goodShort')}</Text></View>
              <View style={ss.crossTableHeaderCell}><MaterialIcons name="radio-button-checked" size={12} color={theme.warning} /><Text style={[ss.crossTableHeaderCellText, { color: theme.warning }]}>{t('stats', 'avgShort')}</Text></View>
              <View style={ss.crossTableHeaderCell}><MaterialIcons name="cancel" size={12} color={theme.error} /><Text style={[ss.crossTableHeaderCellText, { color: theme.error }]}>{t('stats', 'missedShort')}</Text></View>
            </View>
            {[
              { key: 'roule', label: t('stats', 'rolledPointLabel'), icon: 'sports-baseball', color: theme.pointColor },
              { key: 'plombe', label: t('stats', 'droppedPointLabel'), icon: 'flight-land', color: theme.tirColor },
              { key: 'demi_portee', label: t('stats', 'halfCarryLabel'), icon: 'height', color: theme.primary },
              { key: 'portee', label: t('stats', 'carriedPointLabel'), icon: 'flight', color: theme.accent },
            ].filter(row => pointStats.crossTypeQuality[row.key]?.total > 0).map((row, idx) => {
              const data = pointStats.crossTypeQuality[row.key];
              return (
                <View key={row.key} style={[ss.crossTableRow, idx % 2 === 0 && ss.crossTableRowAlt]}>
                  <View style={ss.crossTableRowLabel}><MaterialIcons name={row.icon as any} size={14} color={row.color} /><Text style={ss.crossTableRowLabelText} numberOfLines={1}>{row.label}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.carreauColor }]}>{data.excellent}</Text><Text style={ss.crossTableCellPct}>{data.total > 0 ? `${Math.round((data.excellent / data.total) * 100)}%` : '-'}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.success }]}>{data.bon}</Text><Text style={ss.crossTableCellPct}>{data.total > 0 ? `${Math.round((data.bon / data.total) * 100)}%` : '-'}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.warning }]}>{data.moyen}</Text><Text style={ss.crossTableCellPct}>{data.total > 0 ? `${Math.round((data.moyen / data.total) * 100)}%` : '-'}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.error }]}>{data.rate + data.crochete + data.sorti}</Text><Text style={ss.crossTableCellPct}>{data.total > 0 ? `${Math.round(((data.rate + data.crochete + data.sorti) / data.total) * 100)}%` : '-'}</Text></View>
                </View>
              );
            })}
            {/* Insight */}
            {(() => {
              const entries = Object.entries(pointStats.crossTypeQuality).filter(([, v]: any) => v.total >= 3);
              if (entries.length < 2) return null;
              const labels: Record<string, string> = { roule: t('stats', 'rolledPointLabel'), plombe: t('stats', 'droppedPointLabel'), demi_portee: t('stats', 'halfCarryLabel'), portee: t('stats', 'carriedPointLabel') };
              const successRates = entries.map(([key, v]: any) => ({ key, rate: v.total > 0 ? (v.successTotal / v.total) * 100 : 0 }));
              successRates.sort((a, b) => b.rate - a.rate);
              const best = successRates[0]; const worst = successRates[successRates.length - 1];
              if (best.rate - worst.rate < 10) return null;
              return (
                <View style={ss.insightBox}>
                  <MaterialIcons name="lightbulb" size={16} color={theme.accent} />
                  <Text style={ss.insightText}>
                    {t('stats', 'yourLabel')} <Text style={{ fontWeight: '700', color: theme.success }}>{labels[best.key]}</Text> {t('stats', 'insightBestQuality')} ({Math.round(best.rate)}% {t('stats', 'insightSucceeded')}).{' '}
                    <Text style={{ fontWeight: '700', color: theme.error }}>{labels[worst.key]}</Text> {t('stats', 'insightLeastReliable')} ({Math.round(worst.rate)}%).
                  </Text>
                </View>
              );
            })()}
          </View>
        </Animated.View>
      )}

      {/* Terrain Stats */}
      {terrainTypeStats.hasData && (
        <Animated.View entering={FadeInDown.duration(400).delay(200)} style={ss.section}>
          <SectionHeader title={t('stats', 'statsByTerrainSection')} subtitle={`${terrainTypeStats.totalTerrainMatches} ${t('stats', 'terrainMatchesSubtitle')}`} icon="terrain" color={theme.pointColor} />
          <View style={ss.card}>
            <View style={ss.crossTableHeader}>
              <View style={ss.crossTableHeaderLabel}><Text style={ss.crossTableHeaderText}>{t('stats', 'terrainColumn')}</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={[ss.crossTableHeaderCellText, { color: theme.pointColor }]}>{t('stats', 'pointSuccessColumn')}</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={ss.crossTableHeaderCellText}>{t('stats', 'matchesColumn')}</Text></View>
            </View>
            {terrainTypeStats.types.map((type: string, idx: number) => {
              const data = terrainTypeStats.byTerrain[type];
              const ptRate = data.points > 0 ? Math.round((data.pointsSuccess / data.points) * 100) : 0;
              return (
                <View key={type} style={[ss.crossTableRow, idx % 2 === 0 && ss.crossTableRowAlt]}>
                  <View style={ss.crossTableRowLabel}><Text style={ss.crossTableRowLabelText} numberOfLines={1}>{t('terrainTypes', type)}</Text><Text style={ss.crossTableCellPct}>{data.points} {t('stats', 'pointsUnit')}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.pointColor }]}>{ptRate}%</Text></View>
                  <View style={ss.crossTableCell}><Text style={ss.crossTableCellValue}>{data.matches}</Text></View>
                </View>
              );
            })}
          </View>
        </Animated.View>
      )}
    </>
  );
}
