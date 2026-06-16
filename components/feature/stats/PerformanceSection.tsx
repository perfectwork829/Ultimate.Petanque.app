/**
 * Performance section for the Stats tab.
 * Extracted from app/(tabs)/stats.tsx.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import theme from '@/constants/theme';
import { ProgressRing, StatRow, SectionHeader, ProgressBar, BreakdownBar } from './StatsPrimitives';
import { statsSharedStyles as ss } from './statsSharedStyles';
import AdBanner from '@/components/ui/AdBanner';

interface PerformanceSectionProps {
  t: (section: string, key: string) => string;
  language: string;
  isTablet: boolean;
  performanceStats: any;
  tirStats: any;
  pointStats: any;
  terrainTypeStats: any;
  boulesSetStats: any;
  filteredChallenges: any[];
  itemFilterType: string;
  formatDuration: (minutes: number) => string;
  selectBoulesSet: (id: string) => void;
}

export function PerformanceSection({
  t, language, isTablet,
  performanceStats, tirStats, pointStats,
  terrainTypeStats, boulesSetStats,
  filteredChallenges, itemFilterType,
  formatDuration, selectBoulesSet,
}: PerformanceSectionProps) {
  // Challenge-specific view when filtering by challenge with no matches
  if (itemFilterType === 'challenge' && filteredChallenges.length > 0 && performanceStats.total === 0) {
    return (
      <>
        {filteredChallenges.map((ch: any, idx: number) => {
          const isPrecision = ch.type === 'precision';
          const successRate = isPrecision
            ? (ch.maxPoints && ch.maxPoints > 0 ? Math.round(((ch.totalPoints || 0) / ch.maxPoints) * 100) : 0)
            : (ch.successRate ? Math.round(ch.successRate) : 0);
          const heroLabel = isPrecision ? `${ch.totalPoints || 0}/${ch.maxPoints || 100} pts` : `${ch.successCount || 0}/${ch.totalShots || 10}`;
          return (
            <View key={ch.id} style={[ss.heroCard, { borderLeftWidth: 4, borderLeftColor: theme.accent }]}>
              <View style={ss.heroContent}>
                <ProgressRing value={successRate} size={110} strokeWidth={9} color={theme.accent} label={t('stats', 'successLabel')} />
                <View style={ss.heroStats}>
                  <View style={ss.heroStatItem}>
                    <Text style={[ss.heroStatValue, { color: theme.accent }]}>{heroLabel}</Text>
                    <Text style={ss.heroStatLabel}>{t('challengeNames', ch.type)}</Text>
                  </View>
                  {!isPrecision && ch.carreauCount ? (
                    <View style={ss.heroStatItem}>
                      <Text style={[ss.heroStatValue, { color: theme.carreauColor }]}>{ch.carreauCount}</Text>
                      <Text style={ss.heroStatLabel}>{t('stats', 'carreauxLabel')}</Text>
                    </View>
                  ) : null}
                  {ch.duration ? (
                    <View style={ss.heroStatItem}>
                      <Text style={ss.heroStatValue}>{formatDuration(Math.round((ch.duration || 0) / 60))}</Text>
                      <Text style={ss.heroStatLabel}>{t('match', 'durationLabel')}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {ch.mode === '1v1' && ch.opponentName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <MaterialIcons name="people" size={16} color={theme.textMuted} />
                  <Text style={{ fontSize: 12, color: theme.textSecondary }}>vs {ch.opponentName}</Text>
                  {ch.winner ? (
                    <View style={{ marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, backgroundColor: ch.winner === 'player' ? theme.success + '20' : ch.winner === 'opponent' ? theme.error + '20' : theme.warning + '20' }}>
                      <Text style={{ fontSize: 11, fontWeight: '600', color: ch.winner === 'player' ? theme.success : ch.winner === 'opponent' ? theme.error : theme.warning }}>
                        {ch.winner === 'player' ? t('history', 'victory') : ch.winner === 'opponent' ? t('history', 'defeat') : t('history', 'draw')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {isPrecision && ch.atelierScores ? (
                <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 }}>{t('stats', 'challengeAtelierScores')}</Text>
                  {Object.entries(ch.atelierScores).map(([atelier, score]) => (
                    <StatRow key={atelier} label={t('precisionWorkshops', atelier)} value={`${score} pts`} icon="sports-score" color={theme.accent} />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
        {tirStats.totalTirs > 0 && (
          <View style={ss.section}>
            <SectionHeader title={t('stats', 'challengeTirSummary')} icon="gps-fixed" color={theme.tirColor} />
            <View style={ss.card}>
              <StatRow label={t('stats', 'shotsAttempted')} value={tirStats.totalTirs} icon="radio-button-unchecked" color={theme.textSecondary} />
              <StatRow label={t('stats', 'successPercent')} value={`${tirStats.successRate}%`} icon="percent" color={theme.tirColor} />
              <StatRow label={t('stats', 'carreauPercent')} value={`${tirStats.carreauRate}%`} icon="stars" color={theme.carreauColor} />
            </View>
          </View>
        )}
      </>
    );
  }

  // Standard performance view
  const renderGamesPlayed = () => (
    <View style={[ss.section, isTablet ? ss.tabletHalf : undefined]}>
      <SectionHeader title={t('stats', 'gamesPlayedSection')} icon="sports" color={theme.primary} />
      <View style={ss.card}>
        <View style={ss.statsGrid3}>
          <View style={ss.gridItem}><Text style={ss.gridValue}>{performanceStats.total}</Text><Text style={ss.gridLabel}>{t('stats', 'totalLabel')}</Text></View>
          <View style={ss.gridItem}><Text style={ss.gridValue}>{performanceStats.trainingCount}</Text><Text style={ss.gridLabel}>{t('stats', 'training')}</Text></View>
          <View style={ss.gridItem}><Text style={ss.gridValue}>{performanceStats.tournamentCount}</Text><Text style={ss.gridLabel}>{t('stats', 'tournamentLabel')}</Text></View>
        </View>
      </View>
    </View>
  );

  const renderWinRateByMode = () => (
    <View style={[ss.section, isTablet ? ss.tabletHalf : undefined]}>
      <SectionHeader title={t('stats', 'winRateByModeSection')} icon="emoji-events" color={theme.carreauColor} />
      <View style={ss.card}>
        <View style={ss.modeWinRates}>
          <View style={ss.modeWinRateItem}>
            <Text style={ss.modeLabel}>{t('stats', 'training')}</Text>
            <ProgressBar value={performanceStats.trainingWinRate} color={theme.primary} />
          </View>
          <View style={ss.modeWinRateItem}>
            <Text style={ss.modeLabel}>{t('stats', 'tournamentLabel')}</Text>
            <ProgressBar value={performanceStats.tournamentWinRate} color={theme.carreauColor} />
          </View>
        </View>
      </View>
    </View>
  );

  const renderWinRateByFormat = () => (
    <View style={[ss.section, isTablet ? ss.tabletHalf : undefined]}>
      <SectionHeader title={t('stats', 'winRateByFormatSection')} icon="group" color={theme.accent} />
      <View style={ss.card}>
        {Object.entries(performanceStats.byFormat).map(([format, data]: [string, any]) => {
          const rate = data.total > 0 ? Math.round((data.wins / data.total) * 100) : 0;
          return (
            <View key={format} style={ss.formatRow}>
              <View style={ss.formatInfo}>
                <Text style={ss.formatName}>{t('formats', format)}</Text>
                <Text style={ss.formatRecord}>{data.wins}V - {data.total - data.wins}D ({data.total})</Text>
              </View>
              <View style={ss.formatBarContainer}>
                <ProgressBar value={rate} color={format === 'Tête-à-tête' ? theme.tirColor : format === 'Doublette' ? theme.primary : theme.accent} />
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );

  const renderAvgScore = () => (
    <View style={[ss.section, isTablet ? ss.tabletHalf : undefined]}>
      <SectionHeader title={t('stats', 'avgScoreSection')} icon="scoreboard" color={theme.success} />
      <View style={ss.card}>
        <View style={ss.scoreComparison}>
          <View style={ss.scoreItem}>
            <MaterialIcons name="add-circle" size={28} color={theme.success} />
            <Text style={[ss.scoreValue, { color: theme.success }]}>{performanceStats.avgScoreFor}</Text>
            <Text style={ss.scoreLabel}>{t('stats', 'scoredLabel')}</Text>
          </View>
          <View style={ss.scoreDiff}>
            <View style={[ss.scoreDiffBadge, { backgroundColor: performanceStats.pointDiff >= 0 ? theme.success + '15' : theme.error + '15' }]}>
              <Text style={[ss.scoreDiffText, { color: performanceStats.pointDiff >= 0 ? theme.success : theme.error }]}>
                {performanceStats.avgPointDiff > '0' ? '+' : ''}{performanceStats.avgPointDiff}
              </Text>
              <Text style={ss.scoreDiffLabel}>{t('stats', 'avgPerGameLabel')}</Text>
            </View>
          </View>
          <View style={ss.scoreItem}>
            <MaterialIcons name="remove-circle" size={28} color={theme.error} />
            <Text style={[ss.scoreValue, { color: theme.error }]}>{performanceStats.avgScoreAgainst}</Text>
            <Text style={ss.scoreLabel}>{t('stats', 'concededLabel')}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  return (
    <>
      {/* Hero Ring */}
      <View style={[ss.heroCard, isTablet && ss.heroCardTablet]}>
        <View style={ss.heroContent}>
          <ProgressRing value={performanceStats.winRate} size={isTablet ? 130 : 110} strokeWidth={isTablet ? 10 : 9} color={theme.primary} label={t('stats', 'victoriesLabel')} />
          <View style={ss.heroStats}>
            <View style={ss.heroStatItem}>
              <Text style={[ss.heroStatValue, { color: theme.success }]}>{performanceStats.wins}</Text>
              <Text style={ss.heroStatLabel}>{t('stats', 'wonLabel')}</Text>
            </View>
            <View style={ss.heroStatItem}>
              <Text style={[ss.heroStatValue, { color: theme.error }]}>{performanceStats.losses}</Text>
              <Text style={ss.heroStatLabel}>{t('stats', 'lostLabel')}</Text>
            </View>
            <View style={ss.heroStatItem}>
              <Text style={ss.heroStatValue}>{performanceStats.total}</Text>
              <Text style={ss.heroStatLabel}>{t('stats', 'totalLabel')}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Games Played */}
      {renderGamesPlayed()}

      <AdBanner position="inline" />

      {/* Win Rate by Format + Avg Score */}
      {isTablet ? (
        <View style={ss.tabletRow}>{renderWinRateByFormat()}{renderAvgScore()}</View>
      ) : (
        <>{renderWinRateByFormat()}{renderAvgScore()}</>
      )}

      {/* Fanny Section */}
      {(performanceStats.fannyWins > 0 || performanceStats.fannyLosses > 0) && (
        <View style={[ss.section, isTablet ? ss.tabletHalf : undefined]}>
          <SectionHeader title={t('stats', 'fannySection')} icon="sentiment-very-satisfied" color={'#F97316'} />
          <View style={ss.card}>
            <View style={ss.scoreComparison}>
              <View style={ss.scoreItem}>
                <MaterialIcons name="sentiment-very-satisfied" size={28} color={theme.success} />
                <Text style={[ss.scoreValue, { color: theme.success }]}>{performanceStats.fannyWins}</Text>
                <Text style={ss.scoreLabel}>{t('stats', 'fannyGivenLabel')}</Text>
                <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>{t('stats', 'fannyGivenDesc')}</Text>
              </View>
              <View style={ss.scoreDiff}>
                <View style={[ss.scoreDiffBadge, { backgroundColor: '#F9731615' }]}>
                  <Text style={[ss.scoreDiffText, { color: '#F97316', fontSize: 16 }]}>13-0</Text>
                  <Text style={ss.scoreDiffLabel}>Fanny</Text>
                </View>
              </View>
              <View style={ss.scoreItem}>
                <MaterialIcons name="sentiment-dissatisfied" size={28} color={theme.error} />
                <Text style={[ss.scoreValue, { color: theme.error }]}>{performanceStats.fannyLosses}</Text>
                <Text style={ss.scoreLabel}>{t('stats', 'fannyReceivedLabel')}</Text>
                <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>{t('stats', 'fannyReceivedDesc')}</Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Duration */}
      {performanceStats.matchesWithDuration > 0 && (
        <View style={ss.section}>
          <SectionHeader title={t('stats', 'gameDurationSection')} icon="timer" color={theme.accent} />
          <View style={ss.card}>
            <View style={ss.durationHero}>
              <View style={ss.durationMain}>
                <MaterialIcons name="schedule" size={28} color={theme.accent} />
                <Text style={ss.durationMainValue}>{formatDuration(performanceStats.avgDuration)}</Text>
                <Text style={ss.durationMainLabel}>{t('stats', 'avgDurationLabel')}</Text>
              </View>
              <View style={ss.durationMinMax}>
                <View style={ss.durationMinMaxItem}>
                  <MaterialIcons name="fast-forward" size={16} color={theme.success} />
                  <Text style={ss.durationMinMaxValue}>{formatDuration(performanceStats.minDuration)}</Text>
                  <Text style={ss.durationMinMaxLabel}>{t('stats', 'fastestLabel')}</Text>
                </View>
                <View style={ss.durationMinMaxItem}>
                  <MaterialIcons name="hourglass-full" size={16} color={theme.warning} />
                  <Text style={ss.durationMinMaxValue}>{formatDuration(performanceStats.maxDuration)}</Text>
                  <Text style={ss.durationMinMaxLabel}>{t('stats', 'longestLabel')}</Text>
                </View>
              </View>
            </View>
            <View style={ss.divider} />
            <View style={ss.totalTimeRow}>
              <MaterialIcons name="access-time" size={18} color={theme.textSecondary} />
              <Text style={ss.totalTimeLabel}>{t('stats', 'totalPlayTimeLabel')}</Text>
              <Text style={ss.totalTimeValue}>{formatDuration(performanceStats.totalDuration)}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Terrain Type Stats */}
      {terrainTypeStats.hasData && (
        <View style={ss.section}>
          <SectionHeader title={t('stats', 'statsByTerrainSection')} subtitle={`${terrainTypeStats.totalTerrainMatches} ${t('stats', 'terrainMatchesSubtitle')}`} icon="terrain" color={theme.success} />
          <View style={ss.card}>
            <View style={ss.crossTableHeader}>
              <View style={ss.crossTableHeaderLabel}><Text style={ss.crossTableHeaderText}>{t('stats', 'terrainColumn')}</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={ss.crossTableHeaderCellText}>{t('stats', 'matchesColumn')}</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={[ss.crossTableHeaderCellText, { color: theme.primary }]}>{t('stats', 'winRateColumn')}</Text></View>
            </View>
            {terrainTypeStats.types.map((type: string, idx: number) => {
              const data = terrainTypeStats.byTerrain[type];
              const winRate = data.matches > 0 ? Math.round((data.wins / data.matches) * 100) : 0;
              return (
                <View key={type} style={[ss.crossTableRow, idx % 2 === 0 && ss.crossTableRowAlt]}>
                  <View style={ss.crossTableRowLabel}>
                    <Text style={ss.crossTableRowLabelText} numberOfLines={1}>{t('terrainTypes', type)}</Text>
                  </View>
                  <View style={ss.crossTableCell}><Text style={ss.crossTableCellValue}>{data.matches}</Text></View>
                  <View style={ss.crossTableCell}>
                    <Text style={[ss.crossTableCellValue, { color: winRate >= 60 ? theme.success : winRate >= 45 ? theme.warning : theme.error }]}>{winRate}%</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Boules Set Stats */}
      {boulesSetStats.hasData && (
        <View style={ss.section}>
          <SectionHeader title={t('stats', 'statsByBoulesSection')} subtitle={`${boulesSetStats.totalWithBoules} ${t('profile', 'matchesWithBoulesSet')}`} icon="sports-baseball" color={'#D97706'} />
          <View style={ss.card}>
            <View style={ss.crossTableHeader}>
              <View style={ss.crossTableHeaderLabel}><Text style={ss.crossTableHeaderText}>{t('stats', 'boulesSetColumn')}</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={[ss.crossTableHeaderCellText, { color: theme.primary }]}>{t('stats', 'winRateColumn')}</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={[ss.crossTableHeaderCellText, { color: theme.tirColor }]}>{t('statsExtra', 'shotLabel')}</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={[ss.crossTableHeaderCellText, { color: theme.pointColor }]}>Pt</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={[ss.crossTableHeaderCellText, { color: theme.carreauColor }]}>C</Text></View>
              <View style={ss.crossTableHeaderCell}><Text style={[ss.crossTableHeaderCellText, { color: '#8B5CF6' }]}>DB</Text></View>
            </View>
            {boulesSetStats.sets.map((setId: string, idx: number) => {
              const data = boulesSetStats.bySet[setId];
              const winRate = data.matches > 0 ? Math.round((data.wins / data.matches) * 100) : 0;
              const tirRate = data.tirs > 0 ? Math.round((data.tirsSuccess / data.tirs) * 100) : 0;
              const ptRate = data.points > 0 ? Math.round((data.pointsSuccess / data.points) * 100) : 0;
              const carRate = data.tirs > 0 ? Math.round((data.carreaux / data.tirs) * 100) : 0;
              const dbRate = data.pointQualitiesSuccess > 0 ? Math.round((data.devantBoule / data.pointQualitiesSuccess) * 100) : 0;
              return (
                <Pressable key={setId} style={[ss.crossTableRow, idx % 2 === 0 && ss.crossTableRowAlt]} onPress={() => selectBoulesSet(setId)}>
                  <View style={ss.crossTableRowLabel}>
                    <MaterialIcons name="sports-baseball" size={14} color={'#D97706'} />
                    <View style={{ flex: 1 }}>
                      <Text style={ss.crossTableRowLabelText} numberOfLines={1}>{data.name}</Text>
                      <Text style={ss.crossTableCellPct}>{data.matches}M{data.challenges > 0 ? ` +${data.challenges}C` : ''}{data.diameter ? ` • ${data.diameter}mm` : ''}{data.weight ? ` • ${data.weight}g` : ''}</Text>
                    </View>
                  </View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: winRate >= 60 ? theme.success : winRate >= 45 ? theme.warning : theme.error }]}>{winRate}%</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.tirColor }]}>{tirRate > 0 ? `${tirRate}%` : '-'}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.pointColor }]}>{ptRate > 0 ? `${ptRate}%` : '-'}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: theme.carreauColor }]}>{carRate > 0 ? `${carRate}%` : '-'}</Text></View>
                  <View style={ss.crossTableCell}><Text style={[ss.crossTableCellValue, { color: '#8B5CF6' }]}>{dbRate > 0 ? `${dbRate}%` : '-'}</Text></View>
                </Pressable>
              );
            })}

            {/* Comparison bar chart for 2+ sets */}
            {boulesSetStats.sets.length >= 2 && (() => {
              const setsWithMatches = boulesSetStats.sets.filter((id: string) => boulesSetStats.bySet[id].matches >= 1);
              if (setsWithMatches.length < 2) return null;
              const setColors = ['#D97706', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#F97316'];
              const metrics = [
                { key: 'win', label: t('statsExtra', 'winsLabel'), getValue: (d: any) => d.matches > 0 ? Math.round((d.wins / d.matches) * 100) : 0 },
                { key: 'tir', label: t('statsExtra', 'shotLabel'), getValue: (d: any) => d.tirs > 0 ? Math.round((d.tirsSuccess / d.tirs) * 100) : 0 },
                { key: 'pt', label: 'Point', getValue: (d: any) => d.points > 0 ? Math.round((d.pointsSuccess / d.points) * 100) : 0 },
                { key: 'car', label: t('statsExtra', 'carreauLabel'), getValue: (d: any) => d.tirs > 0 ? Math.round((d.carreaux / d.tirs) * 100) : 0 },
                { key: 'db', label: t('stats', 'inFrontBallLabel'), getValue: (d: any) => d.pointQualitiesSuccess > 0 ? Math.round((d.devantBoule / d.pointQualitiesSuccess) * 100) : 0 },
              ];
              return (
                <View style={ss.boulesCompChart}>
                  <View style={ss.boulesCompChartHeader}>
                    <MaterialIcons name="bar-chart" size={16} color={'#D97706'} />
                    <Text style={ss.boulesCompChartTitle}>{t('statsExtra', 'setsComparison')}</Text>
                  </View>
                  {metrics.map(metric => (
                    <View key={metric.key} style={ss.boulesCompMetricRow}>
                      <Text style={ss.boulesCompMetricLabel}>{metric.label}</Text>
                      <View style={ss.boulesCompBarsCol}>
                        {setsWithMatches.slice(0, 4).map((setId: string, sIdx: number) => {
                          const val = metric.getValue(boulesSetStats.bySet[setId]);
                          const barColor = setColors[sIdx % setColors.length];
                          return (
                            <View key={setId} style={ss.boulesCompBarRow}>
                              <View style={ss.boulesCompBarTrack}>
                                <View style={[ss.boulesCompBarFill, { width: `${Math.min(val, 100)}%`, backgroundColor: barColor }]} />
                              </View>
                              <Text style={[ss.boulesCompBarValue, { color: barColor }]}>{val}%</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  ))}
                  <View style={ss.boulesCompLegend}>
                    {setsWithMatches.slice(0, 4).map((setId: string, sIdx: number) => (
                      <View key={setId} style={ss.boulesCompLegendItem}>
                        <View style={[ss.boulesCompLegendDot, { backgroundColor: setColors[sIdx % setColors.length] }]} />
                        <Text style={ss.boulesCompLegendText} numberOfLines={1}>{boulesSetStats.bySet[setId].name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* Insight */}
            {boulesSetStats.sets.length >= 2 && (() => {
              const entries = boulesSetStats.sets.filter((id: string) => boulesSetStats.bySet[id].matches >= 2);
              if (entries.length < 2) return null;
              const rates = entries.map((id: string) => ({ id, name: boulesSetStats.bySet[id].name, rate: boulesSetStats.bySet[id].matches > 0 ? (boulesSetStats.bySet[id].wins / boulesSetStats.bySet[id].matches) * 100 : 0 }));
              rates.sort((a: any, b: any) => b.rate - a.rate);
              const best = rates[0];
              const worst = rates[rates.length - 1];
              if (best.rate - worst.rate < 10) return null;
              return (
                <View style={ss.insightBox}>
                  <MaterialIcons name="lightbulb" size={16} color={'#D97706'} />
                  <Text style={ss.insightText}>
                    {t('statsExtra', 'bestWinRateWith')}{' '}
                    <Text style={{ fontWeight: '700', color: theme.success }}>{best.name}</Text> ({Math.round(best.rate)}%).{' '}
                    <Text style={{ fontWeight: '700', color: theme.error }}>{worst.name}</Text>{' '}
                    {t('statsExtra', 'lessEffective')} ({Math.round(worst.rate)}%).
                  </Text>
                </View>
              );
            })()}
          </View>
        </View>
      )}
    </>
  );
}
