
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Platform, Dimensions, ActivityIndicator, TextInput, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert, getSupabaseClient } from '@/template';
import { fetchAmbassadors, Ambassador } from '@/services/ambassadorService';
import {
  fetchAmbassadorAnalytics,
  AmbassadorAnalytics,
  fetchDetailedBannerAnalytics,
  BannerDetailedAnalytics,
} from '@/services/ambassadorAnalyticsService';
import { fetchPushQuota, PushQuotaInfo, getDaysUntilReset } from '@/services/pushQuotaService';

type Period = 'today' | '7d' | '30d' | 'all';

const PERIODS: { key: Period; fr: string; en: string }[] = [
  { key: 'today', fr: "Aujourd'hui", en: 'Today' },
  { key: '7d', fr: '7 jours', en: '7 days' },
  { key: '30d', fr: '30 jours', en: '30 days' },
  { key: 'all', fr: 'Tout', en: 'All time' },
];

interface SponsorData {
  ambassador: Ambassador;
  analytics: AmbassadorAnalytics;
  detailed?: BannerDetailedAnalytics;
}

export default function SponsorAnalyticsScreen() {
  const { language } = useLanguage();
  const { showAlert } = useAlert();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<Period>('30d');
  const [sponsors, setSponsors] = useState<SponsorData[]>([]);
  const [selectedSponsor, setSelectedSponsor] = useState<string | null>(null);
  const [detailedLoading, setDetailedLoading] = useState(false);

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);

  // Determine if current user is a sponsor/partner and their tier
  const [userTier, setUserTier] = useState<string | null>(null);
  const [userAmbassadorId, setUserAmbassadorId] = useState<string | null>(null);

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user?.id) return;
        const { data } = await supabase.from('ambassadors').select('id, badge_type').eq('user_id', userData.user.id).eq('is_active', true).maybeSingle();
        if (data) {
          setUserTier(data.badge_type);
          setUserAmbassadorId(data.id);
        }
      } catch { /* silent */ }
    };
    checkAccess();
  }, []);

  const isSilverAccess = userTier === 'sponsor';
  const isBronzeAccess = userTier === 'partner';
  const isGoldOrAdmin = userTier === 'gold_sponsor' || (!userTier && !isSilverAccess && !isBronzeAccess);

  const loadData = useCallback(async (p: Period) => {
    setLoading(true);
    try {
      const [{ ambassadors }, { stats }] = await Promise.all([
        fetchAmbassadors(),
        fetchAmbassadorAnalytics(p),
      ]);

      const sponsorAmbs = ambassadors.filter(a =>
        a.badgeType === 'gold_sponsor' || a.badgeType === 'sponsor' || a.badgeType === 'partner'
      );

      const data: SponsorData[] = sponsorAmbs.map(amb => ({
        ambassador: amb,
        analytics: stats.get(amb.id) || { profileViews: 0, socialClicks: 0, bannerImpressions: 0, socialBreakdown: {} },
      }));

      // Sort by total impressions desc
      data.sort((a, b) => (b.analytics.bannerImpressions + b.analytics.profileViews) - (a.analytics.bannerImpressions + a.analytics.profileViews));

      setSponsors(data);
      if (data.length > 0 && !selectedSponsor) {
        setSelectedSponsor(data[0].ambassador.id);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [selectedSponsor]);

  useEffect(() => { loadData(period); }, [period, loadData]); // Added loadData to dependencies

  // Load detailed analytics for selected sponsor
  useEffect(() => {
    if (!selectedSponsor) return;
    setDetailedLoading(true);
    const days = period === 'today' ? 1 : period === '7d' ? 7 : 30;
    fetchDetailedBannerAnalytics(selectedSponsor, days).then(({ data }) => {
      setSponsors(prev => prev.map(s => s.ambassador.id === selectedSponsor ? { ...s, detailed: data } : s));
      setDetailedLoading(false);
    }).catch(() => setDetailedLoading(false));
  }, [selectedSponsor, period]);

  const selectedData = useMemo(() => sponsors.find(s => s.ambassador.id === selectedSponsor), [sponsors, selectedSponsor]);

  // Totals
  const totals = useMemo(() => {
    let impressions = 0, clicks = 0;
    // unique is computed from selectedData.detailed, not across all sponsors
    sponsors.forEach(s => {
      impressions += s.analytics.bannerImpressions;
      clicks += s.analytics.profileViews + s.analytics.socialClicks;
    });
    const unique = selectedData?.detailed?.uniqueViewers || 0; // Moved unique calculation here
    const ctr = impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : 0;
    return { impressions, clicks, ctr, unique };
  }, [sponsors, selectedData]); // Added selectedData to dependencies for unique

  // Sparkline renderer
  const renderSparkline = (data: number[], color: string, maxH: number = 40) => {
    const max = Math.max(...data, 1);
    const barW = Math.max(2, Math.min(8, (screenWidth - 120) / data.length - 1));
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 1, height: maxH }}>
        {data.map((val, i) => (
          <View key={i} style={{ width: barW, height: Math.max(2, (val / max) * maxH), backgroundColor: color, borderRadius: 1 }} />
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{language === 'fr' ? 'Analytics Sponsors' : 'Sponsor Analytics'}</Text>
          <Text style={styles.headerSub}>{language === 'fr' ? 'Performances et visibilite' : 'Performance & visibility'}</Text>
        </View>
        <Pressable style={styles.headerIcon} onPress={() => loadData(period)}>
          <MaterialIcons name="refresh" size={22} color="rgba(255,255,255,0.7)" />
        </Pressable>
      </View>

      {/* Period Pills */}
      <View style={styles.periodRow}>
        {PERIODS.map(p => (
          <Pressable key={p.key} style={[styles.periodPill, period === p.key && styles.periodPillActive]} onPress={() => setPeriod(p.key)}>
            <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>{p[language]}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={theme.primary} /></View>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {/* Summary Cards */}
          <Animated.View entering={FadeIn.duration(300)} style={styles.summaryRow}>
            {[
              { value: totals.impressions.toLocaleString(), label: 'Impressions', icon: 'visibility' as const, color: '#2563EB' },
              { value: totals.clicks.toLocaleString(), label: language === 'fr' ? 'Clics' : 'Clicks', icon: 'touch-app' as const, color: '#10B981' },
              { value: `${totals.ctr}%`, label: 'CTR', icon: 'trending-up' as const, color: '#F59E0B' },
            ].map((card, i) => (
              <View key={i} style={styles.summaryCard}>
                <View style={[styles.summaryIconBg, { backgroundColor: card.color + '15' }]}>
                  <MaterialIcons name={card.icon} size={18} color={card.color} />
                </View>
                <Text style={[styles.summaryValue, { color: card.color }]}>{card.value}</Text>
                <Text style={styles.summaryLabel}>{card.label}</Text>
              </View>
            ))}
          </Animated.View>

          {/* Sponsor Selector */}
          {sponsors.length > 1 ? (
            <View style={styles.selectorRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                {sponsors.map(s => {
                  const isSelected = s.ambassador.id === selectedSponsor;
                  const tierColor = s.ambassador.badgeType === 'gold_sponsor' ? '#F59E0B' : s.ambassador.badgeType === 'sponsor' ? '#94A3B8' : '#D97706';
                  return (
                    <Pressable key={s.ambassador.id} style={[styles.selectorChip, isSelected && { borderColor: tierColor, backgroundColor: tierColor + '12' }]} onPress={() => setSelectedSponsor(s.ambassador.id)}>
                      <Text style={[styles.selectorText, isSelected && { color: tierColor, fontWeight: '700' }]} numberOfLines={1}>{s.ambassador.displayName}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

          {/* Selected Sponsor Detail */}
          {selectedData ? (
            <Animated.View entering={FadeInDown.duration(300)}>
              {/* Impressions & Clicks */}
              <View style={styles.detailCard}>
                <View style={styles.detailHeader}>
                  <Text style={styles.detailTitle}>{selectedData.ambassador.displayName}</Text>
                  <View style={[styles.tierBadge, { backgroundColor: selectedData.ambassador.badgeType === 'gold_sponsor' ? '#F59E0B' : selectedData.ambassador.badgeType === 'sponsor' ? '#94A3B8' : '#D97706' }]}>
                    <Text style={styles.tierBadgeText}>
                      {selectedData.ambassador.badgeType === 'gold_sponsor' ? 'OR' : selectedData.ambassador.badgeType === 'sponsor' ? 'ARGENT' : 'BRONZE'}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailStatsRow}>
                  <View style={styles.detailStat}>
                    <Text style={styles.detailStatValue}>{selectedData.analytics.bannerImpressions.toLocaleString()}</Text>
                    <Text style={styles.detailStatLabel}>Impressions</Text>
                  </View>
                  <View style={styles.detailStatDivider} />
                  <View style={styles.detailStat}>
                    <Text style={styles.detailStatValue}>{selectedData.analytics.profileViews}</Text>
                    <Text style={styles.detailStatLabel}>{language === 'fr' ? 'Profil' : 'Profile'}</Text>
                  </View>
                  <View style={styles.detailStatDivider} />
                  <View style={styles.detailStat}>
                    <Text style={styles.detailStatValue}>{selectedData.analytics.socialClicks}</Text>
                    <Text style={styles.detailStatLabel}>{language === 'fr' ? 'Reseaux' : 'Social'}</Text>
                  </View>
                  <View style={styles.detailStatDivider} />
                  <View style={styles.detailStat}>
                    <Text style={[styles.detailStatValue, { color: theme.success }]}>
                      {selectedData.detailed?.clickThroughRate || 0}%
                    </Text>
                    <Text style={styles.detailStatLabel}>CTR</Text>
                  </View>
                </View>
              </View>

              {/* Sparkline Chart */}
              {selectedData.detailed && selectedData.detailed.dailyImpressions.length > 0 ? (
                <View style={styles.chartCard}>
                  <Text style={styles.chartTitle}>{language === 'fr' ? 'Impressions quotidiennes' : 'Daily impressions'}</Text>
                  {detailedLoading ? (
                    <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 20 }} />
                  ) : (
                    <View style={styles.sparklineWrap}>
                      {renderSparkline(selectedData.detailed.dailyImpressions, '#2563EB', 50)}
                      <View style={styles.sparklineLegend}>
                        <Text style={styles.sparklineLegendText}>
                          {selectedData.detailed.dailyDates[0]?.slice(5)}
                        </Text>
                        <Text style={styles.sparklineLegendText}>
                          {selectedData.detailed.dailyDates[selectedData.detailed.dailyDates.length - 1]?.slice(5)}
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Clicks sparkline */}
                  {selectedData.detailed.dailyClicks.some(v => v > 0) ? (
                    <>
                      <Text style={[styles.chartTitle, { marginTop: 16 }]}>{language === 'fr' ? 'Clics quotidiens' : 'Daily clicks'}</Text>
                      <View style={styles.sparklineWrap}>
                        {renderSparkline(selectedData.detailed.dailyClicks, '#10B981', 35)}
                      </View>
                    </>
                  ) : null}
                </View>
              ) : null}

              {/* Page Breakdown */}
              {selectedData.detailed && Object.keys(selectedData.detailed.impressionsByPage).length > 0 ? (
                <View style={styles.breakdownCard}>
                  <Text style={styles.chartTitle}>{language === 'fr' ? 'Impressions par page' : 'Impressions by page'}</Text>
                  {Object.entries(selectedData.detailed.impressionsByPage)
                    .sort(([, a], [, b]) => b - a)
                    .map(([page, count]) => {
                      const clicks = selectedData.detailed?.clicksByPage[page] || 0;
                      const pct = selectedData.detailed ? Math.round((count / Math.max(selectedData.detailed.totalImpressions, 1)) * 100) : 0;
                      return (
                        <View key={page} style={styles.breakdownRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.breakdownPage}>{page}</Text>
                            <View style={styles.breakdownBar}>
                              <View style={[styles.breakdownBarFill, { width: `${pct}%` }]} />
                            </View>
                          </View>
                          <View style={styles.breakdownValues}>
                            <Text style={styles.breakdownCount}>{count}</Text>
                            <Text style={styles.breakdownClicks}>{clicks} {language === 'fr' ? 'clics' : 'clicks'}</Text>
                          </View>
                        </View>
                      );
                    })}
                </View>
              ) : null}

              {/* Social Breakdown */}
              {Object.keys(selectedData.analytics.socialBreakdown).length > 0 ? (
                <View style={styles.breakdownCard}>
                  <Text style={styles.chartTitle}>{language === 'fr' ? 'Clics reseaux sociaux' : 'Social media clicks'}</Text>
                  {Object.entries(selectedData.analytics.socialBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([platform, count]) => {
                      const iconMap: Record<string, keyof typeof MaterialIcons.glyphMap> = {
                        youtube: 'play-circle-filled',
                        tiktok: 'music-note',
                        instagram: 'camera-alt',
                        twitter: 'alternate-email',
                        website: 'language',
                      };
                      return (
                        <View key={platform} style={styles.socialRow}>
                          <MaterialIcons name={iconMap[platform] || 'link'} size={18} color={theme.primary} />
                          <Text style={styles.socialPlatform}>{platform.charAt(0).toUpperCase() + platform.slice(1)}</Text>
                          <Text style={styles.socialCount}>{count}</Text>
                        </View>
                      );
                    })}
                </View>
              ) : null}

              {/* Unique Viewers */}
              {selectedData.detailed ? (
                <View style={styles.reachCard}>
                  <MaterialIcons name="people" size={22} color={theme.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reachLabel}>{language === 'fr' ? 'Portee unique' : 'Unique reach'}</Text>
                    <Text style={styles.reachValue}>{selectedData.detailed.uniqueViewers} {language === 'fr' ? 'utilisateurs' : 'users'}</Text>
                  </View>
                </View>
              ) : null}

              {/* Push Notification Composer - Only for Gold and Silver */}
              {selectedData.ambassador.badgeType !== 'partner' ? (
                <SponsorPushComposer
                  ambassador={selectedData.ambassador}
                  language={language}
                  showAlert={showAlert}
                />
              ) : null}

              {/* Silver basic analytics notice */}
              {isSilverAccess ? (
                <View style={styles.reachCard}>
                  <MaterialIcons name="info-outline" size={18} color="#78909C" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reachLabel, { color: '#78909C' }]}>{language === 'fr' ? 'Partenaire Argent' : 'Silver Partner'}</Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                      {language === 'fr'
                        ? 'Vous avez acces aux impressions, clics et 1 notification push/mois. Passez au tier Or pour des analytics avances.'
                        : 'You have access to impressions, clicks and 1 push notification/month. Upgrade to Gold for advanced analytics.'}
                    </Text>
                  </View>
                </View>
              ) : isBronzeAccess ? (
                <View style={styles.reachCard}>
                  <MaterialIcons name="info-outline" size={18} color="#A1887F" />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.reachLabel, { color: '#A1887F' }]}>{language === 'fr' ? 'Partenaire Bronze' : 'Bronze Partner'}</Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary, marginTop: 2 }}>
                      {language === 'fr'
                        ? 'Acces limites aux statistiques de base. 1 defi sponsorise/mois. Passez au tier Argent pour plus de visibilite.'
                        : 'Limited access to basic stats. 1 sponsored challenge/month. Upgrade to Silver for more visibility.'}
                    </Text>
                  </View>
                </View>
              ) : null}
            </Animated.View>
          ) : (
            <View style={styles.emptyCard}>
              <MaterialIcons name="analytics" size={48} color={theme.textMuted} />
              <Text style={styles.emptyText}>{language === 'fr' ? 'Aucun sponsor configure' : 'No sponsors configured'}</Text>
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0F172A',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },

  // Period
  periodRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  periodPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  periodPillActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  periodText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  periodTextActive: { color: '#FFF' },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, maxWidth: 700, alignSelf: 'center' as const, width: '100%' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Summary
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8EDF2',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 }, android: { elevation: 1 }, default: {} }),
  },
  summaryIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  summaryValue: { fontSize: 20, fontWeight: '900' },
  summaryLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  // Selector
  selectorRow: { marginBottom: 16 },
  selectorChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: '#FFF', borderWidth: 1.5, borderColor: '#E2E8F0' },
  selectorText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },

  // Detail
  detailCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 }, android: { elevation: 2 }, default: {} }),
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  detailTitle: { fontSize: 17, fontWeight: '800', color: theme.textPrimary },
  tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  tierBadgeText: { fontSize: 10, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  detailStatsRow: { flexDirection: 'row', alignItems: 'center' },
  detailStat: { flex: 1, alignItems: 'center' },
  detailStatValue: { fontSize: 20, fontWeight: '900', color: theme.textPrimary },
  detailStatLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted, marginTop: 2, textTransform: 'uppercase' },
  detailStatDivider: { width: 1, height: 30, backgroundColor: '#E2E8F0' },

  // Chart
  chartCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  chartTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 12 },
  sparklineWrap: { paddingVertical: 4 },
  sparklineLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  sparklineLegendText: { fontSize: 10, color: theme.textMuted },

  // Breakdown
  breakdownCard: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E8EDF2',
  },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  breakdownPage: { fontSize: 13, fontWeight: '600', color: theme.textPrimary, marginBottom: 4 },
  breakdownBar: { height: 4, backgroundColor: '#F1F5F9', borderRadius: 2, overflow: 'hidden' as const },
  breakdownBarFill: { height: '100%', backgroundColor: '#2563EB', borderRadius: 2 },
  breakdownValues: { alignItems: 'flex-end' },
  breakdownCount: { fontSize: 15, fontWeight: '800', color: theme.textPrimary },
  breakdownClicks: { fontSize: 10, color: theme.textMuted },

  // Social
  socialRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  socialPlatform: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  socialCount: { fontSize: 16, fontWeight: '800', color: theme.primary },

  // Reach
  reachCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  reachLabel: { fontSize: 12, fontWeight: '600', color: '#1E40AF' },
  reachValue: { fontSize: 18, fontWeight: '900', color: '#1E3A8A' },

  // Empty
  emptyCard: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 15, color: theme.textMuted, marginTop: 12 },
});

// ============================================================
// SPONSOR PUSH NOTIFICATION COMPOSER
// ============================================================
interface PushComposerProps {
  ambassador: Ambassador;
  language: string;
  showAlert: (title: string, message?: string, buttons?: any[]) => void;
}

function SponsorPushComposer({ ambassador, language, showAlert }: PushComposerProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [radius, setRadius] = useState(200);
  const [sending, setSending] = useState(false);
  const [monthlyUsed, setMonthlyUsed] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const isGold = ambassador.badgeType === 'gold_sponsor';
  const isSilver = ambassador.badgeType === 'sponsor';
  const maxPerMonth = isGold ? 999 : isSilver ? 1 : 0;
  const canSend = maxPerMonth > 0 && (isGold || monthlyUsed < maxPerMonth);

  const [quota, setQuota] = useState<PushQuotaInfo | null>(null);

  // Load monthly usage from push quota service
  useEffect(() => {
    fetchPushQuota(ambassador.id, ambassador.badgeType, undefined, language).then(q => {
      setQuota(q);
      setMonthlyUsed(q.used);
    }).catch(() => {});
  }, [ambassador.id, ambassador.badgeType, language]);

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      showAlert(language === 'fr' ? 'Champs requis' : 'Required fields', language === 'fr' ? 'Remplissez le titre et le message' : 'Fill in title and message');
      return;
    }
    if (!canSend) {
      showAlert(language === 'fr' ? 'Limite atteinte' : 'Limit reached', language === 'fr' ? 'Vous avez atteint votre limite de notifications ce mois-ci' : 'You have reached your notification limit this month');
      return;
    }
    setSending(true);
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.functions.invoke('send-push', {
        body: {
          type: 'sponsor_push',
          payload: {
            ambassadorId: ambassador.id,
            ambassadorName: ambassador.displayName,
            title: title.trim(),
            body: body.trim(),
            radiusKm: radius,
            city: ambassador.city || undefined,
          },
        },
      });
      if (error) throw error;
      // Track the push event
      await supabase.from('ambassador_analytics').insert({
        ambassador_id: ambassador.id,
        event_type: 'sponsor_push',
        source_page: 'sponsor-analytics',
      });
      setMonthlyUsed(prev => prev + 1);
      setTitle('');
      setBody('');
      showAlert(
        language === 'fr' ? 'Notification envoyee' : 'Notification sent',
        language === 'fr' ? 'Les joueurs dans un rayon de ' + radius + 'km recevront votre notification.' : 'Players within ' + radius + 'km will receive your notification.'
      );
    } catch (e: any) {
      showAlert(language === 'fr' ? 'Erreur' : 'Error', e?.message || 'Failed');
    }
    setSending(false);
  };

  if (maxPerMonth === 0) return null;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={pushStyles.container}>
      <Pressable style={pushStyles.header} onPress={() => setExpanded(!expanded)}>
        <View style={pushStyles.headerIcon}>
          <MaterialIcons name="notifications-active" size={18} color="#7C3AED" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={pushStyles.headerTitle}>{language === 'fr' ? 'Notification Push' : 'Push Notification'}</Text>
          <Text style={pushStyles.headerSub}>
            {isGold
              ? (language === 'fr' ? 'Illimite' : 'Unlimited')
              : `${monthlyUsed}/${maxPerMonth} ${language === 'fr' ? 'ce mois' : 'this month'}`}
          </Text>
        </View>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color="#7C3AED" />
      </Pressable>

      {expanded ? (
        <View style={pushStyles.form}>
          {/* Quota Visual Display */}
          {quota ? (
            <View style={pushStyles.quotaCard}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={[pushStyles.quotaIconBg, { backgroundColor: quota.canSend ? '#10B98115' : '#EF444415' }]}>
                  <MaterialIcons name={quota.isUnlimited ? 'all-inclusive' : 'notifications-active'} size={20} color={quota.canSend ? '#10B981' : '#EF4444'} />
                </View>
                <View style={{ flex: 1 }}>
                  {quota.isUnlimited ? (
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#10B981' }}>{language === 'fr' ? 'Illimite' : 'Unlimited'}</Text>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                      <Text style={{ fontSize: 22, fontWeight: '900', color: quota.canSend ? '#10B981' : '#EF4444' }}>{quota.remaining}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#94A3B8' }}>/ {quota.limit}</Text>
                    </View>
                  )}
                  <Text style={{ fontSize: 10, color: '#94A3B8', marginTop: 2 }}>
                    {quota.used} {language === 'fr' ? 'envoyee(s)' : 'sent'} • Reset {quota.resetLabel}
                  </Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 18, fontWeight: '800', color: '#64748B' }}>{getDaysUntilReset()}</Text>
                  <Text style={{ fontSize: 8, fontWeight: '600', color: '#94A3B8', textTransform: 'uppercase' }}>{language === 'fr' ? 'jours' : 'days'}</Text>
                </View>
              </View>
              {!quota.isUnlimited ? (
                <View style={{ height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden', marginTop: 10 }}>
                  <View style={{ height: '100%', width: `${quota.percentage}%`, backgroundColor: quota.canSend ? '#10B981' : '#EF4444', borderRadius: 3 }} />
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Title input */}
          <View style={pushStyles.inputGroup}>
            <Text style={pushStyles.inputLabel}>{language === 'fr' ? 'TITRE' : 'TITLE'}</Text>
            <TextInput
              style={pushStyles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={language === 'fr' ? 'Ex: Nouveau defi ce weekend !' : 'Ex: New challenge this weekend!'}
              placeholderTextColor="#94A3B8"
              maxLength={60}
            />
            <Text style={pushStyles.charCount}>{title.length}/60</Text>
          </View>

          {/* Body input */}
          <View style={pushStyles.inputGroup}>
            <Text style={pushStyles.inputLabel}>{language === 'fr' ? 'MESSAGE' : 'MESSAGE'}</Text>
            <TextInput
              style={[pushStyles.input, { minHeight: 70, textAlignVertical: 'top' }]}
              value={body}
              onChangeText={setBody}
              placeholder={language === 'fr' ? 'Decrivez votre annonce...' : 'Describe your announcement...'}
              placeholderTextColor="#94A3B8"
              maxLength={180}
              multiline
              numberOfLines={3}
            />
            <Text style={pushStyles.charCount}>{body.length}/180</Text>
          </View>

          {/* Radius selector */}
          <View style={pushStyles.inputGroup}>
            <Text style={pushStyles.inputLabel}>{language === 'fr' ? 'RAYON GEOGRAPHIQUE' : 'GEOGRAPHIC RADIUS'}</Text>
            <View style={pushStyles.radiusRow}>
              {[50, 100, 200, 500].map(r => (
                <Pressable key={r} style={[pushStyles.radiusChip, radius === r && pushStyles.radiusChipActive]} onPress={() => setRadius(r)}>
                  <Text style={[pushStyles.radiusText, radius === r && pushStyles.radiusTextActive]}>{r}km</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Quota info */}
          {!isGold ? (
            <View style={pushStyles.quotaRow}>
              <MaterialIcons name="info-outline" size={14} color="#94A3B8" />
              <Text style={pushStyles.quotaText}>
                {language === 'fr'
                  ? `Partenaire Argent : 1 notification/mois. ${monthlyUsed >= 1 ? 'Limite atteinte.' : 'Disponible.'}`
                  : `Silver partner: 1 notification/month. ${monthlyUsed >= 1 ? 'Limit reached.' : 'Available.'}`}
              </Text>
            </View>
          ) : null}

          {/* Send button */}
          <Pressable
            style={({ pressed }) => [pushStyles.sendBtn, !canSend && { opacity: 0.5 }, pressed && canSend && { transform: [{ scale: 0.98 }] }]}
            onPress={handleSend}
            disabled={!canSend || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="send" size={18} color="#FFF" />
                <Text style={pushStyles.sendBtnText}>
                  {language === 'fr' ? 'Envoyer la notification' : 'Send notification'}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
}

const pushStyles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#7C3AED20',
    overflow: 'hidden',
    ...Platform.select({ ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 }, android: { elevation: 2 }, default: {} }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
  },
  headerIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  headerSub: { fontSize: 11, fontWeight: '600', color: '#7C3AED', marginTop: 1 },
  form: { paddingHorizontal: 16, paddingBottom: 18 },
  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 10, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 6 },
  input: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: theme.textPrimary,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  charCount: { fontSize: 10, color: theme.textMuted, textAlign: 'right', marginTop: 4 },
  radiusRow: { flexDirection: 'row', gap: 8 },
  radiusChip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  radiusChipActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  radiusText: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  radiusTextActive: { color: '#FFF' },
  quotaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  quotaText: { flex: 1, fontSize: 11, color: theme.textSecondary, lineHeight: 16 },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7C3AED',
    paddingVertical: 14,
    borderRadius: 14,
  },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  quotaCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quotaIconBg: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
});
