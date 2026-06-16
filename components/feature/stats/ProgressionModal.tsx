/**
 * Progression Modal for the Stats tab.
 * Extracted from app/(tabs)/stats.tsx — contains SVG line/bar charts,
 * trend cards, challenge/tournament progression, and summary table.
 */
import React from 'react';
import { View, Text, ScrollView, Pressable, Modal, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/services/haptics';
import Svg, { Circle, Line, G, Text as SvgText, Rect } from 'react-native-svg';
import theme from '@/constants/theme';
import type { ProgressionFilter } from '@/hooks/useProgressionStats';

interface ProgressionModalProps {
  visible: boolean;
  onClose: () => void;
  isTablet: boolean;
  modalChartWidth: number;
  modalChartHeight: number;
  modalBarChartHeight: number;
  progressionFilter: ProgressionFilter;
  setProgressionFilter: (f: ProgressionFilter) => void;
  chartTooltip: { chart: string; index: number } | null;
  setChartTooltip: (t: { chart: string; index: number } | null) => void;
  performanceStats: any;
  tirStats: any;
  pointStats: any;
  progressionData: any;
  trends: any;
  challengeProgressionData: any;
  tournamentProgressionData: any;
  progressionFilters: { id: ProgressionFilter; label: string }[];
  t: (section: string, key: string) => string;
}

export function ProgressionModal({
  visible, onClose, isTablet, modalChartWidth, modalChartHeight, modalBarChartHeight,
  progressionFilter, setProgressionFilter, chartTooltip, setChartTooltip,
  performanceStats, tirStats, pointStats, progressionData, trends,
  challengeProgressionData, tournamentProgressionData, progressionFilters, t,
}: ProgressionModalProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['top']} style={s.modalContainer}>
        <View style={s.progressionModalHeader}>
          <View style={s.progressionModalHeaderTop}>
            <View>
              <Text style={s.progressionModalTitle}>{t('stats', 'progressionTitle')}</Text>
              <Text style={s.progressionModalSubtitle}>{t('stats', 'performanceEvolution')}</Text>
            </View>
            <Pressable style={s.progressionModalCloseBtn} onPress={onClose}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.progressionFilterScroll}>
            {progressionFilters.map(filter => (
              <Pressable key={filter.id} style={[s.progressionFilterPill, progressionFilter === filter.id && s.progressionFilterPillActive]} onPress={() => { Haptics.selectionAsync(); setProgressionFilter(filter.id); setChartTooltip(null); }}>
                <Text style={[s.progressionFilterText, progressionFilter === filter.id && s.progressionFilterTextActive]}>{filter.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
        <ScrollView style={s.modalContent} contentContainerStyle={[s.modalScrollContent, isTablet && s.modalScrollContentTablet]} showsVerticalScrollIndicator={false}>
          {progressionData.weeklyData.length > 0 ? (
            <>
              {/* Trend Cards */}
              <View style={[s.trendCardsRow, isTablet && s.trendCardsRowTablet]}>
                {[
                  { color: theme.primary, icon: 'emoji-events' as const, trend: trends.winRate, value: `${performanceStats.winRate}%`, label: t('stats', 'victoriesLabel') },
                  { color: theme.tirColor, icon: 'gps-fixed' as const, trend: trends.tirRate, value: `${tirStats.successRate}%`, label: t('stats', 'shotShort') },
                  { color: theme.pointColor, icon: 'adjust' as const, trend: trends.pointRate, value: `${pointStats.successRate}%`, label: t('stats', 'pointageLabel') },
                ].map((card, idx) => (
                  <View key={idx} style={[s.trendCard, { borderLeftColor: card.color }, isTablet && s.trendCardTablet]}>
                    <View style={s.trendCardHeader}>
                      <MaterialIcons name={card.icon} size={isTablet ? 22 : 18} color={card.color} />
                      <MaterialIcons name={card.trend === 'up' ? 'trending-up' : card.trend === 'down' ? 'trending-down' : 'remove'} size={isTablet ? 20 : 16} color={card.trend === 'up' ? theme.success : card.trend === 'down' ? theme.error : theme.textMuted} />
                    </View>
                    <Text style={[s.trendCardValue, isTablet && s.trendCardValueTablet]}>{card.value}</Text>
                    <Text style={[s.trendCardLabel, isTablet && s.trendCardLabelTablet]}>{card.label}</Text>
                  </View>
                ))}
              </View>

              {/* Charts Row 1: Win Rate + Tir */}
              <View style={isTablet ? s.modalTabletRow : undefined}>
                <EvolutionChart title={t('stats', 'winRateLabel')} subtitle={`${progressionData.weeklyData.reduce((sum: number, d: any) => sum + d.matches, 0)} ${t('stats', 'gamesUnit')}`} icon="emoji-events" color={theme.primary} chartKey="winRate" dataField="winRate" countField="matches" tooltipLabel={t('stats', 'gamesUnit')} tooltipDetailFn={(d: any) => `${d.matches} ${t('stats', 'gamesUnit')} • ${d.wins}V-${d.matches - d.wins}D`} data={progressionData.weeklyData} isTablet={isTablet} modalChartWidth={modalChartWidth} modalChartHeight={modalChartHeight} chartTooltip={chartTooltip} setChartTooltip={setChartTooltip} />
                <EvolutionChart title={t('stats', 'shotRateLabel')} subtitle={`${progressionData.weeklyData.reduce((sum: number, d: any) => sum + d.tirTotal, 0)} ${t('stats', 'shotsUnit')}`} icon="gps-fixed" color={theme.tirColor} chartKey="tir" dataField="tirRate" countField="tirTotal" tooltipLabel={t('stats', 'shotsUnit')} tooltipDetailFn={(d: any) => `${d.tirSuccess}/${d.tirTotal} ${t('stats', 'shotsUnit')}`} data={progressionData.weeklyData} isTablet={isTablet} modalChartWidth={modalChartWidth} modalChartHeight={modalChartHeight} chartTooltip={chartTooltip} setChartTooltip={setChartTooltip} />
              </View>

              {/* Charts Row 2: Point + Carreaux */}
              <View style={isTablet ? s.modalTabletRow : undefined}>
                <EvolutionChart title={t('stats', 'pointRateLabel')} subtitle={`${progressionData.weeklyData.reduce((sum: number, d: any) => sum + d.pointTotal, 0)} ${t('stats', 'pointsUnit')}`} icon="adjust" color={theme.pointColor} chartKey="point" dataField="pointRate" countField="pointTotal" tooltipLabel={t('stats', 'pointsUnit')} tooltipDetailFn={(d: any) => `${d.pointSuccess}/${d.pointTotal} ${t('stats', 'pointsUnit')}`} data={progressionData.weeklyData} isTablet={isTablet} modalChartWidth={modalChartWidth} modalChartHeight={modalChartHeight} chartTooltip={chartTooltip} setChartTooltip={setChartTooltip} />

                {/* Carreaux Bar Chart */}
                <View style={[s.progressionSection, isTablet && s.modalTabletHalf]}>
                  <View style={s.progressionSectionHeader}>
                    <View style={[s.progressionSectionIcon, { backgroundColor: theme.carreauColor + '15' }]}><MaterialIcons name="stars" size={20} color={theme.carreauColor} /></View>
                    <View>
                      <Text style={[s.progressionSectionTitle, isTablet && s.progressionSectionTitleTablet]}>{t('stats', 'carreauxLabel')}</Text>
                      <Text style={[s.progressionSectionSubtitle, isTablet && s.progressionSectionSubtitleTablet]}>{progressionData.weeklyData.reduce((sum: number, d: any) => sum + d.carreaux, 0)} {t('stats', 'inTotal')}</Text>
                    </View>
                  </View>
                  <View style={s.chartContainer}>
                    <Svg width={modalChartWidth} height={modalBarChartHeight}>
                      {progressionData.weeklyData.map((data: any, i: number) => {
                        const barWidth = Math.max((modalChartWidth - 40) / progressionData.weeklyData.length - 6, 8);
                        const x = 40 + (i * ((modalChartWidth - 16) / progressionData.weeklyData.length));
                        const maxCarreaux = Math.max(...progressionData.weeklyData.map((d: any) => d.carreaux), 1);
                        const barAreaH = modalBarChartHeight - 50;
                        const barHeight = Math.max((data.carreaux / maxCarreaux) * barAreaH, data.carreaux > 0 ? 4 : 0);
                        return (
                          <G key={i}>
                            <Rect x={x} y={(modalBarChartHeight - 30) - barHeight} width={barWidth} height={Math.max(barHeight, 20)} fill={chartTooltip?.chart === 'carreaux' && chartTooltip?.index === i ? theme.carreauColor + '60' : 'transparent'} rx="3" onPress={() => { Haptics.selectionAsync(); setChartTooltip(chartTooltip?.chart === 'carreaux' && chartTooltip?.index === i ? null : { chart: 'carreaux', index: i }); }} />
                            <Rect x={x} y={(modalBarChartHeight - 30) - barHeight} width={barWidth} height={barHeight} fill={theme.carreauColor} rx="3" />
                            {data.carreaux > 0 ? <SvgText x={x + barWidth / 2} y={(modalBarChartHeight - 35) - barHeight} fontSize={isTablet ? '12' : '10'} fill={theme.textPrimary} textAnchor="middle" fontWeight="600">{data.carreaux}</SvgText> : null}
                            <SvgText x={x + barWidth / 2} y={modalBarChartHeight - 10} fontSize={isTablet ? '10' : '8'} fill={theme.textMuted} textAnchor="middle">{data.week}</SvgText>
                          </G>
                        );
                      })}
                    </Svg>
                    {chartTooltip?.chart === 'carreaux' && chartTooltip.index < progressionData.weeklyData.length ? (() => {
                      const d = progressionData.weeklyData[chartTooltip.index];
                      const barWidth = Math.max((modalChartWidth - 40) / progressionData.weeklyData.length - 6, 8);
                      const tx = 40 + (chartTooltip.index * ((modalChartWidth - 16) / progressionData.weeklyData.length)) + barWidth / 2;
                      const maxC = Math.max(...progressionData.weeklyData.map((dd: any) => dd.carreaux), 1);
                      const barH = Math.max((d.carreaux / maxC) * (modalBarChartHeight - 50), 4);
                      const ty = (modalBarChartHeight - 30) - barH;
                      return (
                        <Pressable style={[s.chartTooltip, { left: Math.max(4, Math.min(tx - 68, modalChartWidth - 140)), top: Math.max(0, ty - 68) }]} onPress={() => setChartTooltip(null)}>
                          <Text style={s.chartTooltipTitle}>{d.week}</Text>
                          <Text style={s.chartTooltipRow}>{d.matches} {t('stats', 'gamesUnit')}</Text>
                          <Text style={[s.chartTooltipValue, { color: theme.carreauColor }]}>{d.carreaux} {t('stats', 'carreauxLabel')}</Text>
                        </Pressable>
                      );
                    })() : null}
                  </View>
                </View>
              </View>

              {/* Challenge Progression */}
              {challengeProgressionData.hasData ? (
                <View style={s.progressionSection}>
                  <View style={s.progressionSectionHeader}>
                    <View style={[s.progressionSectionIcon, { backgroundColor: theme.accent + '15' }]}><MaterialIcons name="flag" size={20} color={theme.accent} /></View>
                    <View>
                      <Text style={[s.progressionSectionTitle, isTablet && s.progressionSectionTitleTablet]}>{t('stats', 'challengeProgressionTitle')}</Text>
                      <Text style={[s.progressionSectionSubtitle, isTablet && s.progressionSectionSubtitleTablet]}>{t('stats', 'challengeProgressionSubtitle')}</Text>
                    </View>
                  </View>
                  <View style={s.chartContainer}>
                    <Svg width={modalChartWidth} height={modalChartHeight + 20}>
                      {[0, 50, 100].map((v, i) => (<G key={i}><Line x1="35" y1={(modalChartHeight - 20) - (v / 100) * (modalChartHeight - 40)} x2={modalChartWidth} y2={(modalChartHeight - 20) - (v / 100) * (modalChartHeight - 40)} stroke={theme.border} strokeWidth="1" strokeDasharray="4,4" /><SvgText x="30" y={(modalChartHeight - 15) - (v / 100) * (modalChartHeight - 40)} fontSize={isTablet ? '12' : '10'} fill={theme.textMuted} textAnchor="end">{v}%</SvgText></G>))}
                      {[{ type: '10_tirs', color: '#F97316' }, { type: '10_tirs_sautee', color: '#3B82F6' }, { type: 'precision', color: '#F59E0B' }].map(({ type, color }) => {
                        const dataPoints = challengeProgressionData.weeklyData.map((w: any, i: number) => ({ x: 45 + (i * ((modalChartWidth - 45) / Math.max(challengeProgressionData.weeklyData.length - 1, 1))), y: (modalChartHeight - 20) - (w.byType[type].avgRate / 100) * (modalChartHeight - 40), hasData: w.byType[type].count > 0, rate: w.byType[type].avgRate }));
                        return (<G key={type}>{dataPoints.map((pt: any, i: number) => { if (i === 0 || !pt.hasData) return null; const prev = dataPoints[i - 1]; if (!prev.hasData) return null; return <Line key={`l-${i}`} x1={prev.x} y1={prev.y} x2={pt.x} y2={pt.y} stroke={color} strokeWidth="2.5" />; })}{dataPoints.map((pt: any, i: number) => { if (!pt.hasData) return null; return (<G key={`d-${i}`}><Circle cx={pt.x} cy={pt.y} r={isTablet ? 5 : 4} fill={color} /><SvgText x={pt.x} y={pt.y - 10} fontSize={isTablet ? '11' : '9'} fill={color} textAnchor="middle" fontWeight="600">{pt.rate}%</SvgText></G>); })}</G>);
                      })}
                    </Svg>
                  </View>
                  <View style={s.challengeProgLegend}>
                    {[{ nameKey: 'tenShots', color: '#F97316' }, { nameKey: 'tenShotsLob', color: '#3B82F6' }, { nameKey: 'precision', color: '#F59E0B' }].map(({ nameKey, color }) => (
                      <View key={nameKey} style={s.challengeProgLegendItem}><View style={[s.challengeProgLegendDot, { backgroundColor: color }]} /><Text style={s.challengeProgLegendText}>{t('challenge', nameKey)}</Text></View>
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Tournament Progression */}
              {tournamentProgressionData.hasData ? <View style={s.progressionSection}><View style={s.progressionSectionHeader}><View style={[s.progressionSectionIcon, { backgroundColor: theme.carreauColor + '15' }]}><MaterialIcons name="emoji-events" size={20} color={theme.carreauColor} /></View><View><Text style={[s.progressionSectionTitle, isTablet && s.progressionSectionTitleTablet]}>{t('stats', 'tournamentProgressionTitle')}</Text><Text style={[s.progressionSectionSubtitle, isTablet && s.progressionSectionSubtitleTablet]}>{tournamentProgressionData.items.length} {t('palmares', 'tournois')}</Text></View></View><View style={s.chartContainer}><Svg width={modalChartWidth} height={modalChartHeight + 30}>{[0, 50, 100].map((v, i) => (<G key={i}><Line x1="35" y1={(modalChartHeight - 20) - (v / 100) * (modalChartHeight - 40)} x2={modalChartWidth} y2={(modalChartHeight - 20) - (v / 100) * (modalChartHeight - 40)} stroke={theme.border} strokeWidth="1" strokeDasharray="4,4" /><SvgText x="30" y={(modalChartHeight - 15) - (v / 100) * (modalChartHeight - 40)} fontSize={isTablet ? '12' : '10'} fill={theme.textMuted} textAnchor="end">{v}%</SvgText></G>))}{tournamentProgressionData.items.map((it: any, i: number) => { const x = 45 + (i * ((modalChartWidth - 45) / Math.max(tournamentProgressionData.items.length - 1, 1))); const y = (modalChartHeight - 20) - (it.winRate / 100) * (modalChartHeight - 40); const p = tournamentProgressionData.items[i - 1]; const px = p ? 45 + ((i - 1) * ((modalChartWidth - 45) / Math.max(tournamentProgressionData.items.length - 1, 1))) : x; const py = p ? (modalChartHeight - 20) - (p.winRate / 100) * (modalChartHeight - 40) : y; return (<G key={i}>{i > 0 ? <Line x1={px} y1={py} x2={x} y2={y} stroke={theme.carreauColor} strokeWidth="2.5" /> : null}<Circle cx={x} cy={y} r={6} fill={it.resultColor} stroke="#FFF" strokeWidth={2} />{it.matches > 0 ? <SvgText x={x} y={y - 12} fontSize="9" fill={theme.textPrimary} textAnchor="middle" fontWeight="600">{it.winRate}%</SvgText> : null}</G>); })}</Svg></View></View> : null}

              {/* Summary Table */}
              <View style={s.progressionSection}>
                <View style={s.progressionSectionHeader}>
                  <View style={[s.progressionSectionIcon, { backgroundColor: theme.textSecondary + '15' }]}><MaterialIcons name="table-chart" size={20} color={theme.textSecondary} /></View>
                  <Text style={[s.progressionSectionTitle, isTablet && s.progressionSectionTitleTablet]}>{t('stats', 'summaryLabel')}</Text>
                </View>
                <View style={s.summaryTable}>
                  <View style={s.summaryHeader}>
                    <Text style={[s.summaryCell, s.summaryCellHeader, { flex: 1.2 }]}>{progressionData.useMonthly ? t('statsExtra', 'monthLabel') : t('stats', 'weekShort')}</Text>
                    <Text style={[s.summaryCell, s.summaryCellHeader, { flex: 1 }]}>{t('stats', 'gamesShort')}</Text>
                    <Text style={[s.summaryCell, s.summaryCellHeader, { flex: 1 }]}>{t('stats', 'winsShort')}</Text>
                    <Text style={[s.summaryCell, s.summaryCellHeader, { flex: 1 }]}>{t('stats', 'shotShort')}</Text>
                    <Text style={[s.summaryCell, s.summaryCellHeader, { flex: 1 }]}>{t('stats', 'pointShort')}</Text>
                  </View>
                  {progressionData.weeklyData.filter((d: any) => d.matches > 0).slice(-12).map((data: any, i: number) => (
                    <View key={i} style={[s.summaryRow, i % 2 === 0 && s.summaryRowAlt]}>
                      <Text style={[s.summaryCell, { flex: 1.2 }]}>{data.week}</Text>
                      <Text style={[s.summaryCell, { flex: 1 }]}>{data.matches}</Text>
                      <Text style={[s.summaryCell, { flex: 1, color: theme.primary, fontWeight: '600' }]}>{data.winRate}%</Text>
                      <Text style={[s.summaryCell, { flex: 1, color: theme.tirColor, fontWeight: '600' }]}>{data.tirRate}%</Text>
                      <Text style={[s.summaryCell, { flex: 1, color: theme.pointColor, fontWeight: '600' }]}>{data.pointRate}%</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : (
            <View style={s.noProgressionData}>
              <MaterialIcons name="show-chart" size={64} color={theme.textMuted} />
              <Text style={s.noProgressionTitle}>{t('stats', 'notEnoughDataLabel')}</Text>
              <Text style={s.noProgressionText}>{t('stats', 'playMoreMatchesLabel')}</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ============================================================
// Reusable Line Chart Sub-component
// ============================================================
function EvolutionChart({ title, subtitle, icon, color, chartKey, dataField, countField, tooltipLabel, tooltipDetailFn, data, isTablet, modalChartWidth, modalChartHeight, chartTooltip, setChartTooltip }: {
  title: string; subtitle: string; icon: string; color: string; chartKey: string; dataField: string; countField: string;
  tooltipLabel: string; tooltipDetailFn: (d: any) => string; data: any[]; isTablet: boolean;
  modalChartWidth: number; modalChartHeight: number;
  chartTooltip: { chart: string; index: number } | null; setChartTooltip: (t: { chart: string; index: number } | null) => void;
}) {
  return (
    <View style={[s.progressionSection, isTablet && s.modalTabletHalf]}>
      <View style={s.progressionSectionHeader}>
        <View style={[s.progressionSectionIcon, { backgroundColor: color + '15' }]}><MaterialIcons name={icon as any} size={20} color={color} /></View>
        <View>
          <Text style={[s.progressionSectionTitle, isTablet && s.progressionSectionTitleTablet]}>{title}</Text>
          <Text style={[s.progressionSectionSubtitle, isTablet && s.progressionSectionSubtitleTablet]}>{subtitle}</Text>
        </View>
      </View>
      <View style={s.chartContainer}>
        <Svg width={modalChartWidth} height={modalChartHeight}>
          {[0, 50, 100].map((v, i) => (<G key={i}><Line x1="35" y1={(modalChartHeight - 20) - (v / 100) * (modalChartHeight - 40)} x2={modalChartWidth} y2={(modalChartHeight - 20) - (v / 100) * (modalChartHeight - 40)} stroke={theme.border} strokeWidth="1" strokeDasharray="4,4" /><SvgText x="30" y={(modalChartHeight - 15) - (v / 100) * (modalChartHeight - 40)} fontSize={isTablet ? '12' : '10'} fill={theme.textMuted} textAnchor="end">{v}%</SvgText></G>))}
          {data.map((d: any, i: number) => {
            const x = 45 + (i * ((modalChartWidth - 45) / Math.max(data.length - 1, 1)));
            const y = (modalChartHeight - 20) - (d[dataField] / 100) * (modalChartHeight - 40);
            const prev = data[i - 1];
            const prevX = prev ? 45 + ((i - 1) * ((modalChartWidth - 45) / Math.max(data.length - 1, 1))) : x;
            const prevY = prev ? (modalChartHeight - 20) - (prev[dataField] / 100) * (modalChartHeight - 40) : y;
            return (
              <G key={i}>
                {i > 0 ? <Line x1={prevX} y1={prevY} x2={x} y2={y} stroke={color} strokeWidth="2.5" /> : null}
                <Circle cx={x} cy={y} r={20} fill="transparent" onPress={() => { Haptics.selectionAsync(); setChartTooltip(chartTooltip?.chart === chartKey && chartTooltip?.index === i ? null : { chart: chartKey, index: i }); }} />
                <Circle cx={x} cy={y} r={isTablet ? 6 : 5} fill={chartTooltip?.chart === chartKey && chartTooltip?.index === i ? '#FFF' : color} stroke={chartTooltip?.chart === chartKey && chartTooltip?.index === i ? color : 'none'} strokeWidth={2} />
                {d[countField] > 0 && !(chartTooltip?.chart === chartKey && chartTooltip?.index === i) ? <SvgText x={x} y={y - 10} fontSize={isTablet ? '11' : '9'} fill={theme.textPrimary} textAnchor="middle" fontWeight="600">{d[dataField]}%</SvgText> : null}
              </G>
            );
          })}
        </Svg>
        {chartTooltip?.chart === chartKey && chartTooltip.index < data.length ? (() => {
          const d = data[chartTooltip.index];
          const tx = 45 + (chartTooltip.index * ((modalChartWidth - 45) / Math.max(data.length - 1, 1)));
          const ty = (modalChartHeight - 20) - (d[dataField] / 100) * (modalChartHeight - 40);
          return (
            <Pressable style={[s.chartTooltip, { left: Math.max(4, Math.min(tx - 68, modalChartWidth - 140)), top: Math.max(0, ty - 68) }]} onPress={() => setChartTooltip(null)}>
              <Text style={s.chartTooltipTitle}>{d.week}</Text>
              <Text style={s.chartTooltipRow}>{tooltipDetailFn(d)}</Text>
              <Text style={[s.chartTooltipValue, { color }]}>{d[dataField]}%</Text>
            </Pressable>
          );
        })() : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalContent: { flex: 1 },
  modalScrollContent: { padding: 16, paddingBottom: 32 },
  modalScrollContentTablet: { maxWidth: 960, alignSelf: 'center', width: '100%', paddingHorizontal: 24 },
  modalTabletRow: { flexDirection: 'row', gap: 16, marginBottom: 0 },
  modalTabletHalf: { flex: 1 },
  progressionModalHeader: { backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border, paddingBottom: 14 },
  progressionModalHeaderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14 },
  progressionModalTitle: { fontSize: 22, fontWeight: '800', color: theme.textPrimary },
  progressionModalSubtitle: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
  progressionModalCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  progressionFilterScroll: { paddingHorizontal: 16, gap: 8 },
  progressionFilterPill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.borderRadius.full, backgroundColor: theme.backgroundSecondary, borderWidth: 1.5, borderColor: theme.border },
  progressionFilterPillActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  progressionFilterText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  progressionFilterTextActive: { color: '#FFF' },
  trendCardsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  trendCardsRowTablet: { gap: 16, marginBottom: 24 },
  trendCard: { flex: 1, backgroundColor: '#FFF', borderRadius: 16, padding: 14, borderLeftWidth: 4, ...theme.shadows.card, borderWidth: 1, borderTopColor: '#F1F5F9', borderRightColor: '#F1F5F9', borderBottomColor: '#F1F5F9' },
  trendCardTablet: { padding: 18, borderLeftWidth: 4 },
  trendCardValueTablet: { fontSize: 28 },
  trendCardLabelTablet: { fontSize: 13 },
  trendCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  trendCardValue: { fontSize: 22, fontWeight: '700', color: theme.textPrimary },
  trendCardLabel: { fontSize: 11, color: theme.textMuted, marginTop: 2 },
  progressionSection: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 16, ...theme.shadows.card },
  progressionSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  progressionSectionIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  progressionSectionTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  progressionSectionTitleTablet: { fontSize: 17 },
  progressionSectionSubtitle: { fontSize: 11, color: theme.textMuted },
  progressionSectionSubtitleTablet: { fontSize: 13 },
  chartContainer: { alignItems: 'center', marginBottom: 8, position: 'relative' as const },
  chartTooltip: { position: 'absolute' as const, backgroundColor: theme.surface, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, minWidth: 136, zIndex: 100, ...theme.shadows.cardElevated, borderWidth: 1, borderColor: theme.border },
  chartTooltipTitle: { fontSize: 12, fontWeight: '700', color: theme.textPrimary, marginBottom: 3 },
  chartTooltipRow: { fontSize: 11, color: theme.textSecondary, marginBottom: 2 },
  chartTooltipValue: { fontSize: 16, fontWeight: '800' },
  summaryTable: { borderRadius: theme.borderRadius.md, overflow: 'hidden', borderWidth: 1, borderColor: theme.border },
  summaryHeader: { flexDirection: 'row', backgroundColor: theme.backgroundSecondary, paddingVertical: 10 },
  summaryRow: { flexDirection: 'row', paddingVertical: 10, borderTopWidth: 1, borderTopColor: theme.border },
  summaryRowAlt: { backgroundColor: theme.backgroundSecondary + '50' },
  summaryCell: { fontSize: 12, color: theme.textPrimary, textAlign: 'center', fontWeight: '500' },
  summaryCellHeader: { fontWeight: '700', color: theme.textSecondary, fontSize: 11 },
  noProgressionData: { alignItems: 'center', paddingVertical: 48 },
  noProgressionTitle: { fontSize: 18, fontWeight: '600', color: theme.textPrimary, marginTop: 16 },
  noProgressionText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8, maxWidth: 260 },
  challengeProgLegend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 16, marginTop: 4 },
  challengeProgLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  challengeProgLegendDot: { width: 10, height: 10, borderRadius: 5 },
  challengeProgLegendText: { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },
});
