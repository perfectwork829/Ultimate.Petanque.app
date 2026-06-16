import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { useAppData } from '@/contexts/AppContext';
import {
  fetchTrustScore,
  computeQuickTrustScore,
  getTrustScoreColor,
  getTrustScoreIcon,
  getTrustLevelLabel,
  getTrustBadgeDescription,
  triggerTrustScoreComputation,
  TrustScoreData,
  getLevelFromScore,
  fetchTrustScoreHistory,
  TrustScoreHistoryPoint,
  saveTrustScoreSnapshot,
} from '@/services/trustScoreService';
import { extraTranslations } from '@/constants/i18nExtra';
import Svg, { Circle } from 'react-native-svg';

const et = extraTranslations.trustScore;

// ============================================
// Large hero gauge
// ============================================
function HeroGauge({ value, size = 180, color }: { value: number; size?: number; color: string }) {
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clamped = Math.max(0, Math.min(100, value));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={'rgba(255,255,255,0.08)'} strokeWidth={strokeWidth} fill="none"
        />
        <Circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth + 2}
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
          strokeLinecap="round" fill="none"
          rotation="-90" origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: size * 0.28, fontWeight: '900', color: '#FFF', letterSpacing: -1 }}>{clamped}</Text>
        <Text style={{ fontSize: size * 0.08, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: -2 }}>/100</Text>
      </View>
    </View>
  );
}

// ============================================
// Small gauge ring for factor breakdown
// ============================================
function GaugeRing({ value, size = 72, color, label }: { value: number; size?: number; color: string; label: string }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clamped = Math.max(0, Math.min(100, value));
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color + '15'} strokeWidth={strokeWidth} fill="none" />
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth + 1}
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
            strokeLinecap="round" fill="none" rotation="-90" origin={`${size / 2}, ${size / 2}`} />
        </Svg>
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: size * 0.22, fontWeight: '800', color }}>{clamped}%</Text>
        </View>
      </View>
      <Text style={st.gaugeLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

// ============================================
// Factor bar for detailed breakdown
// ============================================
function FactorBar({ label, value, maxValue, color, icon, description }: {
  label: string; value: number; maxValue: number; color: string; icon: string; description?: string;
}) {
  const pct = maxValue > 0 ? Math.min(100, Math.round((value / maxValue) * 100)) : 0;
  return (
    <View style={st.factorRow}>
      <View style={[st.factorIcon, { backgroundColor: color + '12' }]}>
        <MaterialIcons name={icon as any} size={18} color={color} />
      </View>
      <View style={st.factorContent}>
        <View style={st.factorHeader}>
          <Text style={st.factorLabel}>{label}</Text>
          <Text style={[st.factorValue, { color }]}>{value}/{maxValue}</Text>
        </View>
        <View style={st.factorBarTrack}>
          <View style={[st.factorBarFill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
        {description ? <Text style={st.factorDesc}>{description}</Text> : null}
      </View>
    </View>
  );
}

// ============================================
// Flag labels
// ============================================
const FLAG_LABELS: Record<string, { fr: string; en: string; icon: string; color: string }> = {
  very_low_multiplayer: { fr: 'Tres peu de matchs multi-joueurs', en: 'Very few multi-player matches', icon: 'people-outline', color: '#F97316' },
  low_multiplayer: { fr: 'Peu de matchs multi-joueurs', en: 'Few multi-player matches', icon: 'people-outline', color: '#D97706' },
  single_opponent: { fr: 'Un seul adversaire', en: 'Single opponent', icon: 'person', color: '#EF4444' },
  low_opponent_diversity: { fr: 'Faible diversite d\'adversaires', en: 'Low opponent diversity', icon: 'groups', color: '#F97316' },
  very_inconsistent_performance: { fr: 'Performances tres instables', en: 'Very inconsistent performance', icon: 'trending-down', color: '#EF4444' },
  inconsistent_performance: { fr: 'Performances instables', en: 'Inconsistent performance', icon: 'trending-down', color: '#F97316' },
  sudden_improvement: { fr: 'Progression soudaine', en: 'Sudden improvement', icon: 'bolt', color: '#D97706' },
  many_external_modifications: { fr: 'Nombreuses modifications externes', en: 'Many external modifications', icon: 'edit', color: '#EF4444' },
  some_external_modifications: { fr: 'Quelques modifications externes', en: 'Some external modifications', icon: 'edit', color: '#D97706' },
  excessive_daily_matches: { fr: 'Trop de matchs par jour', en: 'Excessive daily matches', icon: 'speed', color: '#EF4444' },
  high_daily_matches: { fr: 'Beaucoup de matchs par jour', en: 'Many daily matches', icon: 'speed', color: '#F97316' },
  extreme_win_rate: { fr: 'Taux de victoire extreme', en: 'Extreme win rate', icon: 'warning', color: '#EF4444' },
  unrealistic_combined_rates: { fr: 'Stats combinees irrealistes', en: 'Unrealistic combined rates', icon: 'warning', color: '#EF4444' },
  extreme_carreau_rate: { fr: 'Taux de carreau extreme', en: 'Extreme carreau rate', icon: 'stars', color: '#F97316' },
  very_new_account: { fr: 'Compte tres recent', en: 'Very new account', icon: 'new-releases', color: '#D97706' },
  new_account: { fr: 'Compte recent', en: 'New account', icon: 'new-releases', color: '#D97706' },
  low_match_count: { fr: 'Peu de matchs joues', en: 'Few matches played', icon: 'sports', color: '#D97706' },
  many_very_short_matches: { fr: 'Matchs tres courts suspects', en: 'Suspicious very short matches', icon: 'timer', color: '#F97316' },
  inactive_1month: { fr: 'Inactif depuis 1 mois', en: 'Inactive for 1 month', icon: 'hourglass-empty', color: '#D97706' },
  inactive_2months: { fr: 'Inactif depuis 2+ mois', en: 'Inactive for 2+ months', icon: 'hourglass-disabled', color: '#EF4444' },
  multi_account_device: { fr: 'Multi-compte detecte', en: 'Multi-account detected', icon: 'devices', color: '#F97316' },
  multi_account_device_3plus: { fr: 'Multi-comptes detectes (3+)', en: 'Multi-accounts detected (3+)', icon: 'devices', color: '#EF4444' },
  multiple_reports: { fr: 'Signalements multiples', en: 'Multiple reports', icon: 'flag', color: '#EF4444' },
  has_reports: { fr: 'Signalement recu', en: 'Report received', icon: 'flag', color: '#D97706' },
  arranged_matches: { fr: 'Matchs arranges detectes', en: 'Arranged matches detected', icon: 'gpp-bad', color: '#EF4444' },
  witness_abuse_frequent_pair: { fr: 'Attestations trop frequentes (meme paire)', en: 'Too frequent attestations (same pair)', icon: 'visibility', color: '#F97316' },
  witness_abuse_extreme: { fr: 'Abus d attestations temoins', en: 'Witness attestation abuse', icon: 'visibility-off', color: '#EF4444' },
  witness_abuse_mutual_ring: { fr: 'Attestations mutuelles suspectes', en: 'Suspicious mutual attestations', icon: 'swap-horiz', color: '#F97316' },
};

// ============================================
// MAIN
// ============================================
export default function TrustScoreScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { selfPlayer, matches } = useAppData();
  const isFr = language === 'fr';

  const [trustData, setTrustData] = useState<TrustScoreData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [history, setHistory] = useState<TrustScoreHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const [screenW, setScreenW] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenW(window.width));
    return () => sub?.remove();
  }, []);

  const loadTrustScore = async () => {
    if (!selfPlayer) { setLoading(false); return; }
    setLoading(true);
    const dbScore = await fetchTrustScore(selfPlayer.id);
    if (dbScore) {
      setTrustData(dbScore);
    } else {
      setTrustData(computeQuickTrustScore({ stats: selfPlayer.stats, createdAt: selfPlayer.createdAt }));
    }
    setLoading(false);
  };

  useEffect(() => { loadTrustScore(); }, [selfPlayer?.id]);

  useEffect(() => {
    if (!selfPlayer?.id) return;
    setHistoryLoading(true);
    fetchTrustScoreHistory(selfPlayer.id).then(h => {
      setHistory(h);
      setHistoryLoading(false);
    });
  }, [selfPlayer?.id]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadTrustScore();
    setRefreshing(false);
  };

  const handleRecompute = async () => {
    setRecomputing(true);
    await triggerTrustScoreComputation();
    setTimeout(async () => {
      await loadTrustScore();
      if (selfPlayer && user) {
        const ts = await fetchTrustScore(selfPlayer.id);
        if (ts) {
          await saveTrustScoreSnapshot(user.id, selfPlayer.id, ts.score, ts.level, ts.flags);
          const h = await fetchTrustScoreHistory(selfPlayer.id);
          setHistory(h);
        }
      }
      setRecomputing(false);
    }, 3000);
  };

  const details = trustData?.details || {};
  const multiPlayerRatio = details.multiPlayerRatio || 0;
  const uniqueOpponents = details.uniqueOpponents || 0;
  const totalMatches = details.totalMatches || details.matchesPlayed || 0;
  const performanceConsistency = details.performanceConsistency || 0;
  const modExternal = details.modificationLogs?.external || 0;
  const matchesPerWeek = details.matchesPerWeek || 0;
  const accountAgeDays = details.accountAgeDays || 0;

  const mpScore = Math.round(multiPlayerRatio * 0.3 * 100) / 100;
  const diversityScore = totalMatches > 0 ? Math.min(20, Math.round((uniqueOpponents / totalMatches) * 20)) : 0;
  const consistencyScore = Math.round((performanceConsistency / 100) * 20);
  const historyScore = Math.max(0, 15 - modExternal * 3);
  const frequencyScore = Math.min(10, Math.round(Math.min(matchesPerWeek, 5) / 5 * 10));

  // Strengths & weaknesses
  const strengths = useMemo(() => {
    if (!trustData) return [];
    const items: { label: string; icon: string; color: string }[] = [];
    if (multiPlayerRatio >= 50) items.push({ label: isFr ? 'Bon ratio multi-joueurs' : 'Good multi-player ratio', icon: 'people', color: '#3B82F6' });
    if (performanceConsistency >= 70) items.push({ label: isFr ? 'Performances regulieres' : 'Consistent performance', icon: 'show-chart', color: '#10B981' });
    if (modExternal === 0) items.push({ label: isFr ? 'Historique propre' : 'Clean history', icon: 'history', color: '#14B8A6' });
    if (accountAgeDays >= 90) items.push({ label: isFr ? 'Compte etabli' : 'Established account', icon: 'calendar-today', color: '#7C3AED' });
    if (trustData.flags.length === 0) items.push({ label: isFr ? 'Zero alertes' : 'Zero flags', icon: 'check-circle', color: '#22C55E' });
    if ((details.witnessedMatchCount || 0) >= 5) items.push({ label: isFr ? 'Matchs attestes' : 'Attested matches', icon: 'visibility', color: '#7C3AED' });
    return items.slice(0, 4);
  }, [trustData, multiPlayerRatio, performanceConsistency, modExternal, accountAgeDays, isFr]);

  const weaknesses = useMemo(() => {
    if (!trustData) return [];
    const items: { label: string; icon: string; color: string }[] = [];
    if (multiPlayerRatio < 30) items.push({ label: isFr ? 'Peu de matchs multi-joueurs' : 'Few multi-player matches', icon: 'people-outline', color: '#F97316' });
    if (performanceConsistency < 50) items.push({ label: isFr ? 'Performances instables' : 'Inconsistent performance', icon: 'trending-down', color: '#EF4444' });
    if (modExternal > 3) items.push({ label: isFr ? 'Modifications externes' : 'External modifications', icon: 'edit', color: '#F97316' });
    if (matchesPerWeek < 1) items.push({ label: isFr ? 'Faible frequence de jeu' : 'Low play frequency', icon: 'schedule', color: '#D97706' });
    if (accountAgeDays < 30) items.push({ label: isFr ? 'Compte recent' : 'New account', icon: 'new-releases', color: '#D97706' });
    return items.slice(0, 3);
  }, [trustData, multiPlayerRatio, performanceConsistency, modExternal, matchesPerWeek, accountAgeDays, isFr]);

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.header}>
          <Pressable style={st.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={st.headerTitle}>{(et.pageTitle as any)?.[language] || 'Trust Score'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const scoreColor = trustData ? getTrustScoreColor(trustData.level) : theme.textMuted;
  const scoreIcon = trustData ? getTrustScoreIcon(trustData.level) : 'shield';
  const gaugeSize = Math.min(200, Math.max(150, screenW * 0.45));

  return (
    <SafeAreaView edges={['top']} style={st.container}>
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>{(et.pageTitle as any)?.[language] || 'Trust Score'}</Text>
        <Pressable style={st.backBtn} onPress={() => setShowHowItWorks(true)}>
          <MaterialIcons name="help-outline" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      <Modal
        visible={showHowItWorks}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHowItWorks(false)}
      >
        <Pressable style={st.howModalOverlay} onPress={() => setShowHowItWorks(false)}>
          <Pressable style={st.howItWorksCard} onPress={(e) => e.stopPropagation?.()}>
            <View style={st.howHeader}>
              <MaterialIcons name="info" size={20} color="#3B82F6" />
              <Text style={st.howTitle}>{isFr ? 'Comment ca marche ?' : 'How does it work?'}</Text>
              <Pressable onPress={() => setShowHowItWorks(false)} hitSlop={8}>
                <MaterialIcons name="close" size={20} color={theme.textMuted} />
              </Pressable>
            </View>
            <Text style={st.howText}>
              {isFr
                ? 'Le Trust Score (0-100) mesure la fiabilite de vos statistiques. Il determine votre visibilite dans le classement et le poids de vos resultats.'
                : 'The Trust Score (0-100) measures the reliability of your statistics. It determines your ranking visibility and result weight.'}
            </Text>
            <View style={st.howPillars}>
              {[
                { icon: 'people', color: '#3B82F6', label: isFr ? 'Matchs multi-joueurs' : 'Multi-player matches', pts: '30' },
                { icon: 'groups', color: '#8B5CF6', label: isFr ? 'Diversite adversaires' : 'Opponent diversity', pts: '20' },
                { icon: 'show-chart', color: '#10B981', label: isFr ? 'Coherence' : 'Consistency', pts: '20' },
                { icon: 'history', color: '#F97316', label: isFr ? 'Historique' : 'History', pts: '15' },
                { icon: 'schedule', color: '#06B6D4', label: isFr ? 'Frequence' : 'Frequency', pts: '10' },
                { icon: 'calendar-today', color: '#14B8A6', label: isFr ? 'Anciennete' : 'Account age', pts: '5' },
              ].map((p, i) => (
                <View key={i} style={st.howPillarItem}>
                  <View style={[st.howPillarIcon, { backgroundColor: p.color + '15' }]}>
                    <MaterialIcons name={p.icon as any} size={14} color={p.color} />
                  </View>
                  <Text style={st.howPillarLabel}>{p.label}</Text>
                  <Text style={[st.howPillarPts, { color: p.color }]}>{p.pts}pts</Text>
                </View>
              ))}
            </View>
            <View style={st.howBonusRow}>
              <MaterialIcons name="visibility" size={14} color="#7C3AED" />
              <Text style={st.howBonusText}>{isFr ? 'Bonus : attestations temoins (jusqu\'a +8 pts)' : 'Bonus: witness attestations (up to +8 pts)'}</Text>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ScrollView
        style={st.scrollView}
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
      >
        {!trustData ? (
          <Animated.View entering={FadeInDown.duration(400)} style={st.noScoreCard}>
            <View style={st.noScoreIconWrap}>
              <MaterialIcons name="shield" size={48} color={theme.textMuted} />
            </View>
            <Text style={st.noScoreTitle}>{isFr ? 'Pas encore de score' : 'No score yet'}</Text>
            <Text style={st.noScoreText}>{(et.noScoreYet as any)?.[language] || 'No score computed yet.'}</Text>
            <Pressable style={st.recomputeBtn} onPress={handleRecompute} disabled={recomputing}>
              {recomputing ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="refresh" size={18} color="#FFF" />}
              <Text style={st.recomputeBtnText}>{isFr ? 'Calculer mon score' : 'Compute my score'}</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <>
            {/* Hero Section with large gauge */}
            <Animated.View entering={FadeInDown.duration(400)}>
              <LinearGradient
                colors={[scoreColor + '20', scoreColor + '08', theme.surface]}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={st.heroGradient}
              >
                <View style={st.heroContent}>
                  <HeroGauge value={trustData.score} size={gaugeSize} color={scoreColor} />
                  <View style={[st.heroLevelBadge, { backgroundColor: scoreColor + '20', borderColor: scoreColor + '40' }]}>
                    <MaterialIcons name={scoreIcon as any} size={16} color={scoreColor} />
                    <Text style={[st.heroLevelText, { color: scoreColor }]}>{getTrustLevelLabel(trustData.level, isFr)}</Text>
                  </View>
                  <Text style={st.heroDesc}>{getTrustBadgeDescription(trustData.level, isFr)}</Text>
                </View>

                {/* Level bar */}
                <View style={st.levelBar}>
                  <View style={st.levelBarTrack}>
                    <View style={[st.levelBarFill, { width: `${trustData.score}%`, backgroundColor: scoreColor }]} />
                    <View style={[st.levelBarMarker, { left: '25%' }]} />
                    <View style={[st.levelBarMarker, { left: '45%' }]} />
                    <View style={[st.levelBarMarker, { left: '65%' }]} />
                    <View style={[st.levelBarMarker, { left: '80%' }]} />
                  </View>
                  <View style={st.levelLabels}>
                    <Text style={st.levelLabelText}>{isFr ? 'Suspect' : 'Suspicious'}</Text>
                    <Text style={st.levelLabelText}>{isFr ? 'Surveiller' : 'Watch'}</Text>
                    <Text style={st.levelLabelText}>Standard</Text>
                    <Text style={st.levelLabelText}>{isFr ? 'Fiable' : 'Trusted'}</Text>
                    <Text style={st.levelLabelText}>{isFr ? 'Verifie' : 'Verified'}</Text>
                  </View>
                </View>

                {trustData.analyzedAt ? (
                  <Text style={st.analyzedAt}>
                    {(et.lastAnalyzed as any)?.[language] || 'Last analyzed'}: {new Date(trustData.analyzedAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                ) : null}

                <Pressable style={[st.recomputeBtn, { alignSelf: 'center', marginTop: 12 }]} onPress={handleRecompute} disabled={recomputing}>
                  {recomputing ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="refresh" size={16} color="#FFF" />}
                  <Text style={st.recomputeBtnText}>{isFr ? 'Recalculer' : 'Recompute'}</Text>
                </Pressable>
              </LinearGradient>
            </Animated.View>

            {/* Strengths & Weaknesses */}
            {(strengths.length > 0 || weaknesses.length > 0) ? (
              <Animated.View entering={FadeInDown.duration(400).delay(50)} style={st.swCard}>
                <View style={st.swRow}>
                  {strengths.length > 0 ? (
                    <View style={st.swCol}>
                      <View style={st.swColHeader}>
                        <MaterialIcons name="thumb-up" size={14} color="#22C55E" />
                        <Text style={[st.swColTitle, { color: '#22C55E' }]}>{isFr ? 'Forces' : 'Strengths'}</Text>
                      </View>
                      {strengths.map((s, i) => (
                        <View key={i} style={st.swItem}>
                          <MaterialIcons name={s.icon as any} size={13} color={s.color} />
                          <Text style={st.swItemText}>{s.label}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                  {weaknesses.length > 0 ? (
                    <View style={[st.swCol, strengths.length > 0 && st.swColRight]}>
                      <View style={st.swColHeader}>
                        <MaterialIcons name="trending-up" size={14} color="#F97316" />
                        <Text style={[st.swColTitle, { color: '#F97316' }]}>{isFr ? 'A ameliorer' : 'Improve'}</Text>
                      </View>
                      {weaknesses.map((w, i) => (
                        <View key={i} style={st.swItem}>
                          <MaterialIcons name={w.icon as any} size={13} color={w.color} />
                          <Text style={st.swItemText}>{w.label}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </Animated.View>
            ) : null}

            {/* Factor Gauges */}
            <Animated.View entering={FadeInDown.duration(400).delay(100)} style={st.sectionCard}>
              <View style={st.sectionHeader}>
                <View style={[st.sectionIconBg, { backgroundColor: '#3B82F6' + '15' }]}>
                  <MaterialIcons name="pie-chart" size={18} color="#3B82F6" />
                </View>
                <Text style={st.sectionTitle}>{(et.breakdownTitle as any)?.[language] || 'Score Breakdown'}</Text>
              </View>
              <View style={st.gaugesGrid}>
                <GaugeRing value={multiPlayerRatio} size={72} color="#3B82F6" label={(et.factorMultiPlayer as any)?.[language] || 'Multi-player'} />
                <GaugeRing value={totalMatches > 0 ? Math.min(100, Math.round((uniqueOpponents / totalMatches) * 100)) : 0} size={72} color="#8B5CF6" label={(et.factorDiversity as any)?.[language] || 'Diversity'} />
                <GaugeRing value={performanceConsistency} size={72} color="#10B981" label={(et.factorConsistency as any)?.[language] || 'Consistency'} />
                <GaugeRing value={Math.max(0, 100 - modExternal * 10)} size={72} color="#F97316" label={(et.factorHistory as any)?.[language] || 'History'} />
              </View>
            </Animated.View>

            {/* Detailed Factors */}
            <Animated.View entering={FadeInDown.duration(400).delay(150)} style={st.sectionCard}>
              <View style={st.sectionHeader}>
                <View style={[st.sectionIconBg, { backgroundColor: '#D97706' + '15' }]}>
                  <MaterialIcons name="analytics" size={18} color="#D97706" />
                </View>
                <Text style={st.sectionTitle}>{(et.detailsTitle as any)?.[language] || 'Factor Details'}</Text>
              </View>

              <FactorBar label={(et.factorMultiPlayer as any)?.[language] || 'Multi-player matches'} value={Math.round(mpScore * 100)} maxValue={30} color="#3B82F6" icon="people"
                description={((et.multiPlayerDesc as any)?.[language] || 'Proportion of matches with other app users ({value}%).').replace('{value}', String(multiPlayerRatio))} />
              <FactorBar label={(et.factorDiversity as any)?.[language] || 'Opponent diversity'} value={diversityScore} maxValue={20} color="#8B5CF6" icon="groups"
                description={((et.diversityDesc as any)?.[language] || '{value} unique opponents across {total} matches.').replace('{value}', String(uniqueOpponents)).replace('{total}', String(totalMatches))} />
              <FactorBar label={(et.factorConsistency as any)?.[language] || 'Performance consistency'} value={consistencyScore} maxValue={20} color="#10B981" icon="show-chart"
                description={((et.consistencyDesc as any)?.[language] || 'Stability of your performance over 4 weeks ({value}%).').replace('{value}', String(performanceConsistency))} />
              <FactorBar label={(et.factorHistory as any)?.[language] || 'Modification history'} value={historyScore} maxValue={15} color="#F97316" icon="history"
                description={((et.historyDesc as any)?.[language] || '{value} external modifications on your records.').replace('{value}', String(modExternal))} />
              <FactorBar label={(et.factorPlayFrequency as any)?.[language] || 'Play frequency'} value={frequencyScore} maxValue={10} color="#06B6D4" icon="schedule"
                description={((et.frequencyDesc as any)?.[language] || '{value} matches per week on average.').replace('{value}', String(matchesPerWeek))} />
              <FactorBar label={(et.factorAccountAge as any)?.[language] || 'Account age'} value={Math.min(5, Math.round(accountAgeDays / 36))} maxValue={5} color="#14B8A6" icon="calendar-today"
                description={((et.ageDesc as any)?.[language] || 'Account created {value} days ago.').replace('{value}', String(accountAgeDays))} />
              <FactorBar label={isFr ? 'Attestations temoins' : 'Witness attestations'} value={Math.min(8, (details.witnessedMatchCount || 0))} maxValue={8} color="#7C3AED" icon="visibility"
                description={isFr ? `${details.witnessedMatchCount || 0} matchs/defis attestes. Bonus progressif jusqu'a 8 pts.` : `${details.witnessedMatchCount || 0} matches/challenges attested. Progressive bonus up to 8 pts.`} />
            </Animated.View>

            {/* Flags */}
            <Animated.View entering={FadeInDown.duration(400).delay(200)} style={st.sectionCard}>
              <View style={st.sectionHeader}>
                <View style={[st.sectionIconBg, { backgroundColor: trustData.flags.length > 0 ? theme.error + '15' : theme.success + '15' }]}>
                  <MaterialIcons name={trustData.flags.length > 0 ? 'flag' : 'check-circle'} size={18} color={trustData.flags.length > 0 ? theme.error : theme.success} />
                </View>
                <Text style={st.sectionTitle}>{(et.flagsTitle as any)?.[language] || 'Detected Flags'}</Text>
                {trustData.flags.length > 0 ? (
                  <View style={[st.flagCountBadge, { backgroundColor: theme.error + '15' }]}>
                    <Text style={[st.flagCountText, { color: theme.error }]}>{trustData.flags.length}</Text>
                  </View>
                ) : null}
              </View>
              {trustData.flags.length === 0 ? (
                <View style={st.noFlagsRow}>
                  <MaterialIcons name="check-circle" size={24} color={theme.success} />
                  <Text style={st.noFlagsText}>{(et.noFlags as any)?.[language] || 'No flags detected. Excellent!'}</Text>
                </View>
              ) : (
                trustData.flags.map((flag, idx) => {
                  const flagInfo = FLAG_LABELS[flag] || { fr: flag, en: flag, icon: 'warning', color: '#D97706' };
                  return (
                    <View key={idx} style={[st.flagRow, { borderLeftColor: flagInfo.color }]}>
                      <View style={[st.flagIcon, { backgroundColor: flagInfo.color + '12' }]}>
                        <MaterialIcons name={flagInfo.icon as any} size={16} color={flagInfo.color} />
                      </View>
                      <Text style={st.flagText}>{isFr ? flagInfo.fr : flagInfo.en}</Text>
                    </View>
                  );
                })
              )}
            </Animated.View>

            {/* History Chart */}
            <Animated.View entering={FadeInDown.duration(400).delay(250)} style={st.sectionCard}>
              <View style={st.sectionHeader}>
                <View style={[st.sectionIconBg, { backgroundColor: '#7C3AED' + '15' }]}>
                  <MaterialIcons name="timeline" size={18} color="#7C3AED" />
                </View>
                <Text style={st.sectionTitle}>{isFr ? 'Evolution' : 'Evolution'}</Text>
              </View>
              {historyLoading ? (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={theme.primary} />
                </View>
              ) : history.length < 2 ? (
                <View style={{ paddingVertical: 20, alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="show-chart" size={32} color={theme.textMuted} />
                  <Text style={{ fontSize: 13, color: theme.textMuted, textAlign: 'center', lineHeight: 19 }}>
                    {isFr ? 'Le graphique apparaitra apres 2 semaines de donnees.' : 'The chart will appear after 2 weeks of data.'}
                  </Text>
                </View>
              ) : (
                <View>
                  <View style={histSt.chartContainer}>
                    <View style={histSt.yAxis}>
                      <Text style={histSt.yLabel}>100</Text>
                      <Text style={histSt.yLabel}>75</Text>
                      <Text style={histSt.yLabel}>50</Text>
                      <Text style={histSt.yLabel}>25</Text>
                      <Text style={histSt.yLabel}>0</Text>
                    </View>
                    <View style={histSt.chartArea}>
                      {[0, 25, 50, 75].map(v => (
                        <View key={v} style={[histSt.gridLine, { bottom: `${v}%` }]} />
                      ))}
                      <View style={histSt.dataPointsRow}>
                        {history.map((point, idx) => {
                          const pColor = getTrustScoreColor(point.score);
                          return (
                            <View key={idx} style={[histSt.dataCol, { height: '100%' }]}>
                              <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                                <View style={{ height: `${point.score}%`, alignItems: 'center', justifyContent: 'flex-start' }}>
                                  <View style={[histSt.dataPoint, { backgroundColor: pColor, borderColor: pColor + '40' }]} />
                                  <Text style={[histSt.dataPointLabel, { color: pColor }]}>{point.score}</Text>
                                </View>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  </View>
                  <View style={histSt.xAxis}>
                    {history.map((point, idx) => {
                      const d = new Date(point.weekStart);
                      const label = `${d.getDate()}/${d.getMonth() + 1}`;
                      if (history.length > 8 && idx % 2 !== 0) return <View key={idx} style={histSt.xLabelSlot} />;
                      return (
                        <View key={idx} style={histSt.xLabelSlot}>
                          <Text style={histSt.xLabel}>{label}</Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </Animated.View>

            {/* Inactivity Warning */}
            {trustData && trustData.details?.daysSinceLastPlay >= 14 ? (
              <Animated.View entering={FadeInDown.duration(400).delay(300)} style={st.inactivityCard}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <View style={st.inactivityIcon}>
                    <MaterialIcons name="hourglass-empty" size={22} color="#F97316" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.inactivityTitle}>{isFr ? 'Inactivite detectee' : 'Inactivity detected'}</Text>
                    <Text style={st.inactivityText}>
                      {isFr
                        ? `Vous n'avez pas joue depuis ${trustData.details.daysSinceLastPlay} jours. -5 pts/mois (plancher : 30).`
                        : `You have not played for ${trustData.details.daysSinceLastPlay} days. -5 pts/month (floor: 30).`}
                    </Text>
                    {trustData.details.inactivityDecay ? (
                      <View style={st.inactivityDecayBadge}>
                        <Text style={st.inactivityDecayText}>-{trustData.details.inactivityDecay.decayApplied} pts</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {/* Actionable Tips */}
            <Animated.View entering={FadeInDown.duration(400).delay(350)} style={st.sectionCard}>
              <View style={st.sectionHeader}>
                <View style={[st.sectionIconBg, { backgroundColor: theme.success + '15' }]}>
                  <MaterialIcons name="lightbulb" size={18} color={theme.success} />
                </View>
                <Text style={st.sectionTitle}>{(et.tipsTitle as any)?.[language] || 'Tips to Improve'}</Text>
              </View>
              {(() => {
                const tips: { icon: string; color: string; text: string; route?: string; actionLabel?: string; priority: number }[] = [];
                if (Math.round(mpScore * 100) < 20) tips.push({ icon: 'people', color: '#3B82F6', text: isFr ? `Seulement ${multiPlayerRatio}% de matchs multi-joueurs. Partagez vos matchs avec d'autres joueurs.` : `Only ${multiPlayerRatio}% multi-player matches. Share your matches.`, route: '/share-hub', actionLabel: isFr ? 'Partager' : 'Share', priority: 1 });
                if (diversityScore < 14) tips.push({ icon: 'groups', color: '#8B5CF6', text: isFr ? `${uniqueOpponents} adversaires uniques. Jouez contre de nouveaux joueurs.` : `${uniqueOpponents} unique opponents. Play against new players.`, route: '/(tabs)/directory', actionLabel: isFr ? 'Annuaire' : 'Directory', priority: 2 });
                if (consistencyScore < 14) tips.push({ icon: 'show-chart', color: '#10B981', text: isFr ? `Consistance a ${performanceConsistency}%. Jouez regulierement.` : `Consistency at ${performanceConsistency}%. Play regularly.`, route: '/match/new', actionLabel: isFr ? 'Jouer' : 'Play', priority: 3 });
                if (frequencyScore < 7) tips.push({ icon: 'schedule', color: '#06B6D4', text: isFr ? `${matchesPerWeek} matchs/semaine. Augmentez votre frequence.` : `${matchesPerWeek} matches/week. Increase your frequency.`, route: '/match/new', actionLabel: isFr ? 'Match' : 'Match', priority: 4 });
                if ((details.witnessedMatchCount || 0) < 8) tips.push({ icon: 'visibility', color: '#7C3AED', text: isFr ? `${details.witnessedMatchCount || 0}/8 matchs attestes. Invitez des temoins.` : `${details.witnessedMatchCount || 0}/8 attested. Invite witnesses.`, route: '/notifications-hub', actionLabel: isFr ? 'Attestations' : 'Attestations', priority: 5 });
                if (historyScore < 12 && modExternal > 0) tips.push({ icon: 'edit-off', color: '#F97316', text: isFr ? `${modExternal} modification(s) externe(s). Evitez de modifier apres coup.` : `${modExternal} external mod(s). Avoid editing after the fact.`, priority: 6 });
                tips.sort((a, b) => a.priority - b.priority);
                const displayTips = tips.slice(0, 4);
                if (displayTips.length === 0) {
                  return (
                    <View style={{ alignItems: 'center', paddingVertical: 16, gap: 8 }}>
                      <MaterialIcons name="emoji-events" size={36} color={theme.success} />
                      <Text style={{ fontSize: 15, fontWeight: '700', color: theme.success }}>{isFr ? 'Score excellent !' : 'Excellent score!'}</Text>
                    </View>
                  );
                }
                return displayTips.map((tip, idx) => (
                  <View key={idx} style={st.tipRow}>
                    <View style={[st.tipIcon, { backgroundColor: tip.color + '12' }]}>
                      <MaterialIcons name={tip.icon as any} size={16} color={tip.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={st.tipText}>{tip.text}</Text>
                      {tip.route ? (
                        <Pressable style={[st.tipActionBtn, { backgroundColor: tip.color + '10', borderColor: tip.color + '25' }]} onPress={() => router.push(tip.route as any)}>
                          <MaterialIcons name="arrow-forward" size={14} color={tip.color} />
                          <Text style={[st.tipActionText, { color: tip.color }]}>{tip.actionLabel}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ));
              })()}
            </Animated.View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, flexGrow: 1 },

  // How it works modal
  howModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  howItWorksCard: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: '#3B82F620',
    maxWidth: 420,
    width: '100%',
    alignSelf: 'center',
    ...theme.shadows.cardElevated,
  },
  howHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  howTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  howText: { fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginBottom: 14 },
  howPillars: { gap: 6 },
  howPillarItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  howPillarIcon: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  howPillarLabel: { flex: 1, fontSize: 12, fontWeight: '600', color: theme.textPrimary },
  howPillarPts: { fontSize: 12, fontWeight: '800' },
  howBonusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#7C3AED08', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  howBonusText: { fontSize: 11, fontWeight: '600', color: '#7C3AED', flex: 1 },

  // No score
  noScoreCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 32, alignItems: 'center', gap: 12, ...theme.shadows.card },
  noScoreIconWrap: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  noScoreTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  noScoreText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Hero
  heroGradient: { borderRadius: 24, padding: 24, marginBottom: 16, ...theme.shadows.card },
  heroContent: { alignItems: 'center', marginBottom: 16 },
  heroLevelBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, borderWidth: 1, marginTop: 12, marginBottom: 8 },
  heroLevelText: { fontSize: 14, fontWeight: '700' },
  heroDesc: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 19, paddingHorizontal: 12 },
  levelBar: { marginTop: 8 },
  levelBarTrack: { height: 10, backgroundColor: theme.backgroundSecondary, borderRadius: 5, overflow: 'hidden', position: 'relative' },
  levelBarFill: { height: '100%', borderRadius: 5 },
  levelBarMarker: { position: 'absolute', top: 0, width: 2, height: '100%', backgroundColor: theme.surface },
  levelLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  levelLabelText: { fontSize: 8, color: theme.textMuted, fontWeight: '600' },
  analyzedAt: { fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: 8 },
  recomputeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  recomputeBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // Strengths & Weaknesses
  swCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 16, marginBottom: 16, ...theme.shadows.card },
  swRow: { flexDirection: 'row' },
  swCol: { flex: 1, gap: 6 },
  swColRight: { borderLeftWidth: 1, borderLeftColor: theme.border, paddingLeft: 14, marginLeft: 14 },
  swColHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  swColTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  swItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swItemText: { fontSize: 12, fontWeight: '500', color: theme.textSecondary, flex: 1 },

  // Section
  sectionCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 16, marginBottom: 16, ...theme.shadows.card },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionIconBg: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, flex: 1 },

  // Gauges
  gaugesGrid: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap', gap: 16 },
  gaugeLabel: { fontSize: 10, fontWeight: '600', color: theme.textSecondary, marginTop: 6, textAlign: 'center', maxWidth: 80 },

  // Factor rows
  factorRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border + '40' },
  factorIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  factorContent: { flex: 1 },
  factorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  factorLabel: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  factorValue: { fontSize: 14, fontWeight: '800' },
  factorBarTrack: { height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  factorBarFill: { height: '100%', borderRadius: 3 },
  factorDesc: { fontSize: 11, color: theme.textMuted, lineHeight: 16 },

  // Flags
  flagCountBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  flagCountText: { fontSize: 12, fontWeight: '700' },
  noFlagsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  noFlagsText: { fontSize: 14, color: theme.success, fontWeight: '600' },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderLeftWidth: 3, paddingLeft: 10, marginBottom: 6, backgroundColor: theme.backgroundSecondary + '50', borderRadius: 8 },
  flagIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  flagText: { flex: 1, fontSize: 13, fontWeight: '500', color: theme.textPrimary },

  // Inactivity
  inactivityCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#F9731630', ...theme.shadows.card },
  inactivityIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F97316' + '15', alignItems: 'center', justifyContent: 'center' },
  inactivityTitle: { fontSize: 15, fontWeight: '700', color: '#F97316', marginBottom: 4 },
  inactivityText: { fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
  inactivityDecayBadge: { backgroundColor: '#F97316' + '15', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start', marginTop: 8 },
  inactivityDecayText: { fontSize: 12, fontWeight: '700', color: '#F97316' },

  // Tips
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border + '30' },
  tipIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  tipText: { fontSize: 13, color: theme.textPrimary, fontWeight: '500', lineHeight: 18 },
  tipActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 10, alignSelf: 'flex-start', borderWidth: 1 },
  tipActionText: { fontSize: 12, fontWeight: '700' },
});

const histSt = StyleSheet.create({
  chartContainer: { flexDirection: 'row', height: 160, marginBottom: 4 },
  yAxis: { width: 28, justifyContent: 'space-between', paddingVertical: 4 },
  yLabel: { fontSize: 8, color: theme.textMuted, fontWeight: '600', textAlign: 'right' },
  chartArea: { flex: 1, position: 'relative', marginLeft: 6, borderLeftWidth: 1, borderBottomWidth: 1, borderColor: theme.border },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: theme.border + '40' },
  dataPointsRow: { flexDirection: 'row', flex: 1, alignItems: 'stretch' },
  dataCol: { flex: 1, alignItems: 'center' },
  dataPoint: { width: 10, height: 10, borderRadius: 5, borderWidth: 2, marginTop: -5 },
  dataPointLabel: { fontSize: 8, fontWeight: '700', marginTop: 2 },
  xAxis: { flexDirection: 'row', marginLeft: 34, marginTop: 4 },
  xLabelSlot: { flex: 1, alignItems: 'center' },
  xLabel: { fontSize: 8, color: theme.textMuted, fontWeight: '600' },
});
