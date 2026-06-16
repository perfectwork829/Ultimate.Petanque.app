/**
 * Tir (Shot) section for the Stats tab.
 * Extracted from app/(tabs)/stats.tsx.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { ProgressRing, StatRow, SectionHeader, ProgressBar, BreakdownBar } from './StatsPrimitives';
import { statsSharedStyles as ss } from './statsSharedStyles';

interface TirSectionProps {
  t: (section: string, key: string) => string;
  isTablet: boolean;
  tirStats: any;
  terrainTypeStats: any;
  precisionWorkshopStats: any;
}

export function TirSection({ t, isTablet, tirStats, terrainTypeStats, precisionWorkshopStats }: TirSectionProps) {
  return (
    <>
      {/* Hero */}
      <Animated.View entering={FadeInDown.duration(400)} style={[ss.heroCard, isTablet && ss.heroCardTablet]}>
        <View style={ss.heroContent}>
          <ProgressRing value={tirStats.successRate} size={isTablet ? 130 : 110} strokeWidth={isTablet ? 10 : 9} color={theme.tirColor} label={t('stats', 'successLabel')} />
          <View style={ss.heroStats}>
            <View style={ss.heroStatItem}><Text style={[ss.heroStatValue, { color: theme.success }]}>{tirStats.tirsSuccess}</Text><Text style={ss.heroStatLabel}>{t('stats', 'succeededLabel')}</Text></View>
            <View style={ss.heroStatItem}><Text style={[ss.heroStatValue, { color: theme.error }]}>{tirStats.totalTirs - tirStats.tirsSuccess}</Text><Text style={ss.heroStatLabel}>{t('stats', 'missedLabel')}</Text></View>
            <View style={ss.heroStatItem}><Text style={ss.heroStatValue}>{tirStats.totalTirs}</Text><Text style={ss.heroStatLabel}>{t('stats', 'totalLabel')}</Text></View>
          </View>
        </View>
      </Animated.View>

      {/* Volume & Success */}
      <Animated.View entering={FadeInDown.duration(400).delay(50)} style={ss.section}>
        <SectionHeader title={t('stats', 'volumeSuccessSection')} icon="gps-fixed" color={theme.tirColor} />
        <View style={ss.card}>
          <StatRow label={t('stats', 'shotsAttempted')} value={tirStats.totalTirs} icon="radio-button-unchecked" color={theme.textSecondary} />
          <StatRow label={t('stats', 'successPercent')} value={`${tirStats.successRate}%`} icon="percent" color={theme.tirColor} />
          <StatRow label={t('stats', 'carreauPercent')} value={`${tirStats.carreauRate}%`} icon="stars" color={theme.carreauColor} />
          <StatRow label={t('stats', 'shotsPerGameLabel')} value={tirStats.tirsPerMatch} icon="sports" color={theme.primary} />
        </View>
      </Animated.View>

      {/* Result Breakdown */}
      <Animated.View entering={FadeInDown.duration(400).delay(100)} style={ss.section}>
        <SectionHeader title={t('stats', 'resultBreakdownSection')} icon="pie-chart" color={theme.primary} />
        <View style={ss.card}>
          <BreakdownBar items={[
            { label: t('stats', 'carreauxLabel'), value: tirStats.carreaux, color: theme.carreauColor },
            { label: t('stats', 'halfShotsLabel'), value: tirStats.tirsSuccess - tirStats.carreaux, color: theme.pointColor },
            { label: t('stats', 'missedLabel'), value: tirStats.totalTirs - tirStats.tirsSuccess, color: theme.error },
          ]} />
        </View>
      </Animated.View>

      {/* Shot Types */}
      {tirStats.hasDetailedData && (
        <Animated.View entering={FadeInDown.duration(400).delay(150)} style={[ss.section, isTablet && ss.sectionTabletWide]}>
          <SectionHeader title={t('stats', 'shotTypesSection')} subtitle={`${tirStats.totalDetailedTirs} ${t('stats', 'analyzedLabel')}`} icon="category" color={theme.tirColor} />
          <View style={ss.card}>
            <StatRow label={t('stats', 'tirTenduLabel')} value={`${tirStats.tirAuFer.success}/${tirStats.tirAuFer.total}`} subValue={tirStats.tirAuFer.total > 0 ? `${Math.round((tirStats.tirAuFer.success / tirStats.tirAuFer.total) * 100)}%` : ''} icon="gps-fixed" color={theme.tirColor} />
            <StatRow label={t('stats', 'tirClocheLabel')} value={`${tirStats.tirAuPlomb.success}/${tirStats.tirAuPlomb.total}`} subValue={tirStats.tirAuPlomb.total > 0 ? `${Math.round((tirStats.tirAuPlomb.success / tirStats.tirAuPlomb.total) * 100)}%` : ''} icon="flight-takeoff" color={theme.pointColor} />
            <StatRow label={t('stats', 'enRafleLabel')} value={`${tirStats.tirEnRafle.success}/${tirStats.tirEnRafle.total}`} subValue={tirStats.tirEnRafle.total > 0 ? `${Math.round((tirStats.tirEnRafle.success / tirStats.tirEnRafle.total) * 100)}%` : ''} icon="swap-horiz" color={theme.accent} />
            {tirStats.tirCourtRamasse.total > 0 && (
              <StatRow label={t('stats', 'courtRamasseLabel')} value={`${tirStats.tirCourtRamasse.success}/${tirStats.tirCourtRamasse.total}`} subValue={tirStats.tirCourtRamasse.total > 0 ? `${Math.round((tirStats.tirCourtRamasse.success / tirStats.tirCourtRamasse.total) * 100)}%` : ''} icon="sports-handball" color={theme.carreauColor} />
            )}
          </View>
        </Animated.View>
      )}

      {/* Cross Type x Impact */}
      {tirStats.hasCrossData && (
        <Animated.View entering={FadeInDown.duration(400).delay(175)} style={ss.section}>
          <SectionHeader title={t('stats', 'shotTypeImpactSection')} subtitle={`${tirStats.totalCrossTracked} ${t('stats', 'crossedLabel')}`} icon="grid-on" color={theme.accent} />
          <View style={ss.card}>
            <View style={ss.crossTableHeader}>
              <View style={ss.crossTableHeaderLabel}><Text style={ss.crossTableHeaderText}>{t('stats', 'typeLabel')}</Text></View>
              <View style={ss.crossTableHeaderCell}><MaterialIcons name="add-circle" size={12} color={theme.success} /><Text style={[ss.crossTableHeaderCellText, { color: theme.success }]}>{t('stats', 'gainLabel')}</Text></View>
              <View style={ss.crossTableHeaderCell}><MaterialIcons name="whatshot" size={12} color={theme.carreauColor} /><Text style={[ss.crossTableHeaderCellText, { color: theme.carreauColor }]}>{t('stats', 'decisiveLabel')}</Text></View>
              <View style={ss.crossTableHeaderCell}><MaterialIcons name="remove-circle-outline" size={12} color={theme.textMuted} /><Text style={[ss.crossTableHeaderCellText, { color: theme.textMuted }]}>{t('stats', 'neutralLabel')}</Text></View>
              <View style={ss.crossTableHeaderCell}><MaterialIcons name="trending-down" size={12} color={theme.error} /><Text style={[ss.crossTableHeaderCellText, { color: theme.error }]}>{t('stats', 'negativeLabel')}</Text></View>
            </View>
            {[
              { key: 'au_fer', label: t('stats', 'tirTenduLabel'), icon: 'gps-fixed', color: theme.tirColor },
              { key: 'au_plomb', label: t('stats', 'tirClocheLabel'), icon: 'flight-takeoff', color: theme.pointColor },
              { key: 'en_rafle', label: t('stats', 'enRafleLabel'), icon: 'swap-horiz', color: theme.accent },
              { key: 'court_ramasse', label: t('stats', 'courtRamasseLabel'), icon: 'sports-handball', color: theme.carreauColor },
            ].filter(row => tirStats.crossTypeImpact[row.key]?.total > 0).map((row, idx) => {
              const data = tirStats.crossTypeImpact[row.key];
              return (
                <View key={row.key} style={[ss.crossTableRow, idx % 2 === 0 && ss.crossTableRowAlt]}>
                  <View style={ss.crossTableRowLabel}><MaterialIcons name={row.icon as any} size={14} color={row.color} /><Text style={ss.crossTableRowLabelText} numberOfLines={1}>{row.label}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.success }]}>{data.gain_point}</Text><Text style={ss.crossTableCellPct}>{data.total > 0 ? `${Math.round((data.gain_point / data.total) * 100)}%` : '-'}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.carreauColor }]}>{data.decisif}</Text><Text style={ss.crossTableCellPct}>{data.total > 0 ? `${Math.round((data.decisif / data.total) * 100)}%` : '-'}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.textMuted }]}>{data.sans_effet}</Text><Text style={ss.crossTableCellPct}>{data.total > 0 ? `${Math.round((data.sans_effet / data.total) * 100)}%` : '-'}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.error }]}>{data.negatif}</Text><Text style={ss.crossTableCellPct}>{data.total > 0 ? `${Math.round((data.negatif / data.total) * 100)}%` : '-'}</Text></View>
                </View>
              );
            })}
            {/* Insight */}
            {(() => {
              const entries = Object.entries(tirStats.crossTypeImpact).filter(([, v]: any) => v.total >= 3);
              if (entries.length < 2) return null;
              const labels: Record<string, string> = { au_fer: t('stats', 'tirTenduLabel'), au_plomb: t('stats', 'tirClocheLabel'), en_rafle: t('stats', 'enRafleLabel'), court_ramasse: t('stats', 'courtRamasseLabel') };
              const positiveRates = entries.map(([key, v]: any) => ({ key, rate: v.total > 0 ? ((v.gain_point + v.decisif) / v.total) * 100 : 0 }));
              positiveRates.sort((a, b) => b.rate - a.rate);
              const best = positiveRates[0]; const worst = positiveRates[positiveRates.length - 1];
              if (best.rate - worst.rate < 10) return null;
              return (
                <View style={ss.insightBox}>
                  <MaterialIcons name="lightbulb" size={16} color={theme.accent} />
                  <Text style={ss.insightText}>
                    {t('stats', 'yourLabel')} <Text style={{ fontWeight: '700', color: theme.success }}>{labels[best.key]}</Text> {t('stats', 'insightBestImpact')} ({Math.round(best.rate)}%).{' '}
                    <Text style={{ fontWeight: '700', color: theme.error }}>{labels[worst.key]}</Text> {t('stats', 'insightLeastEffective')} ({Math.round(worst.rate)}%).
                  </Text>
                </View>
              );
            })()}
          </View>
        </Animated.View>
      )}

      {/* Shot Impact */}
      {tirStats.totalQualityTracked > 0 && (
        <Animated.View entering={FadeInDown.duration(400).delay(200)} style={ss.section}>
          <SectionHeader title={t('stats', 'shotImpactSection')} subtitle={`${tirStats.totalQualityTracked} ${t('stats', 'qualifiedLabel')}`} icon="flash-on" color={theme.carreauColor} />
          <View style={ss.card}>
            <StatRow label={t('stats', 'gainPointLabel')} value={tirStats.tirGainPoint} subValue={tirStats.totalQualityTracked > 0 ? `${Math.round((tirStats.tirGainPoint / tirStats.totalQualityTracked) * 100)}%` : ''} icon="add-circle" color={theme.success} />
            <StatRow label={t('stats', 'decisiveLabel')} value={tirStats.tirsDecisifs} subValue={tirStats.totalQualityTracked > 0 ? `${Math.round((tirStats.tirsDecisifs / tirStats.totalQualityTracked) * 100)}%` : ''} icon="whatshot" color={theme.carreauColor} />
            <StatRow label={t('stats', 'noEffectLabel')} value={tirStats.tirSansEffet} subValue={tirStats.totalQualityTracked > 0 ? `${Math.round((tirStats.tirSansEffet / tirStats.totalQualityTracked) * 100)}%` : ''} icon="remove-circle-outline" color={theme.textMuted} />
            <StatRow label={t('stats', 'negativeLabel')} value={tirStats.tirNegatif} subValue={tirStats.totalQualityTracked > 0 ? `${Math.round((tirStats.tirNegatif / tirStats.totalQualityTracked) * 100)}%` : ''} icon="trending-down" color={theme.error} />
            <View style={{ height: 8 }} />
            <BreakdownBar items={[
              { label: t('stats', 'gainLabel'), value: tirStats.tirGainPoint, color: theme.success },
              { label: t('stats', 'decisiveLabel'), value: tirStats.tirsDecisifs, color: theme.carreauColor },
              { label: t('stats', 'noEffectLabel'), value: tirStats.tirSansEffet, color: theme.textMuted },
              { label: t('stats', 'negativeLabel'), value: tirStats.tirNegatif, color: theme.error },
            ].filter(i => i.value > 0)} />
          </View>
        </Animated.View>
      )}

      {/* Precision Workshop Stats */}
      {precisionWorkshopStats && precisionWorkshopStats.hasData && (
        <Animated.View entering={FadeInDown.duration(400).delay(225)} style={ss.section}>
          <SectionHeader title={t('stats', 'precisionWorkshopTitle')} subtitle={`${precisionWorkshopStats.totalSessions} ${t('stats', 'precisionSessionsLabel')}`} icon="stars" color={theme.carreauColor} />
          <View style={ss.card}>
            {precisionWorkshopStats.activeAteliers.map((atelier: string, idx: number) => {
              const data = precisionWorkshopStats.atelierData[atelier];
              const successRate = data.totalShots > 0 ? Math.round((data.successCount / data.totalShots) * 100) : 0;
              const avgPoints = data.totalShots > 0 ? (data.totalPoints / data.totalShots).toFixed(1) : '0';
              const atelierColors: Record<string, string> = { boule_seule: theme.tirColor, derriere_but: theme.primary, entre_2_boules: theme.accent, sautee: theme.pointColor, tir_but: theme.carreauColor };
              const color = atelierColors[atelier] || theme.primary;
              return (
                <View key={atelier} style={[ss.precisionWorkshopRow, idx < precisionWorkshopStats.activeAteliers.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                  <View style={ss.precisionWorkshopHeader}>
                    <View style={[ss.precisionWorkshopIcon, { backgroundColor: color + '15' }]}><MaterialIcons name="gps-fixed" size={16} color={color} /></View>
                    <View style={ss.precisionWorkshopInfo}>
                      <Text style={ss.precisionWorkshopName} numberOfLines={1}>{t('precisionWorkshops', atelier)}</Text>
                      <Text style={ss.precisionWorkshopMeta}>{data.totalShots} {t('stats', 'shotsUnit')} • {data.sessions} {t('stats', 'precisionSessionsLabel')}</Text>
                    </View>
                  </View>
                  <View style={ss.precisionWorkshopStats}>
                    <View style={ss.precisionWorkshopStatItem}><Text style={[ss.precisionWorkshopStatValue, { color }]}>{successRate}%</Text><Text style={ss.precisionWorkshopStatLabel}>{t('stats', 'successLabel')}</Text></View>
                    <View style={ss.precisionWorkshopStatItem}><Text style={ss.precisionWorkshopStatValue}>{avgPoints}</Text><Text style={ss.precisionWorkshopStatLabel}>{t('stats', 'precisionAvgPtsLabel')}</Text></View>
                    <View style={ss.precisionWorkshopStatItem}><Text style={[ss.precisionWorkshopStatValue, { color: theme.carreauColor }]}>{data.bestSessionScore}</Text><Text style={ss.precisionWorkshopStatLabel}>{t('stats', 'precisionBestLabel')}</Text></View>
                  </View>
                  {data.sessionScores.length >= 2 ? (
                    <View style={ss.precisionEvolutionRow}>
                      <Text style={ss.precisionEvolutionLabel}>{t('stats', 'precisionEvolutionLabel')}</Text>
                      <View style={ss.precisionEvolutionBars}>
                        {data.sessionScores.slice(-5).map((s: any, i: number) => {
                          const maxPts = data.maxSessionPoints || 20;
                          const pct = maxPts > 0 ? Math.min(100, (s.score / maxPts) * 100) : 0;
                          return (
                            <View key={i} style={ss.precisionEvolutionBarCol}>
                              <View style={ss.precisionEvolutionBarTrack}><View style={[ss.precisionEvolutionBarFill, { height: `${Math.max(pct, 4)}%`, backgroundColor: color }]} /></View>
                              <Text style={ss.precisionEvolutionBarLabel}>{s.score}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
            {/* Insight */}
            {(() => {
              const entries = precisionWorkshopStats.activeAteliers.filter((a: string) => precisionWorkshopStats.atelierData[a].totalShots >= 2);
              if (entries.length < 2) return null;
              const rates = entries.map((a: string) => ({ a, rate: precisionWorkshopStats.atelierData[a].totalShots > 0 ? (precisionWorkshopStats.atelierData[a].successCount / precisionWorkshopStats.atelierData[a].totalShots) * 100 : 0 }));
              rates.sort((a: any, b: any) => b.rate - a.rate);
              const best = rates[0]; const worst = rates[rates.length - 1];
              if (best.rate - worst.rate < 15) return null;
              return (
                <View style={ss.insightBox}>
                  <MaterialIcons name="lightbulb" size={16} color={theme.carreauColor} />
                  <Text style={ss.insightText}>
                    {t('stats', 'yourLabel')} <Text style={{ fontWeight: '700', color: theme.success }}>{t('precisionWorkshops', best.a)}</Text> {t('stats', 'precisionInsightBest')} ({Math.round(best.rate)}%).{' '}
                    <Text style={{ fontWeight: '700', color: theme.error }}>{t('precisionWorkshops', worst.a)}</Text> {t('stats', 'precisionInsightWorst')} ({Math.round(worst.rate)}%).
                  </Text>
                </View>
              );
            })()}
          </View>
        </Animated.View>
      )}

      {/* Terrain Stats */}
      {terrainTypeStats.hasData && (
        <Animated.View entering={FadeInDown.duration(400).delay(250)} style={ss.section}>
          <SectionHeader title={t('stats', 'statsByTerrainSection')} subtitle={`${terrainTypeStats.totalTerrainMatches} ${t('stats', 'terrainMatchesSubtitle')}`} icon="terrain" color={theme.tirColor} />
          <View style={ss.card}>
            <View style={ss.crossTableHeader}>
              <View style={ss.crossTableHeaderLabel}><Text style={ss.crossTableHeaderText}>{t('stats', 'terrainColumn')}</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={[ss.crossTableHeaderCellText, { color: theme.tirColor }]}>{t('stats', 'shotSuccessColumn')}</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={[ss.crossTableHeaderCellText, { color: theme.carreauColor }]}>{t('stats', 'carreauShortColumn')}</Text></View>
            </View>
            {terrainTypeStats.types.map((type: string, idx: number) => {
              const data = terrainTypeStats.byTerrain[type];
              const tirRate = data.tirs > 0 ? Math.round((data.tirsSuccess / data.tirs) * 100) : 0;
              const carRate = data.tirs > 0 ? Math.round((data.carreaux / data.tirs) * 100) : 0;
              return (
                <View key={type} style={[ss.crossTableRow, idx % 2 === 0 && ss.crossTableRowAlt]}>
                  <View style={ss.crossTableRowLabel}><Text style={ss.crossTableRowLabelText} numberOfLines={1}>{t('terrainTypes', type)}</Text><Text style={ss.crossTableCellPct}>{data.tirs} {t('stats', 'shotsUnit')}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.tirColor }]}>{tirRate}%</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.carreauColor }]}>{carRate}%</Text></View>
                </View>
              );
            })}
          </View>
        </Animated.View>
      )}
    </>
  );
}
