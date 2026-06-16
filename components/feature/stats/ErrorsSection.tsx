/**
 * Errors analysis section for the Stats tab.
 * Extracted from app/(tabs)/stats.tsx.
 */
import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { StatRow, SectionHeader, ProgressBar, BreakdownBar, NAPlaceholder } from './StatsPrimitives';
import { statsSharedStyles as ss } from './statsSharedStyles';

interface ErrorsSectionProps {
  t: (section: string, key: string) => string;
  isTablet: boolean;
  errorStats: any;
  tirStats: any;
  terrainTypeStats: any;
}

export function ErrorsSection({ t, isTablet, errorStats, tirStats, terrainTypeStats }: ErrorsSectionProps) {
  return (
    <>
      {/* Hero Errors */}
      <Animated.View entering={FadeInDown.duration(400)} style={[ss.heroCard, { borderLeftWidth: 4, borderLeftColor: theme.error }, isTablet && ss.heroCardTablet]}>
        <View style={ss.errorHeroContent}>
          <View style={ss.errorHeroMain}>
            <MaterialIcons name="error-outline" size={48} color={theme.error} />
            <Text style={ss.errorHeroValue}>{errorStats.totalErrors}</Text>
            <Text style={ss.errorHeroLabel}>{t('stats', 'totalErrorsLabel')}</Text>
          </View>
          <View style={ss.errorHeroBreakdown}>
            <View style={ss.errorHeroItem}><MaterialIcons name="gps-fixed" size={20} color={theme.tirColor} /><Text style={ss.errorHeroItemValue}>{errorStats.totalTirErrors}</Text><Text style={ss.errorHeroItemLabel}>{t('stats', 'missedShotsLabel')}</Text></View>
            <View style={ss.errorHeroItem}><MaterialIcons name="adjust" size={20} color={theme.pointColor} /><Text style={ss.errorHeroItemValue}>{errorStats.totalPointErrors}</Text><Text style={ss.errorHeroItemLabel}>{t('stats', 'missedPointsLabel')}</Text></View>
          </View>
        </View>
        {errorStats.mostCommonError && (
          <View style={ss.mostCommonError}>
            <MaterialIcons name="warning" size={16} color={theme.warning} />
            <Text style={ss.mostCommonErrorText}>
              {t('stats', 'mostCommonErrorLabel')}: <Text style={ss.mostCommonErrorHighlight}>{errorStats.mostCommonError.type}</Text> ({errorStats.mostCommonError.count}x)
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Error Rates */}
      <Animated.View entering={FadeInDown.duration(400).delay(50)} style={ss.section}>
        <SectionHeader title={t('stats', 'overallErrorRateSection')} icon="analytics" color={theme.error} />
        <View style={ss.card}>
          <View style={[ss.errorRatesGrid, isTablet && ss.errorRatesGridTablet]}>
            <View style={[ss.errorRateCard, { borderColor: theme.tirColor }]}><MaterialIcons name="gps-fixed" size={24} color={theme.tirColor} /><Text style={[ss.errorRateValue, { color: theme.tirColor }]}>{errorStats.tirErrorRate}%</Text><Text style={ss.errorRateLabel}>{t('stats', 'missedShotsLabel')}</Text></View>
            <View style={[ss.errorRateCard, { borderColor: theme.pointColor }]}><MaterialIcons name="adjust" size={24} color={theme.pointColor} /><Text style={[ss.errorRateValue, { color: theme.pointColor }]}>{errorStats.pointErrorRate}%</Text><Text style={ss.errorRateLabel}>{t('stats', 'missedPointsLabel')}</Text></View>
          </View>
        </View>
      </Animated.View>

      {/* Error by Duration */}
      {(errorStats.shortMatchCount > 0 || errorStats.mediumMatchCount > 0 || errorStats.longMatchCount > 0) && (
        <Animated.View entering={FadeInDown.duration(400).delay(100)} style={ss.section}>
          <SectionHeader title={t('stats', 'errorsByDurationSection')} subtitle={t('stats', 'fatigueImpactLabel')} icon="timer" color={theme.warning} />
          <View style={ss.card}>
            <StatRow label={t('stats', 'shortGamesLabel')} value={`${errorStats.shortMatchErrorRate}%`} subValue={`${errorStats.shortMatchCount} ${t('stats', 'gamesUnit')}`} icon="fast-forward" color={theme.success} />
            <StatRow label={t('stats', 'mediumGamesLabel')} value={`${errorStats.mediumMatchErrorRate}%`} subValue={`${errorStats.mediumMatchCount} ${t('stats', 'gamesUnit')}`} icon="schedule" color={theme.warning} />
            <StatRow label={t('stats', 'longGamesLabel')} value={`${errorStats.longMatchErrorRate}%`} subValue={`${errorStats.longMatchCount} ${t('stats', 'gamesUnit')}`} icon="hourglass-full" color={theme.error} />
            {errorStats.longMatchErrorRate > errorStats.shortMatchErrorRate + 10 && (
              <View style={ss.insightBox}><MaterialIcons name="lightbulb" size={16} color={theme.warning} /><Text style={ss.insightText}>{t('stats', 'insightFatigueIncrease')} {errorStats.longMatchErrorRate - errorStats.shortMatchErrorRate}% {t('stats', 'insightFatigueWork')}</Text></View>
            )}
          </View>
        </Animated.View>
      )}

      {/* Error by Format */}
      <Animated.View entering={FadeInDown.duration(400).delay(150)} style={ss.section}>
        <SectionHeader title={t('stats', 'errorsByFormatSection')} icon="group" color={theme.accent} />
        <View style={ss.card}>
          {Object.entries(errorStats.errorByFormat).map(([format, data]: [string, any]) => (
            <View key={format} style={ss.formatRow}>
              <View style={ss.formatInfo}><Text style={ss.formatName}>{t('formats', format)}</Text><Text style={ss.formatRecord}>{data.errors} {t('stats', 'errorsSlashActions')} / {data.total} {t('stats', 'actionsUnit')}</Text></View>
              <View style={ss.formatBarContainer}><ProgressBar value={data.rate} color={data.rate > 40 ? theme.error : data.rate > 25 ? theme.warning : theme.success} /></View>
            </View>
          ))}
        </View>
      </Animated.View>

      {/* Error by Mode */}
      <Animated.View entering={FadeInDown.duration(400).delay(200)} style={ss.section}>
        <SectionHeader title={t('stats', 'errorsByContextSection')} subtitle={t('stats', 'trainingVsTournamentLabel')} icon="psychology" color={theme.primary} />
        <View style={ss.card}>
          <View style={ss.contextComparison}>
            <View style={ss.contextItem}><Text style={ss.contextLabel}>{t('stats', 'training')}</Text><Text style={[ss.contextValue, { color: errorStats.trainingErrorRate > errorStats.tournamentErrorRate ? theme.error : theme.success }]}>{errorStats.trainingErrorRate}%</Text><Text style={ss.contextSubLabel}>{t('stats', 'ofErrorsLabel')}</Text></View>
            <View style={ss.contextDivider}><MaterialIcons name="compare-arrows" size={24} color={theme.textMuted} /></View>
            <View style={ss.contextItem}><Text style={ss.contextLabel}>{t('stats', 'tournamentLabel')}</Text><Text style={[ss.contextValue, { color: errorStats.tournamentErrorRate > errorStats.trainingErrorRate ? theme.error : theme.success }]}>{errorStats.tournamentErrorRate}%</Text><Text style={ss.contextSubLabel}>{t('stats', 'ofErrorsLabel')}</Text></View>
          </View>
          {Math.abs(errorStats.trainingErrorRate - errorStats.tournamentErrorRate) > 10 && (
            <View style={ss.insightBox}><MaterialIcons name="psychology" size={16} color={theme.primary} /><Text style={ss.insightText}>{errorStats.tournamentErrorRate > errorStats.trainingErrorRate ? t('stats', 'insightTournamentPressure') : t('stats', 'insightMoreFocused')}</Text></View>
          )}
        </View>
      </Animated.View>

      {/* Shot Failure Analysis */}
      {(errorStats.totalTirErrorResults > 0 || errorStats.totalTirErrorByTechnique > 0 || tirStats.hasCrossResultData) && (
        <Animated.View entering={FadeInDown.duration(400).delay(250)} style={ss.section}>
          <SectionHeader title={t('stats', 'shotFailAnalysisSection')} subtitle={`${Math.max(errorStats.totalTirErrorResults, errorStats.totalTirErrorByTechnique, tirStats.totalCrossResultTracked)} ${t('stats', 'missedShotsAnalyzed')}`} icon="highlight-off" color={theme.tirColor} />
          <View style={ss.card}>
            {errorStats.totalTirErrorResults > 0 && (
              <>
                {errorStats.tirErrorResults.courtDroite > 0 && (<><StatRow label={t('stats', 'courtDroiteLabel')} value={errorStats.tirErrorResults.courtDroite} subValue={`${Math.round((errorStats.tirErrorResults.courtDroite / errorStats.totalTirErrorResults) * 100)}%`} icon="subdirectory-arrow-right" color="#E57373" /><View style={ss.coachingTip}><View style={ss.coachingTipHeader}><MaterialIcons name="psychology" size={14} color={theme.tirColor} /><Text style={ss.coachingTipCause}>{t('stats', 'courtDroiteCause')}</Text></View><Text style={ss.coachingTipAdvice}>{t('stats', 'courtDroiteAdvice')}</Text></View></>)}
                {errorStats.tirErrorResults.courtGauche > 0 && (<><StatRow label={t('stats', 'courtGaucheLabel')} value={errorStats.tirErrorResults.courtGauche} subValue={`${Math.round((errorStats.tirErrorResults.courtGauche / errorStats.totalTirErrorResults) * 100)}%`} icon="subdirectory-arrow-left" color="#EF5350" /><View style={ss.coachingTip}><View style={ss.coachingTipHeader}><MaterialIcons name="psychology" size={14} color={theme.tirColor} /><Text style={ss.coachingTipCause}>{t('stats', 'courtGaucheCause')}</Text></View><Text style={ss.coachingTipAdvice}>{t('stats', 'courtGaucheAdvice')}</Text></View></>)}
                {errorStats.tirErrorResults.long > 0 && (<><StatRow label={t('stats', 'longLabel')} value={errorStats.tirErrorResults.long} subValue={`${Math.round((errorStats.tirErrorResults.long / errorStats.totalTirErrorResults) * 100)}%`} icon="arrow-upward" color="#F44336" /><View style={ss.coachingTip}><View style={ss.coachingTipHeader}><MaterialIcons name="psychology" size={14} color={theme.tirColor} /><Text style={ss.coachingTipCause}>{t('stats', 'longCause')}</Text></View><Text style={ss.coachingTipAdvice}>{t('stats', 'longAdvice')}</Text></View></>)}
                {errorStats.tirErrorResults.tirBouchon > 0 && (<><StatRow label={t('stats', 'tirBouchonLabel')} value={errorStats.tirErrorResults.tirBouchon} subValue={`${Math.round((errorStats.tirErrorResults.tirBouchon / errorStats.totalTirErrorResults) * 100)}%`} icon="adjust" color={theme.warning} /><View style={ss.coachingTip}><View style={ss.coachingTipHeader}><MaterialIcons name="psychology" size={14} color={theme.tirColor} /><Text style={ss.coachingTipCause}>{t('stats', 'tirBouchonCause')}</Text></View><Text style={ss.coachingTipAdvice}>{t('stats', 'tirBouchonAdvice')}</Text></View></>)}
                <View style={ss.divider} />
                <BreakdownBar items={[
                  { label: t('stats', 'courtDShort'), value: errorStats.tirErrorResults.courtDroite, color: '#E57373' },
                  { label: t('stats', 'courtGShort'), value: errorStats.tirErrorResults.courtGauche, color: '#EF5350' },
                  { label: t('stats', 'longShort'), value: errorStats.tirErrorResults.long, color: '#F44336' },
                  { label: t('stats', 'jackShort'), value: errorStats.tirErrorResults.tirBouchon, color: theme.warning },
                ].filter(i => i.value > 0)} />
              </>
            )}
            {errorStats.totalTirErrorResults === 0 && errorStats.totalTirErrorByTechnique > 0 && (
              <>
                {errorStats.tirErrorByTechnique.auFerRate > 0 && <StatRow label={t('stats', 'tirTenduMissedLabel')} value={errorStats.tirErrorByTechnique.auFerRate} subValue={`${Math.round((errorStats.tirErrorByTechnique.auFerRate / errorStats.totalTirErrorByTechnique) * 100)}%`} icon="gps-fixed" color={theme.tirColor} />}
                {errorStats.tirErrorByTechnique.auPlombRate > 0 && <StatRow label={t('stats', 'tirClocheMissedLabel')} value={errorStats.tirErrorByTechnique.auPlombRate} subValue={`${Math.round((errorStats.tirErrorByTechnique.auPlombRate / errorStats.totalTirErrorByTechnique) * 100)}%`} icon="flight-takeoff" color={theme.pointColor} />}
                {errorStats.tirErrorByTechnique.enRafleRate > 0 && <StatRow label={t('stats', 'enRafleMissedLabel')} value={errorStats.tirErrorByTechnique.enRafleRate} subValue={`${Math.round((errorStats.tirErrorByTechnique.enRafleRate / errorStats.totalTirErrorByTechnique) * 100)}%`} icon="swap-horiz" color={theme.accent} />}
              </>
            )}
            {tirStats.hasCrossResultData && errorStats.totalTirErrorResults > 0 && (
              <>
                <View style={ss.divider} />
                <Text style={ss.errorSubsectionTitle}>{t('stats', 'failsByTechniqueLabel')}</Text>
                {[
                  { key: 'au_fer', label: t('stats', 'tirTenduMissedLabel'), icon: 'gps-fixed', color: theme.tirColor },
                  { key: 'au_plomb', label: t('stats', 'tirClocheMissedLabel'), icon: 'flight-takeoff', color: theme.pointColor },
                  { key: 'en_rafle', label: t('stats', 'enRafleMissedLabel'), icon: 'swap-horiz', color: theme.accent },
                ].filter(row => tirStats.crossTypeResult[row.key]?.total > 0).map((row, idx, arr) => {
                  const data = tirStats.crossTypeResult[row.key];
                  const resultItems = [
                    { label: t('stats', 'courtDroiteFull'), short: t('stats', 'courtDroiteAbbr'), value: data.court_droite, color: '#E57373' },
                    { label: t('stats', 'courtGaucheFull'), short: t('stats', 'courtGaucheAbbr'), value: data.court_gauche, color: '#EF5350' },
                    { label: t('stats', 'longFull'), short: t('stats', 'longAbbr'), value: data.long, color: '#F44336' },
                    { label: t('stats', 'jackFull'), short: t('stats', 'jackAbbr'), value: data.tir_bouchon, color: theme.warning },
                  ];
                  const dominant = resultItems.reduce((max: any, r: any) => r.value > max.value ? r : max, resultItems[0]);
                  const dominantPct = data.total > 0 ? Math.round((dominant.value / data.total) * 100) : 0;
                  return (
                    <View key={row.key}>
                      <StatRow label={row.label} value={data.total} subValue={dominant.value > 0 ? `${t('stats', 'insightMainly')} ${dominant.label.toLowerCase()} (${dominantPct}%)` : ''} icon={row.icon} color={row.color} />
                      {data.total > 1 && (<View style={{ paddingLeft: 38, paddingRight: 8, paddingBottom: 8, paddingTop: 4 }}><BreakdownBar items={resultItems.filter((r: any) => r.value > 0).map((r: any) => ({ label: r.short, value: r.value, color: r.color }))} /></View>)}
                      {idx < arr.length - 1 && <View style={ss.divider} />}
                    </View>
                  );
                })}
              </>
            )}
          </View>
        </Animated.View>
      )}

      {/* Point Failure Analysis */}
      {errorStats.totalPointErrorTyped > 0 && (
        <Animated.View entering={FadeInDown.duration(400).delay(300)} style={ss.section}>
          <SectionHeader title={t('stats', 'pointFailAnalysisSection')} subtitle={`${errorStats.totalPointErrorTyped} ${t('stats', 'errorsAnalyzedLabel')}`} icon="highlight-off" color={theme.pointColor} />
          <View style={ss.card}>
            {errorStats.pointErrorTypes.rate > 0 && (<><StatRow label={t('stats', 'pointRateLabel2')} value={errorStats.pointErrorTypes.rate} subValue={`${Math.round((errorStats.pointErrorTypes.rate / errorStats.totalPointErrorTyped) * 100)}%`} icon="cancel" color={theme.error} /><View style={ss.coachingTipPoint}><View style={ss.coachingTipHeader}><MaterialIcons name="psychology" size={14} color={theme.pointColor} /><Text style={[ss.coachingTipCause, { color: theme.pointColor }]}>{t('stats', 'pointRateCause')}</Text></View><Text style={ss.coachingTipAdvice}>{t('stats', 'pointRateAdvice')}</Text></View></>)}
            {errorStats.pointErrorTypes.crochete > 0 && (<><StatRow label={t('stats', 'pointCrocheteLabel')} value={errorStats.pointErrorTypes.crochete} subValue={`${Math.round((errorStats.pointErrorTypes.crochete / errorStats.totalPointErrorTyped) * 100)}%`} icon="sync-problem" color={theme.warning} /><View style={ss.coachingTipPoint}><View style={ss.coachingTipHeader}><MaterialIcons name="psychology" size={14} color={theme.pointColor} /><Text style={[ss.coachingTipCause, { color: theme.pointColor }]}>{t('stats', 'pointCrocheteCause')}</Text></View><Text style={ss.coachingTipAdvice}>{t('stats', 'pointCrocheteAdvice')}</Text></View></>)}
            {errorStats.pointErrorTypes.sorti > 0 && (<><StatRow label={t('stats', 'pointSortiLabel')} value={errorStats.pointErrorTypes.sorti} subValue={`${Math.round((errorStats.pointErrorTypes.sorti / errorStats.totalPointErrorTyped) * 100)}%`} icon="logout" color={theme.error} /><View style={ss.coachingTipPoint}><View style={ss.coachingTipHeader}><MaterialIcons name="psychology" size={14} color={theme.pointColor} /><Text style={[ss.coachingTipCause, { color: theme.pointColor }]}>{t('stats', 'pointSortiCause')}</Text></View><Text style={ss.coachingTipAdvice}>{t('stats', 'pointSortiAdvice')}</Text></View></>)}
            <View style={ss.divider} />
            <Text style={ss.errorSubsectionTitle}>{t('stats', 'failsByPointTypeLabel')}</Text>
            {errorStats.pointErrorTypes.rouleRate > 0 && <StatRow label={t('stats', 'rolledMissedLabel')} value={errorStats.pointErrorTypes.rouleRate} icon="sports-baseball" color={theme.textMuted} />}
            {errorStats.pointErrorTypes.plombeRate > 0 && <StatRow label={t('stats', 'lobbedMissedLabel')} value={errorStats.pointErrorTypes.plombeRate} icon="flight-land" color={theme.textMuted} />}
            {errorStats.pointErrorTypes.demiPorteeRate > 0 && <StatRow label={t('stats', 'halfCarryMissedLabel')} value={errorStats.pointErrorTypes.demiPorteeRate} icon="height" color={theme.textMuted} />}
            {errorStats.pointErrorTypes.porteeRate > 0 && <StatRow label={t('stats', 'carriedMissedLabel')} value={errorStats.pointErrorTypes.porteeRate} icon="flight" color={theme.textMuted} />}
            <View style={ss.divider} />
            <BreakdownBar items={[
              { label: t('stats', 'missedPointShort'), value: errorStats.pointErrorTypes.rate, color: theme.error },
              { label: t('stats', 'hookedShort'), value: errorStats.pointErrorTypes.crochete, color: theme.warning },
              { label: t('stats', 'outOfBoundsShort'), value: errorStats.pointErrorTypes.sorti, color: '#8B0000' },
            ].filter(i => i.value > 0)} />
            {errorStats.pointErrorTypes.crochete > errorStats.pointErrorTypes.rate && (
              <View style={ss.insightBox}><MaterialIcons name="lightbulb" size={16} color={theme.pointColor} /><Text style={ss.insightText}>{t('stats', 'insightReleaseError')}</Text></View>
            )}
          </View>
        </Animated.View>
      )}

      {/* Consecutive Errors */}
      {errorStats.maxConsecutiveErrors > 0 && (
        <Animated.View entering={FadeInDown.duration(400).delay(350)} style={ss.section}>
          <SectionHeader title={t('stats', 'errorStreaksSection')} subtitle={t('stats', 'difficultPassagesLabel')} icon="trending-down" color={theme.error} />
          <View style={ss.card}>
            <View style={ss.consecutiveErrorsGrid}>
              <View style={ss.consecutiveErrorItem}><Text style={ss.consecutiveErrorValue}>{errorStats.maxConsecutiveErrors}</Text><Text style={ss.consecutiveErrorLabel}>{t('stats', 'maxConsecutiveLabel')}</Text></View>
              <View style={ss.consecutiveErrorItem}><Text style={ss.consecutiveErrorValue}>{errorStats.totalErrorStreaks}</Text><Text style={ss.consecutiveErrorLabel}>{t('stats', 'streaks3PlusLabel')}</Text></View>
            </View>
            {errorStats.maxConsecutiveErrors >= 5 && (
              <View style={ss.insightBox}><MaterialIcons name="warning" size={16} color={theme.error} /><Text style={ss.insightText}>{t('stats', 'insightConsecutiveErrors')}</Text></View>
            )}
          </View>
        </Animated.View>
      )}

      {/* No detailed data */}
      {errorStats.totalTirErrorTyped === 0 && errorStats.totalPointErrorTyped === 0 && (
        <Animated.View entering={FadeInDown.duration(400).delay(250)} style={ss.section}>
          <View style={ss.card}><NAPlaceholder message={t('stats', 'useDetailedNotationLabel')} /></View>
        </Animated.View>
      )}

      {/* Terrain Stats */}
      {terrainTypeStats.hasData && (
        <Animated.View entering={FadeInDown.duration(400).delay(400)} style={ss.section}>
          <SectionHeader title={t('stats', 'statsByTerrainSection')} subtitle={`${terrainTypeStats.totalTerrainMatches} ${t('stats', 'terrainMatchesSubtitle')}`} icon="terrain" color={theme.error} />
          <View style={ss.card}>
            <View style={ss.crossTableHeader}>
              <View style={ss.crossTableHeaderLabel}><Text style={ss.crossTableHeaderText}>{t('stats', 'terrainColumn')}</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={[ss.crossTableHeaderCellText, { color: theme.error }]}>{t('stats', 'errorRateColumn')}</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={ss.crossTableHeaderCellText}>{t('stats', 'matchesColumn')}</Text></View>
            </View>
            {terrainTypeStats.types.map((type: string, idx: number) => {
              const data = terrainTypeStats.byTerrain[type];
              const totalActions = data.tirs + data.points;
              const totalSuccess = data.tirsSuccess + data.pointsSuccess;
              const errRate = totalActions > 0 ? Math.round(((totalActions - totalSuccess) / totalActions) * 100) : 0;
              return (
                <View key={type} style={[ss.crossTableRow, idx % 2 === 0 && ss.crossTableRowAlt]}>
                  <View style={ss.crossTableRowLabel}><Text style={ss.crossTableRowLabelText} numberOfLines={1}>{t('terrainTypes', type)}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: errRate > 40 ? theme.error : errRate > 25 ? theme.warning : theme.success }]}>{errRate}%</Text></View>
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
