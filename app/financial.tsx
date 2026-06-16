import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import Svg, { Rect, G, Text as SvgText, Line } from 'react-native-svg';
import theme from '@/constants/theme';
import { useAppData } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { useFinancialSummary } from '@/hooks/useFinancialSummary';

export default function FinancialScreen() {
  const insets = useSafeAreaInsets();
  const { tournaments } = useAppData();
  const financialData = useFinancialSummary();
  const { t, language } = useLanguage();

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  // Monthly breakdown for chart
  const monthlyData = useMemo(() => {
    const months: Record<string, { gains: number; costs: number; label: string }> = {};
    const finishedTournaments = tournaments.filter(t => t.status === 'Terminé' && (t.registrationCost || t.prizeWon));
    
    finishedTournaments.forEach(t => {
      const date = new Date(t.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short', year: '2-digit' });
      if (!months[key]) months[key] = { gains: 0, costs: 0, label };
      months[key].gains += t.prizeWon || 0;
      months[key].costs += t.registrationCost || 0;
    });

    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => data);
  }, [tournaments, language]);

  const balanceIsPositive = financialData.balance >= 0;
  const balanceColor = balanceIsPositive ? theme.success : theme.error;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('financial', 'title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }, isTablet && styles.scrollContentTablet]}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance Hero */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.heroCard}>
          <View style={[styles.heroIconContainer, { backgroundColor: balanceColor + '15' }]}>
            <MaterialIcons name="account-balance-wallet" size={32} color={balanceColor} />
          </View>
          <Text style={styles.heroLabel}>{t('financial', 'netBalance')}</Text>
          <Text style={[styles.heroValue, { color: balanceColor }]}>
            {balanceIsPositive ? '+' : ''}{financialData.balance.toFixed(0)} €
          </Text>

          {/* Summary bar */}
          <View style={styles.heroSummaryRow}>
            <View style={styles.heroSummaryItem}>
              <MaterialIcons name="arrow-upward" size={16} color={theme.success} />
              <Text style={styles.heroSummaryLabel}>{t('financial', 'gains')}</Text>
              <Text style={[styles.heroSummaryValue, { color: theme.success }]}>+{financialData.totalPrizesWon.toFixed(0)} €</Text>
            </View>
            <View style={styles.heroSummaryDivider} />
            <View style={styles.heroSummaryItem}>
              <MaterialIcons name="arrow-downward" size={16} color={theme.error} />
              <Text style={styles.heroSummaryLabel}>{t('financial', 'expenses')}</Text>
              <Text style={[styles.heroSummaryValue, { color: theme.error }]}>-{financialData.totalCosts.toFixed(0)} €</Text>
            </View>
          </View>

          {/* Visual balance bar */}
          {(financialData.totalPrizesWon > 0 || financialData.totalCosts > 0) && (
            <View style={styles.balanceBarContainer}>
              <View style={styles.balanceBarTrack}>
                {financialData.totalPrizesWon > 0 && (
                  <View style={[styles.balanceBarGain, {
                    flex: financialData.totalPrizesWon / Math.max(financialData.totalPrizesWon + financialData.totalCosts, 1),
                  }]} />
                )}
                {financialData.totalCosts > 0 && (
                  <View style={[styles.balanceBarCost, {
                    flex: financialData.totalCosts / Math.max(financialData.totalPrizesWon + financialData.totalCosts, 1),
                  }]} />
                )}
              </View>
              <View style={styles.balanceBarLabels}>
                <Text style={[styles.balanceBarLabelText, { color: theme.success }]}>
                  {Math.round((financialData.totalPrizesWon / Math.max(financialData.totalPrizesWon + financialData.totalCosts, 1)) * 100)}% {t('financial', 'gainsPercent')}
                </Text>
                <Text style={[styles.balanceBarLabelText, { color: theme.error }]}>
                  {Math.round((financialData.totalCosts / Math.max(financialData.totalPrizesWon + financialData.totalCosts, 1)) * 100)}% {t('financial', 'expensesPercent')}
                </Text>
              </View>
            </View>
          )}
        </Animated.View>

        {/* Monthly Chart */}
        {monthlyData.length >= 2 && (
          <Animated.View entering={FadeInDown.duration(400).delay(50)} style={styles.chartCard}>
            <View style={styles.chartHeader}>
              <MaterialIcons name="bar-chart" size={18} color={theme.primary} />
              <Text style={styles.chartTitle}>{t('financial', 'monthlyEvolution')}</Text>
            </View>
            <View style={styles.chartContainer}>
              <Svg width={Math.max(monthlyData.length * 60, 280)} height={160}>
                {monthlyData.map((data, i) => {
                  const barWidth = 22;
                  const gap = 6;
                  const groupWidth = barWidth * 2 + gap;
                  const x = 20 + i * (groupWidth + 16);
                  const maxVal = Math.max(...monthlyData.map(d => Math.max(d.gains, d.costs)), 1);
                  const gainHeight = (data.gains / maxVal) * 90;
                  const costHeight = (data.costs / maxVal) * 90;

                  return (
                    <G key={i}>
                      <Rect x={x} y={110 - gainHeight} width={barWidth} height={Math.max(gainHeight, 2)} fill={theme.success} rx={4} opacity={0.85} />
                      <Rect x={x + barWidth + gap} y={110 - costHeight} width={barWidth} height={Math.max(costHeight, 2)} fill={theme.error} rx={4} opacity={0.85} />
                      {data.gains > 0 && (
                        <SvgText x={x + barWidth / 2} y={106 - gainHeight} fontSize="9" fill={theme.success} textAnchor="middle" fontWeight="600">+{data.gains}</SvgText>
                      )}
                      {data.costs > 0 && (
                        <SvgText x={x + barWidth + gap + barWidth / 2} y={106 - costHeight} fontSize="9" fill={theme.error} textAnchor="middle" fontWeight="600">-{data.costs}</SvgText>
                      )}
                      <SvgText x={x + groupWidth / 2} y={130} fontSize="9" fill={theme.textSecondary} textAnchor="middle">{data.label}</SvgText>
                    </G>
                  );
                })}
                <Line x1="15" y1="110" x2={20 + monthlyData.length * (22 * 2 + 6 + 16)} y2="110" stroke={theme.border} strokeWidth="1" />
              </Svg>
            </View>
            <View style={styles.chartLegend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.success }]} />
                <Text style={styles.legendText}>{t('financial', 'gains')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: theme.error }]} />
                <Text style={styles.legendText}>{t('financial', 'expenses')}</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Revenue Section */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.success + '15' }]}>
              <MaterialIcons name="emoji-events" size={20} color={theme.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{t('financial', 'tournamentWinnings')}</Text>
              <Text style={styles.sectionSubtitle}>{financialData.tournamentsWithPrize.length} {t('financial', 'tournamentWithWinnings')}</Text>
            </View>
            <Text style={[styles.sectionTotal, { color: theme.success }]}>+{financialData.totalPrizesWon.toFixed(0)} €</Text>
          </View>

          {financialData.tournamentsWithPrize.length > 0 ? (
            <View style={styles.detailList}>
              {financialData.tournamentsWithPrize
                .sort((a, b) => (b.prizeWon || 0) - (a.prizeWon || 0))
                .map(t => (
                <Pressable key={t.id} style={styles.detailRow} onPress={() => { Haptics.selectionAsync(); router.push(`/tournament/${t.id}`); }}>
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailName} numberOfLines={1}>{t.name}</Text>
                    <View style={styles.detailMeta}>
                      <Text style={styles.detailDate}>
                        {new Date(t.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                      {t.finalResult && (
                        <>
                          <View style={styles.detailDot} />
                          <Text style={styles.detailResult}>{t.finalResult}</Text>
                        </>
                      )}
                    </View>
                  </View>
                  <Text style={[styles.detailAmount, { color: theme.success }]}>+{t.prizeWon} €</Text>
                  <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <MaterialIcons name="info-outline" size={20} color={theme.textMuted} />
              <Text style={styles.emptySectionText}>{t('financial', 'noWinnings')}</Text>
            </View>
          )}
        </Animated.View>

        {/* Expenses Section */}
        <Animated.View entering={FadeInDown.duration(400).delay(150)} style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionIcon, { backgroundColor: theme.error + '15' }]}>
              <MaterialIcons name="payments" size={20} color={theme.error} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{t('financial', 'tournamentRegistrations')}</Text>
              <Text style={styles.sectionSubtitle}>{financialData.tournamentsWithCost.length} {t('financial', 'registrations')}</Text>
            </View>
            <Text style={[styles.sectionTotal, { color: theme.error }]}>-{financialData.totalRegistrationCosts.toFixed(0)} €</Text>
          </View>

          {financialData.tournamentsWithCost.length > 0 ? (
            <View style={styles.detailList}>
              {financialData.tournamentsWithCost
                .sort((a, b) => (b.registrationCost || 0) - (a.registrationCost || 0))
                .map(t => (
                <Pressable key={t.id} style={styles.detailRow} onPress={() => { Haptics.selectionAsync(); router.push(`/tournament/${t.id}`); }}>
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailName} numberOfLines={1}>{t.name}</Text>
                    <Text style={styles.detailDate}>
                      {new Date(t.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                  <Text style={[styles.detailAmount, { color: theme.error }]}>-{t.registrationCost} €</Text>
                  <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.emptySection}>
              <MaterialIcons name="info-outline" size={20} color={theme.textMuted} />
              <Text style={styles.emptySectionText}>{t('financial', 'noRegistrations')}</Text>
            </View>
          )}
        </Animated.View>

        {/* Equipment Costs */}
        {financialData.setsWithPrice.length > 0 && (
          <Animated.View entering={FadeInDown.duration(400).delay(175)} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: '#D97706' + '15' }]}>
                <MaterialIcons name="sports-baseball" size={20} color={'#D97706'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>{t('financial', 'equipmentBoules')}</Text>
                <Text style={styles.sectionSubtitle}>{financialData.setsWithPrice.length} set(s)</Text>
              </View>
              <Text style={[styles.sectionTotal, { color: theme.error }]}>-{financialData.totalEquipmentCost.toFixed(0)} €</Text>
            </View>
            <View style={styles.detailList}>
              {financialData.setsWithPrice.map(bs => (
                <Pressable key={bs.id} style={styles.detailRow} onPress={() => { Haptics.selectionAsync(); router.push('/equipment'); }}>
                  <View style={styles.detailInfo}>
                    <Text style={styles.detailName} numberOfLines={1}>{bs.name}</Text>
                    <Text style={styles.detailDate}>
                      {[bs.brand, bs.diameter ? `${bs.diameter}mm` : '', bs.weight ? `${bs.weight}g` : ''].filter(Boolean).join(' • ')}
                    </Text>
                  </View>
                  <Text style={[styles.detailAmount, { color: theme.error }]}>-{bs.purchasePrice} €</Text>
                  <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
                </Pressable>
              ))}
            </View>
          </Animated.View>
        )}

        {/* Club Membership */}
        {financialData.membershipCost > 0 && (
          <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionIcon, { backgroundColor: theme.accent + '15' }]}>
                <MaterialIcons name="card-membership" size={20} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sectionTitle}>{t('financial', 'clubMembership')}</Text>
                <Text style={styles.sectionSubtitle}>{financialData.clubName}</Text>
              </View>
              <Text style={[styles.sectionTotal, { color: theme.error }]}>-{financialData.membershipCost.toFixed(0)} €</Text>
            </View>
          </Animated.View>
        )}

        {/* Total Summary */}
        <Animated.View entering={FadeInDown.duration(400).delay(250)} style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('financial', 'summary')}</Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryRowLeft}>
              <MaterialIcons name="arrow-upward" size={16} color={theme.success} />
              <Text style={styles.summaryRowLabel}>{t('financial', 'totalWinnings')}</Text>
            </View>
            <Text style={[styles.summaryRowValue, { color: theme.success }]}>+{financialData.totalPrizesWon.toFixed(0)} €</Text>
          </View>

          <View style={styles.summaryRow}>
            <View style={styles.summaryRowLeft}>
              <MaterialIcons name="arrow-downward" size={16} color={theme.error} />
              <Text style={styles.summaryRowLabel}>{t('financial', 'totalExpenses')}</Text>
            </View>
            <Text style={[styles.summaryRowValue, { color: theme.error }]}>-{financialData.totalCosts.toFixed(0)} €</Text>
          </View>

          {financialData.totalEquipmentCost > 0 && (
            <View style={[styles.summaryRow, { paddingLeft: 24 }]}>
              <View style={styles.summaryRowLeft}>
                <MaterialIcons name="sports-baseball" size={14} color={'#D97706'} />
                <Text style={[styles.summaryRowLabel, { fontSize: 13 }]}>{t('financial', 'inclEquipment')}</Text>
              </View>
              <Text style={[styles.summaryRowValue, { color: '#D97706', fontSize: 14 }]}>-{financialData.totalEquipmentCost.toFixed(0)} €</Text>
            </View>
          )}

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <View style={styles.summaryRowLeft}>
              <MaterialIcons name="account-balance-wallet" size={18} color={balanceColor} />
              <Text style={[styles.summaryRowLabel, { fontWeight: '700', color: theme.textPrimary, fontSize: 16 }]}>{t('financial', 'netBalance')}</Text>
            </View>
            <Text style={[styles.summaryRowValue, { color: balanceColor, fontSize: 22, fontWeight: '800' }]}>
              {balanceIsPositive ? '+' : ''}{financialData.balance.toFixed(0)} €
            </Text>
          </View>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  scrollContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%', paddingHorizontal: 24 },

  // Hero
  heroCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl,
    padding: 24, alignItems: 'center', marginBottom: 16, ...theme.shadows.card,
  },
  heroIconContainer: {
    width: 64, height: 64, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  heroLabel: { fontSize: 13, color: theme.textSecondary, fontWeight: '500', marginBottom: 4 },
  heroValue: { fontSize: 38, fontWeight: '800', marginBottom: 20 },

  heroSummaryRow: {
    flexDirection: 'row', alignItems: 'center', width: '100%',
    backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.lg,
    paddingVertical: 14, paddingHorizontal: 16,
  },
  heroSummaryItem: { flex: 1, alignItems: 'center', gap: 4 },
  heroSummaryLabel: { fontSize: 12, color: theme.textSecondary },
  heroSummaryValue: { fontSize: 18, fontWeight: '700' },
  heroSummaryDivider: { width: 1, height: 32, backgroundColor: theme.border },

  balanceBarContainer: { width: '100%', marginTop: 16 },
  balanceBarTrack: {
    flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden',
    backgroundColor: theme.backgroundSecondary,
  },
  balanceBarGain: { backgroundColor: theme.success, borderRadius: 5 },
  balanceBarCost: { backgroundColor: theme.error, borderRadius: 5 },
  balanceBarLabels: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 6,
  },
  balanceBarLabelText: { fontSize: 11, fontWeight: '600' },

  // Chart
  chartCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg,
    padding: 16, marginBottom: 16, ...theme.shadows.card,
  },
  chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  chartTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  chartContainer: { alignItems: 'center', marginBottom: 8 },
  chartLegend: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },

  // Section Cards
  sectionCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg,
    padding: 16, marginBottom: 12, ...theme.shadows.card,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  sectionIcon: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  sectionSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  sectionTotal: { fontSize: 17, fontWeight: '700' },

  detailList: { marginTop: 14, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 },
  detailRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: theme.borderLight,
  },
  detailInfo: { flex: 1 },
  detailName: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, marginBottom: 3 },
  detailMeta: { flexDirection: 'row', alignItems: 'center' },
  detailDate: { fontSize: 12, color: theme.textSecondary },
  detailDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: theme.textMuted, marginHorizontal: 6 },
  detailResult: { fontSize: 12, color: theme.carreauColor, fontWeight: '600' },
  detailAmount: { fontSize: 15, fontWeight: '700', marginRight: 8 },

  emptySection: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border,
  },
  emptySectionText: { fontSize: 13, color: theme.textMuted },

  // Summary
  summaryCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg,
    padding: 18, marginTop: 4, marginBottom: 8, ...theme.shadows.cardElevated,
    borderWidth: 1, borderColor: theme.primary + '20',
  },
  summaryTitle: {
    fontSize: 12, fontWeight: '600', color: theme.textSecondary,
    letterSpacing: 1, marginBottom: 14,
  },
  summaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 6,
  },
  summaryRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryRowLabel: { fontSize: 14, fontWeight: '600', color: theme.textSecondary },
  summaryRowValue: { fontSize: 16, fontWeight: '700' },
  summaryDivider: { height: 1, backgroundColor: theme.border, marginVertical: 10 },
});
