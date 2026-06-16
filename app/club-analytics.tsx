
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import Svg, { Rect, Line, Circle as SvgCircle, Polyline, Text as SvgText, G } from 'react-native-svg';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { fetchClubAnalytics, ClubAnalytics, MemberAnalytics, TeamSuggestion, H2HPair, InvitationStats } from '@/services/clubAnalyticsService';
import { getEloRank } from '@/services/eloService';
import { Platform } from 'react-native';

function MiniBarChart({ data, width, height, color }: { data: Array<{ label: string; value: number }>; width: number; height: number; color: string }) {
  if (data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barW = Math.max(1, (width - 40) / data.length - 4);
  const chartH = height - 24;

  return (
    <Svg width={width} height={height}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.value / maxVal) * chartH);
        const x = 20 + i * (barW + 4);
        return (
          <G key={i}>
            <Rect x={x} y={chartH - barH} width={barW} height={barH} rx={3} fill={color} opacity={0.85} />
            <SvgText x={x + barW / 2} y={height - 2} fontSize="8" fill={theme.textMuted} textAnchor="middle" fontWeight="600">{d.label}</SvgText>
            {d.value > 0 ? <SvgText x={x + barW / 2} y={chartH - barH - 4} fontSize="8" fill={theme.textSecondary} textAnchor="middle" fontWeight="700">{d.value}</SvgText> : null}
          </G>
        );
      })}
    </Svg>
  );
}

function MiniLineChart({ data, width, height, color }: { data: Array<{ label: string; value: number }>; width: number; height: number; color: string }) {
  if (data.length < 2) return null;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const minVal = Math.min(...data.map(d => d.value), 0);
  const range = Math.max(maxVal - minVal, 1);
  const chartH = height - 24;
  const chartW = width - 40;
  const stepX = chartW / (data.length - 1);

  const points = data.map((d, i) => ({
    x: 20 + i * stepX,
    y: 8 + chartH - ((d.value - minVal) / range) * chartH,
  }));
  const polyline = points.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <Svg width={width} height={height}>
      {/* Grid lines */}
      {[0, 0.5, 1].map((pct, i) => (
        <Line key={i} x1={20} y1={8 + chartH * (1 - pct)} x2={width - 20} y2={8 + chartH * (1 - pct)} stroke={theme.border} strokeWidth={0.5} opacity={0.5} />
      ))}
      <Polyline points={polyline} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <G key={i}>
          <SvgCircle cx={p.x} cy={p.y} r={3.5} fill={color} stroke="#FFF" strokeWidth={2} />
          <SvgText x={p.x} y={height - 2} fontSize="8" fill={theme.textMuted} textAnchor="middle" fontWeight="600">{data[i].label}</SvgText>
        </G>
      ))}
    </Svg>
  );
}

export default function ClubAnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, language } = useLanguage();
  const fr = language === 'fr';
  const { players, matches, tournaments } = useAppData();
  const { getClubById } = useAppActions();

  const club = getClubById(id!);
  const clubMembers = useMemo(() => players.filter(p => p.clubId === id), [players, id]);

  const [analytics, setAnalytics] = useState<ClubAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  const [screenDims, setScreenDims] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenDims(window));
    return () => sub?.remove();
  }, []);
  const screenWidth = Math.max(1, screenDims.width);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchClubAnalytics(id, clubMembers, matches, tournaments).then(data => {
      setAnalytics(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [id, clubMembers.length, matches.length, tournaments.length]);

  const roleColors: Record<string, string> = {
    'Tireur': '#F97316',
    'Pointeur': '#3B82F6',
    'Milieu': '#8B5CF6',
  };

  if (!club) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.headerBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{fr ? 'Analytique Club' : 'Club Analytics'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: theme.textMuted }}>{fr ? 'Club introuvable' : 'Club not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Restrict analytics to verified clubs only
  if (!club.isVerified) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.headerBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>{fr ? 'Analytique' : 'Analytics'}</Text>
            <Text style={s.headerSubtitle}>{club.name}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 32, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', marginBottom: 28 }}>
            <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
              <MaterialIcons name="verified" size={40} color="#F59E0B" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: theme.textPrimary, textAlign: 'center', marginBottom: 8 }}>
              {fr ? 'Club non verifie' : 'Unverified Club'}
            </Text>
            <Text style={{ fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21 }}>
              {t('club', 'analyticsVerifiedDesc')}
            </Text>
          </View>

          {/* Advantages list */}
          <View style={{ backgroundColor: theme.surface, borderRadius: 18, padding: 18, marginBottom: 24, borderWidth: 1.5, borderColor: '#8B5CF620', ...theme.shadows.card }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#8B5CF615', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name="auto-awesome" size={20} color="#8B5CF6" />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: theme.textPrimary }}>{t('club', 'analyticsAdvantages')}</Text>
            </View>
            {([
              { icon: 'timeline', color: '#3B82F6', key: 'analyticsAdvMemberEvolution' },
              { icon: 'bar-chart', color: theme.primary, key: 'analyticsAdvMatchStats' },
              { icon: 'compare-arrows', color: '#0EA5E9', key: 'analyticsAdvNationalComparison' },
              { icon: 'emoji-events', color: '#F59E0B', key: 'analyticsAdvTopPlayers' },
              { icon: 'pie-chart', color: '#8B5CF6', key: 'analyticsAdvRoleDistribution' },
              { icon: 'groups', color: '#10B981', key: 'analyticsAdvMatchmaking' },
              { icon: 'handshake', color: '#7C3AED', key: 'analyticsAdvH2HSynergy' },
              { icon: 'mail', color: '#EC4899', key: 'analyticsAdvInvitationStats' },
              { icon: 'person-search', color: '#F97316', key: 'analyticsAdvMemberAnalytics' },
              { icon: 'sports', color: theme.carreauColor, key: 'analyticsAdvTournamentStats' },
              { icon: 'file-download', color: '#059669', key: 'analyticsAdvExportCsvPdf' },
            ] as const).map((adv, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: i < 10 ? 1 : 0, borderBottomColor: theme.border + '50' }}>
                <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: adv.color + '12', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name={adv.icon as any} size={16} color={adv.color} />
                </View>
                <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: theme.textPrimary, lineHeight: 18 }}>{t('club', adv.key)}</Text>
                <MaterialIcons name="lock" size={14} color={theme.textMuted} />
              </View>
            ))}
          </View>

          {/* CTA */}
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#2563EB', paddingVertical: 16, borderRadius: 14, marginBottom: 12 }}
            onPress={() => { router.back(); }}
          >
            <MaterialIcons name="checklist" size={18} color="#FFF" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{fr ? 'Completer la verification' : 'Complete verification'}</Text>
          </Pressable>
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.backgroundSecondary, paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.border }}
            onPress={() => { router.back(); }}
          >
            <MaterialIcons name="arrow-back" size={18} color={theme.textSecondary} />
            <Text style={{ fontSize: 15, fontWeight: '600', color: theme.textSecondary }}>{fr ? 'Retour au club' : 'Back to club'}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.headerBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={s.headerTitle}>{fr ? 'Analytique' : 'Analytics'}</Text>
          <Text style={s.headerSubtitle}>{club.name}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ fontSize: 14, color: theme.textMuted }}>{fr ? 'Chargement...' : 'Loading...'}</Text>
        </View>
      ) : analytics ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
          {/* Overview Cards */}
          <View style={s.overviewGrid}>
            <View style={s.overviewCard}>
              <View style={[s.overviewIcon, { backgroundColor: theme.primary + '15' }]}>
                <MaterialIcons name="people" size={20} color={theme.primary} />
              </View>
              <Text style={s.overviewValue}>{analytics.totalMembers}</Text>
              <Text style={s.overviewLabel}>{fr ? 'Membres' : 'Members'}</Text>
            </View>
            <View style={s.overviewCard}>
              <View style={[s.overviewIcon, { backgroundColor: theme.success + '15' }]}>
                <MaterialIcons name="trending-up" size={20} color={theme.success} />
              </View>
              <Text style={s.overviewValue}>{analytics.activeMembersThisMonth}</Text>
              <Text style={s.overviewLabel}>{fr ? 'Actifs ce mois' : 'Active this month'}</Text>
            </View>
            <View style={s.overviewCard}>
              <View style={[s.overviewIcon, { backgroundColor: '#8B5CF6' + '15' }]}>
                <MaterialIcons name="diamond" size={20} color="#8B5CF6" />
              </View>
              <Text style={s.overviewValue}>{analytics.avgElo}</Text>
              <Text style={s.overviewLabel}>{fr ? 'ELO moyen' : 'Avg ELO'}</Text>
            </View>
            <View style={s.overviewCard}>
              <View style={[s.overviewIcon, { backgroundColor: theme.accent + '15' }]}>
                <MaterialIcons name="sports" size={20} color={theme.accent} />
              </View>
              <Text style={s.overviewValue}>{analytics.avgWinRate}%</Text>
              <Text style={s.overviewLabel}>{fr ? 'Taux victoire' : 'Win rate'}</Text>
            </View>
          </View>

          {/* Matches by Month */}
          <View style={s.sectionCard}>
            <View style={s.sectionHeader}>
              <View style={[s.sectionIconBox, { backgroundColor: theme.primary + '15' }]}>
                <MaterialIcons name="bar-chart" size={18} color={theme.primary} />
              </View>
              <Text style={s.sectionTitle}>{fr ? 'Matchs par mois' : 'Matches by Month'}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <MiniBarChart
                data={analytics.matchesByMonth.map(m => ({ label: m.month, value: m.count }))}
                width={Math.min(screenWidth - 64, 340)}
                height={120}
                color={theme.primary}
              />
            </View>
            <View style={s.chartLegend}>
              <Text style={s.chartLegendText}>{analytics.totalMatches} {fr ? 'matchs au total' : 'total matches'}</Text>
            </View>
          </View>

          {/* Win Rate Evolution */}
          <View style={s.sectionCard}>
            <View style={s.sectionHeader}>
              <View style={[s.sectionIconBox, { backgroundColor: theme.success + '15' }]}>
                <MaterialIcons name="show-chart" size={18} color={theme.success} />
              </View>
              <Text style={s.sectionTitle}>{fr ? 'Evolution taux de victoire' : 'Win Rate Evolution'}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <MiniLineChart
                data={analytics.winRateEvolution.map(m => ({ label: m.month, value: m.winRate }))}
                width={Math.min(screenWidth - 64, 340)}
                height={120}
                color={theme.success}
              />
            </View>
          </View>

          {/* National Average Comparison */}
          <View style={s.sectionCard}>
            <View style={s.sectionHeader}>
              <View style={[s.sectionIconBox, { backgroundColor: '#3B82F6' + '15' }]}>
                <MaterialIcons name="compare-arrows" size={18} color="#3B82F6" />
              </View>
              <Text style={s.sectionTitle}>{fr ? 'Comparaison nationale' : 'National Comparison'}</Text>
            </View>
            {[
              { label: fr ? 'ELO moyen' : 'Avg ELO', club: analytics.avgElo, national: analytics.nationalAvgElo, icon: 'diamond', color: '#8B5CF6' },
              { label: fr ? 'Taux victoire' : 'Win Rate', club: analytics.avgWinRate, national: analytics.nationalAvgWinRate, icon: 'emoji-events', color: theme.success, suffix: '%' },
              { label: fr ? 'Matchs/membre' : 'Matches/member', club: analytics.totalMembers > 0 ? Math.round((analytics.totalMatches / analytics.totalMembers) * 10) / 10 : 0, national: analytics.nationalAvgMatchesPerMember, icon: 'sports', color: theme.primary },
            ].map((item, idx) => {
              const diff = item.club - item.national;
              const isAbove = diff > 0;
              return (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: idx < 2 ? 1 : 0, borderBottomColor: theme.border + '60' }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: item.color + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name={item.icon as any} size={18} color={item.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }}>{item.label}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: item.color }}>{item.club}{item.suffix || ''}</Text>
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>vs</Text>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textSecondary }}>{item.national}{item.suffix || ''}</Text>
                    </View>
                  </View>
                  <View style={{ backgroundColor: isAbove ? '#22C55E15' : '#EF444415', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <MaterialIcons name={isAbove ? 'arrow-upward' : 'arrow-downward'} size={12} color={isAbove ? '#22C55E' : '#EF4444'} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: isAbove ? '#22C55E' : '#EF4444' }}>{isAbove ? '+' : ''}{Math.round(diff * 10) / 10}{item.suffix || ''}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Top 5 Members */}
          <View style={s.sectionCard}>
            <View style={s.sectionHeader}>
              <View style={[s.sectionIconBox, { backgroundColor: '#F59E0B' + '15' }]}>
                <MaterialIcons name="emoji-events" size={18} color="#F59E0B" />
              </View>
              <Text style={s.sectionTitle}>{fr ? 'Top 5 Joueurs' : 'Top 5 Players'}</Text>
            </View>
            {analytics.topMembers.map((member, idx) => {
              const eloR = getEloRank(member.elo);
              const medals = ['#F59E0B', '#94A3B8', '#CD7F32'];
              return (
                <Pressable key={member.id} style={s.memberRow} onPress={() => router.push(`/player/${member.id}`)}>
                  <View style={[s.memberRank, idx < 3 && { backgroundColor: medals[idx] + '20' }]}>
                    {idx < 3 ? (
                      <MaterialIcons name="emoji-events" size={14} color={medals[idx]} />
                    ) : (
                      <Text style={s.memberRankText}>{idx + 1}</Text>
                    )}
                  </View>
                  <View style={s.memberAvatar}>
                    {member.avatar ? (
                      <Image source={{ uri: member.avatar }} style={{ width: 36, height: 36, borderRadius: 18 }} contentFit="cover" />
                    ) : (
                      <Text style={s.memberAvatarText}>{member.name.charAt(0)}</Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.memberName} numberOfLines={1}>{member.name}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={{ fontSize: 11, color: theme.textMuted }}>{member.matches} {fr ? 'matchs' : 'games'}</Text>
                      <Text style={{ fontSize: 11, color: theme.success, fontWeight: '600' }}>{member.winRate}%</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.memberElo, { color: eloR.color }]}>{member.elo}</Text>
                    <Text style={{ fontSize: 9, color: eloR.color, fontWeight: '600' }}>{eloR.label[fr ? 'fr' : 'en']}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          {/* Role Distribution */}
          <View style={s.sectionCard}>
            <View style={s.sectionHeader}>
              <View style={[s.sectionIconBox, { backgroundColor: '#8B5CF6' + '15' }]}>
                <MaterialIcons name="pie-chart" size={18} color="#8B5CF6" />
              </View>
              <Text style={s.sectionTitle}>{fr ? 'Distribution des roles' : 'Role Distribution'}</Text>
            </View>
            {analytics.roleDistribution.map(rd => {
              const color = roleColors[rd.role] || theme.textMuted;
              return (
                <View key={rd.role} style={s.roleRow}>
                  <View style={[s.roleIcon, { backgroundColor: color + '15' }]}>
                    <MaterialIcons name={rd.role === 'Tireur' ? 'gps-fixed' : rd.role === 'Pointeur' ? 'adjust' : 'swap-horiz'} size={16} color={color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.textPrimary }}>{rd.role}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '800', color }}>{rd.pct}%</Text>
                    </View>
                    <View style={s.roleBarTrack}>
                      <View style={[s.roleBarFill, { width: `${rd.pct}%`, backgroundColor: color }]} />
                    </View>
                    <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>{rd.count} {fr ? 'joueurs' : 'players'}</Text>
                  </View>
                </View>
              );
            })}
          </View>

          {/* Member Evolution & Invitation Stats */}
          <View style={s.sectionCard}>
            <View style={s.sectionHeader}>
              <View style={[s.sectionIconBox, { backgroundColor: '#3B82F6' + '15' }]}>
                <MaterialIcons name="timeline" size={18} color="#3B82F6" />
              </View>
              <Text style={s.sectionTitle}>{fr ? 'Evolution des membres' : 'Member Evolution'}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <MiniLineChart
                data={analytics.matchesByMonth.map((m, idx) => ({
                  label: m.month,
                  value: Math.max(1, analytics.totalMembers - (analytics.matchesByMonth.length - 1 - idx) * Math.round(analytics.newMembersThisMonth / Math.max(1, analytics.matchesByMonth.length))),
                }))}
                width={Math.min(screenWidth - 64, 340)}
                height={100}
                color="#3B82F6"
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#3B82F6' }}>{analytics.totalMembers}</Text>
                <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Total' : 'Total'}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#DCFCE7', borderRadius: 12, padding: 12, alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#10B981' }}>+{analytics.newMembersThisMonth}</Text>
                <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Ce mois' : 'This month'}</Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: '#D97706' }}>{analytics.activeMembersThisMonth}</Text>
                <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Actifs' : 'Active'}</Text>
              </View>
            </View>
            {analytics.totalMembers > 0 ? (
              <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '60' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MaterialIcons name="trending-up" size={14} color={analytics.activeMembersThisMonth / analytics.totalMembers >= 0.5 ? '#10B981' : '#D97706'} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary }}>
                    {fr ? 'Taux de retention' : 'Retention rate'}: <Text style={{ fontWeight: '800', color: analytics.activeMembersThisMonth / analytics.totalMembers >= 0.5 ? '#10B981' : '#D97706' }}>{Math.round((analytics.activeMembersThisMonth / analytics.totalMembers) * 100)}%</Text>
                  </Text>
                </View>
              </View>
            ) : null}
          </View>

          {/* Invitation Statistics */}
          {analytics.invitationStats && analytics.invitationStats.totalSent > 0 ? (
            <View style={s.sectionCard}>
              <View style={s.sectionHeader}>
                <View style={[s.sectionIconBox, { backgroundColor: '#7C3AED' + '15' }]}>
                  <MaterialIcons name="mail" size={18} color="#7C3AED" />
                </View>
                <Text style={s.sectionTitle}>{fr ? 'Statistiques Invitations' : 'Invitation Statistics'}</Text>
              </View>
              {/* KPI Row */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <View style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 12, padding: 12, alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#3B82F6' }}>{analytics.invitationStats.totalSent}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Envoyees' : 'Sent'}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#DCFCE7', borderRadius: 12, padding: 12, alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#10B981' }}>{analytics.invitationStats.accepted}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Acceptees' : 'Accepted'}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#EF4444' }}>{analytics.invitationStats.declined}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'Refusees' : 'Declined'}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: '#FEF3C7', borderRadius: 12, padding: 12, alignItems: 'center', gap: 2 }}>
                  <Text style={{ fontSize: 20, fontWeight: '800', color: '#D97706' }}>{analytics.invitationStats.pending}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: '#64748B', textTransform: 'uppercase' }}>{fr ? 'En attente' : 'Pending'}</Text>
                </View>
              </View>
              {/* Acceptance Rate & Response Time */}
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                <View style={{ flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: theme.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialIcons name="check-circle" size={16} color={analytics.invitationStats.acceptanceRate >= 50 ? '#10B981' : '#D97706'} />
                    <Text style={{ fontSize: 22, fontWeight: '900', color: analytics.invitationStats.acceptanceRate >= 50 ? '#10B981' : '#D97706' }}>{analytics.invitationStats.acceptanceRate}%</Text>
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#64748B' }}>{fr ? 'Taux acceptation' : 'Acceptance rate'}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 14, alignItems: 'center', gap: 4, borderWidth: 1, borderColor: theme.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialIcons name="schedule" size={16} color="#3B82F6" />
                    <Text style={{ fontSize: 22, fontWeight: '900', color: '#3B82F6' }}>
                      {analytics.invitationStats.avgResponseTimeHours < 24
                        ? `${Math.round(analytics.invitationStats.avgResponseTimeHours)}h`
                        : `${Math.round(analytics.invitationStats.avgResponseTimeHours / 24)}j`}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: '600', color: '#64748B' }}>{fr ? 'Temps reponse moy.' : 'Avg response time'}</Text>
                </View>
              </View>
              {/* Acceptance Rate Evolution */}
              {analytics.invitationStats.monthlyAcceptanceRate && analytics.invitationStats.monthlyAcceptanceRate.some(m => m.sent > 0) ? (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' }}>{fr ? 'Taux acceptation par mois' : 'Acceptance rate by month'}</Text>
                  <View style={{ alignItems: 'center' }}>
                    <MiniLineChart
                      data={analytics.invitationStats.monthlyAcceptanceRate.map(m => ({ label: m.month, value: m.rate }))}
                      width={Math.min(screenWidth - 64, 340)}
                      height={100}
                      color="#10B981"
                    />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                    {analytics.invitationStats.monthlyAcceptanceRate.filter(m => m.sent > 0).length > 1 ? (() => {
                      const rates = analytics.invitationStats.monthlyAcceptanceRate.filter(m => m.sent > 0);
                      const first = rates[0]?.rate || 0;
                      const last = rates[rates.length - 1]?.rate || 0;
                      const trend = last - first;
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: trend >= 0 ? '#DCFCE7' : '#FEF2F2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                          <MaterialIcons name={trend >= 0 ? 'trending-up' : 'trending-down'} size={12} color={trend >= 0 ? '#10B981' : '#EF4444'} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: trend >= 0 ? '#10B981' : '#EF4444' }}>{trend >= 0 ? '+' : ''}{trend}%</Text>
                        </View>
                      );
                    })() : null}
                  </View>
                </View>
              ) : null}

              {/* Most Responsive Players */}
              {analytics.invitationStats.mostResponsivePlayers && analytics.invitationStats.mostResponsivePlayers.length > 0 ? (
                <View style={{ marginBottom: 14 }}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' }}>{fr ? 'Joueurs les plus reactifs' : 'Most responsive players'}</Text>
                  {analytics.invitationStats.mostResponsivePlayers.map((player, pidx) => (
                    <View key={pidx} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: pidx < analytics.invitationStats.mostResponsivePlayers.length - 1 ? 1 : 0, borderBottomColor: theme.border + '60' }}>
                      <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: pidx === 0 ? '#F59E0B20' : '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                        {pidx === 0 ? <MaterialIcons name="bolt" size={14} color="#F59E0B" /> : <Text style={{ fontSize: 10, fontWeight: '700', color: '#94A3B8' }}>{pidx + 1}</Text>}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: theme.textPrimary }} numberOfLines={1}>{player.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                          <Text style={{ fontSize: 10, color: '#64748B' }}>{player.invitationsReceived} {fr ? 'recues' : 'received'}</Text>
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#10B981' }}>{player.accepted} {fr ? 'acceptees' : 'accepted'}</Text>
                        </View>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: player.avgResponseHours < 24 ? '#DCFCE7' : player.avgResponseHours < 72 ? '#FEF3C7' : '#FEF2F2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                          <MaterialIcons name="schedule" size={10} color={player.avgResponseHours < 24 ? '#10B981' : player.avgResponseHours < 72 ? '#D97706' : '#EF4444'} />
                          <Text style={{ fontSize: 11, fontWeight: '700', color: player.avgResponseHours < 24 ? '#10B981' : player.avgResponseHours < 72 ? '#D97706' : '#EF4444' }}>
                            {player.avgResponseHours < 24 ? `${Math.round(player.avgResponseHours)}h` : `${Math.round(player.avgResponseHours / 24)}j`}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Monthly Chart */}
              {analytics.invitationStats.byMonth.some(m => m.sent > 0) ? (
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' }}>{fr ? 'Par mois' : 'By month'}</Text>
                  <View style={{ alignItems: 'center' }}>
                    <MiniBarChart
                      data={analytics.invitationStats.byMonth.map(m => ({ label: m.month, value: m.sent }))}
                      width={Math.min(screenWidth - 64, 340)}
                      height={100}
                      color="#7C3AED"
                    />
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8 }}>
                    {[
                      { color: '#10B981', label: fr ? 'Acceptees' : 'Accepted', value: analytics.invitationStats.accepted },
                      { color: '#EF4444', label: fr ? 'Refusees' : 'Declined', value: analytics.invitationStats.declined },
                      { color: '#94A3B8', label: fr ? 'Expirees' : 'Expired', value: analytics.invitationStats.expired },
                    ].map((item, idx) => (
                      <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
                        <Text style={{ fontSize: 10, fontWeight: '600', color: '#64748B' }}>{item.label}: {item.value}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Tournament Stats - moved here after overview */}
          <View style={s.sectionCard}>
            <View style={s.sectionHeader}>
              <View style={[s.sectionIconBox, { backgroundColor: theme.carreauColor + '15' }]}>
                <MaterialIcons name="emoji-events" size={18} color={theme.carreauColor} />
              </View>
              <Text style={s.sectionTitle}>{fr ? 'Tournois' : 'Tournaments'}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={s.tournamentStat}>
                <Text style={s.tournamentStatValue}>{analytics.tournamentsPlayed}</Text>
                <Text style={s.tournamentStatLabel}>{fr ? 'Total organises' : 'Total organized'}</Text>
              </View>
              <View style={s.tournamentStat}>
                <Text style={[s.tournamentStatValue, { color: theme.carreauColor }]}>{analytics.tournamentsThisYear}</Text>
                <Text style={s.tournamentStatLabel}>{fr ? 'Cette annee' : 'This year'}</Text>
              </View>
              <View style={s.tournamentStat}>
                <Text style={[s.tournamentStatValue, { color: theme.success }]}>{analytics.newMembersThisMonth}</Text>
                <Text style={s.tournamentStatLabel}>{fr ? 'Nouveaux ce mois' : 'New this month'}</Text>
              </View>
            </View>
          </View>



          {/* Matchmaking Section */}
          {analytics.matchmaking && (analytics.matchmaking.doublettes.length > 0 || analytics.matchmaking.triplettes.length > 0) ? (
            <View style={s.sectionCard}>
              <View style={s.sectionHeader}>
                <View style={[s.sectionIconBox, { backgroundColor: '#10B981' + '15' }]}>
                  <MaterialIcons name="groups" size={18} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sectionTitle}>{fr ? 'Compositions optimales' : 'Optimal Lineups'}</Text>
                  <Text style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{fr ? 'Basees sur les stats et la complementarite' : 'Based on stats and complementarity'}</Text>
                </View>
              </View>

              {/* Doublettes */}
              {analytics.matchmaking.doublettes.length > 0 ? (
                <View style={{ marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <MaterialIcons name="people" size={14} color={theme.accent} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: theme.accent }}>{fr ? 'Doublettes' : 'Doubles'}</Text>
                  </View>
                  {analytics.matchmaking.doublettes.map((team, idx) => (
                    <View key={`d-${idx}`} style={s.mmCard}>
                      <View style={s.mmRankBadge}>
                        <Text style={s.mmRankText}>#{idx + 1}</Text>
                      </View>
                      <View style={s.mmPlayersRow}>
                        {team.players.map((p, pi) => {
                          const rc = roleColors[p.role] || theme.textMuted;
                          return (
                            <View key={p.id} style={s.mmPlayer}>
                              <View style={s.mmPlayerAvatar}>
                                {p.avatar ? (
                                  <Image source={{ uri: p.avatar }} style={{ width: 32, height: 32, borderRadius: 10 }} contentFit="cover" />
                                ) : (
                                  <Text style={s.mmPlayerAvatarText}>{p.name.charAt(0)}</Text>
                                )}
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={s.mmPlayerName} numberOfLines={1}>{p.name}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                  <View style={[s.mmRoleBadge, { backgroundColor: rc + '12' }]}>
                                    <MaterialIcons name={p.role === 'Tireur' ? 'gps-fixed' : p.role === 'Pointeur' ? 'adjust' : 'swap-horiz'} size={8} color={rc} />
                                    <Text style={[s.mmRoleBadgeText, { color: rc }]}>{p.role}</Text>
                                  </View>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textSecondary }}>{p.elo}</Text>
                                </View>
                              </View>
                              {pi < team.players.length - 1 ? <MaterialIcons name="add" size={14} color={theme.textMuted} /> : null}
                            </View>
                          );
                        })}
                      </View>
                      <View style={s.mmBottomRow}>
                        <View style={s.mmScoreCircle}>
                          <Text style={[s.mmScoreText, { color: team.score >= 70 ? '#22C55E' : team.score >= 50 ? '#F59E0B' : theme.textSecondary }]}>{team.score}</Text>
                          <Text style={s.mmScoreLabel}>Score</Text>
                        </View>
                        <View style={s.mmStatsCol}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <MaterialIcons name="diamond" size={10} color="#8B5CF6" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textSecondary }}>{fr ? 'ELO moy.' : 'Avg ELO'}: <Text style={{ fontWeight: '800', color: '#8B5CF6' }}>{team.avgElo}</Text></Text>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {team.strengths.map((str, si) => (
                              <View key={si} style={s.mmStrengthBadge}>
                                <MaterialIcons name="check-circle" size={8} color="#22C55E" />
                                <Text style={s.mmStrengthText}>{str}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>
                      {/* H2H Synergy - Doublettes */}
                      {team.synergyScore > 0 && team.h2h && team.h2h.length > 0 ? (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border + '60' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                            <MaterialIcons name="handshake" size={10} color="#7C3AED" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>{fr ? 'Synergie reelle' : 'Real synergy'}: {team.synergyScore}%</Text>
                          </View>
                          {team.h2h.filter((h: H2HPair) => h.matchesTogether > 0).map((h: H2HPair, hi: number) => {
                            const nameA = team.players.find(p => p.id === h.playerA)?.name?.split(' ')[0] || '?';
                            const nameB = team.players.find(p => p.id === h.playerB)?.name?.split(' ')[0] || '?';
                            return (
                              <View key={hi} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 }}>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textSecondary, flex: 1 }}>{nameA} + {nameB}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#7C3AED10', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#7C3AED' }}>{h.matchesTogether} {fr ? 'matchs' : 'games'}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: h.winRate >= 50 ? '#22C55E10' : '#EF444410', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: h.winRate >= 50 ? '#22C55E' : '#EF4444' }}>{h.winRate}% {fr ? 'vict.' : 'win'}</Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Triplettes */}
              {analytics.matchmaking.triplettes.length > 0 ? (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                    <MaterialIcons name="groups" size={14} color="#7C3AED" />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#7C3AED' }}>{fr ? 'Triplettes' : 'Triples'}</Text>
                  </View>
                  {analytics.matchmaking.triplettes.map((team, idx) => (
                    <View key={`t-${idx}`} style={s.mmCard}>
                      <View style={[s.mmRankBadge, { backgroundColor: '#7C3AED15' }]}>
                        <Text style={[s.mmRankText, { color: '#7C3AED' }]}>#{idx + 1}</Text>
                      </View>
                      <View style={s.mmPlayersRow}>
                        {team.players.map((p, pi) => {
                          const rc = roleColors[p.role] || theme.textMuted;
                          return (
                            <View key={p.id} style={s.mmPlayer}>
                              <View style={s.mmPlayerAvatar}>
                                {p.avatar ? (
                                  <Image source={{ uri: p.avatar }} style={{ width: 32, height: 32, borderRadius: 10 }} contentFit="cover" />
                                ) : (
                                  <Text style={s.mmPlayerAvatarText}>{p.name.charAt(0)}</Text>
                                )}
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={s.mmPlayerName} numberOfLines={1}>{p.name}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                                  <View style={[s.mmRoleBadge, { backgroundColor: rc + '12' }]}>
                                    <MaterialIcons name={p.role === 'Tireur' ? 'gps-fixed' : p.role === 'Pointeur' ? 'adjust' : 'swap-horiz'} size={8} color={rc} />
                                    <Text style={[s.mmRoleBadgeText, { color: rc }]}>{p.role}</Text>
                                  </View>
                                  <Text style={{ fontSize: 10, fontWeight: '700', color: theme.textSecondary }}>{p.elo}</Text>
                                </View>
                              </View>
                              {pi < team.players.length - 1 ? <MaterialIcons name="add" size={14} color={theme.textMuted} /> : null}
                            </View>
                          );
                        })}
                      </View>
                      <View style={s.mmBottomRow}>
                        <View style={s.mmScoreCircle}>
                          <Text style={[s.mmScoreText, { color: team.score >= 70 ? '#22C55E' : team.score >= 50 ? '#F59E0B' : theme.textSecondary }]}>{team.score}</Text>
                          <Text style={s.mmScoreLabel}>Score</Text>
                        </View>
                        <View style={s.mmStatsCol}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            <MaterialIcons name="diamond" size={10} color="#8B5CF6" />
                            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textSecondary }}>{fr ? 'ELO moy.' : 'Avg ELO'}: <Text style={{ fontWeight: '800', color: '#8B5CF6' }}>{team.avgElo}</Text></Text>
                          </View>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                            {team.strengths.map((str, si) => (
                              <View key={si} style={s.mmStrengthBadge}>
                                <MaterialIcons name="check-circle" size={8} color="#22C55E" />
                                <Text style={s.mmStrengthText}>{str}</Text>
                              </View>
                            ))}
                          </View>
                        </View>
                      </View>
                      {/* H2H Synergy - Triplettes */}
                      {team.synergyScore > 0 && team.h2h && team.h2h.length > 0 ? (
                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.border + '60' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                            <MaterialIcons name="handshake" size={10} color="#7C3AED" />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: '#7C3AED' }}>{fr ? 'Synergie reelle' : 'Real synergy'}: {team.synergyScore}%</Text>
                          </View>
                          {team.h2h.filter((h: H2HPair) => h.matchesTogether > 0).map((h: H2HPair, hi: number) => {
                            const nameA = team.players.find(p => p.id === h.playerA)?.name?.split(' ')[0] || '?';
                            const nameB = team.players.find(p => p.id === h.playerB)?.name?.split(' ')[0] || '?';
                            return (
                              <View key={hi} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 }}>
                                <Text style={{ fontSize: 10, fontWeight: '600', color: theme.textSecondary, flex: 1 }}>{nameA} + {nameB}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#7C3AED10', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: '#7C3AED' }}>{h.matchesTogether} {fr ? 'matchs' : 'games'}</Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: h.winRate >= 50 ? '#22C55E10' : '#EF444410', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                  <Text style={{ fontSize: 9, fontWeight: '700', color: h.winRate >= 50 ? '#22C55E' : '#EF4444' }}>{h.winRate}% {fr ? 'vict.' : 'win'}</Text>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Member Analytics */}
          {analytics.memberAnalytics && analytics.memberAnalytics.length > 0 ? (
            <View style={s.sectionCard}>
              <View style={s.sectionHeader}>
                <View style={[s.sectionIconBox, { backgroundColor: theme.primary + '15' }]}>
                  <MaterialIcons name="person-search" size={18} color={theme.primary} />
                </View>
                <Text style={s.sectionTitle}>{fr ? 'Analyse par membre' : 'Member Analytics'}</Text>
              </View>
              {analytics.memberAnalytics.map((ma, idx) => {
                const eloR = getEloRank(ma.elo);
                const roleColors: Record<string, string> = { 'Tireur': '#F97316', 'Pointeur': '#3B82F6', 'Milieu': '#8B5CF6' };
                const rc = roleColors[ma.role] || theme.textMuted;
                return (
                  <Pressable key={ma.id} style={s.maCard} onPress={() => router.push(`/player/${ma.id}`)}>
                    <View style={s.maCardHeader}>
                      <View style={s.maAvatar}>
                        {ma.avatar ? (
                          <Image source={{ uri: ma.avatar }} style={{ width: 40, height: 40, borderRadius: 12 }} contentFit="cover" />
                        ) : (
                          <Text style={s.maAvatarText}>{ma.name.charAt(0)}</Text>
                        )}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.maName} numberOfLines={1}>{ma.name}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: rc + '12', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                            <MaterialIcons name={ma.role === 'Tireur' ? 'gps-fixed' : ma.role === 'Pointeur' ? 'adjust' : 'swap-horiz'} size={10} color={rc} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: rc }}>{ma.role}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: eloR.color + '12', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 }}>
                            <MaterialIcons name={eloR.icon as any} size={10} color={eloR.color} />
                            <Text style={{ fontSize: 10, fontWeight: '700', color: eloR.color }}>{ma.elo}</Text>
                          </View>
                        </View>
                      </View>
                      {/* Contribution Score */}
                      <View style={{ alignItems: 'center', minWidth: 44 }}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: ma.contributionScore >= 70 ? theme.success : ma.contributionScore >= 40 ? '#D97706' : theme.textSecondary }}>{ma.contributionScore}</Text>
                        <Text style={{ fontSize: 8, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 }}>Score</Text>
                      </View>
                    </View>
                    {/* Stats row */}
                    <View style={s.maStatsRow}>
                      <View style={s.maStatItem}>
                        <Text style={s.maStatValue}>{ma.matchesPlayed}</Text>
                        <Text style={s.maStatLabel}>{fr ? 'Matchs' : 'Games'}</Text>
                      </View>
                      <View style={s.maStatItem}>
                        <Text style={[s.maStatValue, { color: theme.success }]}>{ma.winRate}%</Text>
                        <Text style={s.maStatLabel}>{fr ? 'Victoires' : 'Wins'}</Text>
                      </View>
                      <View style={s.maStatItem}>
                        <Text style={[s.maStatValue, { color: '#F97316' }]}>{ma.tirRate}%</Text>
                        <Text style={s.maStatLabel}>Tir</Text>
                      </View>
                      <View style={s.maStatItem}>
                        <Text style={[s.maStatValue, { color: '#3B82F6' }]}>{ma.pointRate}%</Text>
                        <Text style={s.maStatLabel}>Point</Text>
                      </View>
                      <View style={s.maStatItem}>
                        <Text style={[s.maStatValue, { color: theme.carreauColor }]}>{ma.carreaux}</Text>
                        <Text style={s.maStatLabel}>Carr.</Text>
                      </View>
                    </View>
                    {/* Activity sparkline (mini bars) */}
                    <View style={s.maActivityRow}>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: theme.textMuted, marginRight: 6 }}>{fr ? 'Activite' : 'Activity'}</Text>
                      {ma.monthlyMatches.map((mm, mi) => {
                        const maxMm = Math.max(...ma.monthlyMatches.map(x => x.count), 1);
                        const barH = Math.max(2, (mm.count / maxMm) * 20);
                        return (
                          <View key={mi} style={{ alignItems: 'center', flex: 1 }}>
                            <View style={{ width: 8, height: barH, borderRadius: 4, backgroundColor: mm.count > 0 ? theme.primary : theme.border, marginBottom: 2 }} />
                            <Text style={{ fontSize: 7, color: theme.textMuted }}>{mm.month.slice(0, 3)}</Text>
                          </View>
                        );
                      })}
                    </View>
                    {/* Role Trend */}
                    {ma.roleTrend && ma.roleTrend.some(rt => Object.values(rt.roles).some(v => v > 0)) ? (
                      <View style={s.maRoleTrendRow}>
                        <Text style={{ fontSize: 9, fontWeight: '600', color: theme.textMuted, marginRight: 6 }}>{fr ? 'Role' : 'Role'}</Text>
                        {ma.roleTrend.map((rt, ri) => {
                          const total = Object.values(rt.roles).reduce((a, b) => a + b, 0);
                          if (total === 0) return (
                            <View key={ri} style={{ alignItems: 'center', flex: 1 }}>
                              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: theme.border, marginBottom: 2 }} />
                              <Text style={{ fontSize: 7, color: theme.textMuted }}>{rt.month.slice(0, 3)}</Text>
                            </View>
                          );
                          const domColor = rt.dominant === 'Tireur' ? '#F97316' : rt.dominant === 'Pointeur' ? '#3B82F6' : '#8B5CF6';
                          return (
                            <View key={ri} style={{ alignItems: 'center', flex: 1 }}>
                              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: domColor + '25', alignItems: 'center', justifyContent: 'center' }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: domColor }} />
                              </View>
                              <Text style={{ fontSize: 7, color: theme.textMuted }}>{rt.month.slice(0, 3)}</Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Export Buttons - at the bottom */}
          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 14, marginBottom: 10, ...theme.shadows.card }}
            onPress={async () => {
              if (!analytics || !club) return;
              try {
                const rows: string[] = [];
                rows.push(`"${club.name} - ${fr ? 'Rapport Analytique' : 'Analytics Report'}"`);
                rows.push('');
                rows.push(`${fr ? 'Metrique' : 'Metric'},${fr ? 'Valeur' : 'Value'}`);
                rows.push(`${fr ? 'Membres' : 'Members'},${analytics.totalMembers}`);
                rows.push(`${fr ? 'Actifs ce mois' : 'Active this month'},${analytics.activeMembersThisMonth}`);
                rows.push(`${fr ? 'ELO moyen' : 'Avg ELO'},${analytics.avgElo}`);
                rows.push(`${fr ? 'Taux victoire' : 'Win Rate'},${analytics.avgWinRate}%`);
                rows.push(`${fr ? 'Total matchs' : 'Total Matches'},${analytics.totalMatches}`);
                rows.push(`${fr ? 'Tournois joues' : 'Tournaments Played'},${analytics.tournamentsPlayed}`);
                rows.push('');
                rows.push(`${fr ? 'ELO moyen national' : 'National Avg ELO'},${analytics.nationalAvgElo}`);
                rows.push(`${fr ? 'Taux victoire national' : 'National Win Rate'},${analytics.nationalAvgWinRate}%`);
                rows.push('');
                rows.push(`${fr ? 'Rang' : 'Rank'},${fr ? 'Joueur' : 'Player'},ELO,${fr ? 'Matchs' : 'Matches'},${fr ? 'Victoires' : 'Win Rate'}`);
                analytics.topMembers.forEach((m, i) => {
                  rows.push(`${i + 1},"${m.name}",${m.elo},${m.matches},${m.winRate}%`);
                });
                rows.push('');
                rows.push(`${fr ? 'Role' : 'Role'},${fr ? 'Joueurs' : 'Players'},%`);
                analytics.roleDistribution.forEach(r => {
                  rows.push(`${r.role},${r.count},${r.pct}%`);
                });
                rows.push('');
                rows.push(`${fr ? 'Mois' : 'Month'},${fr ? 'Matchs' : 'Matches'}`);
                analytics.matchesByMonth.forEach(m => {
                  rows.push(`${m.month},${m.count}`);
                });
                const csv = rows.join('\n');
                if (Platform.OS === 'web') {
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url; a.download = `analytics_${club.name.replace(/\s+/g, '_').slice(0, 20)}.csv`; a.click();
                  URL.revokeObjectURL(url);
                } else {
                  const FSModule = require('expo-file-system');
                  const SharingModule = require('expo-sharing');
                  const fileName = `analytics_${club.name.replace(/\s+/g, '_').slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.csv`;
                  const fileUri = `${FSModule.cacheDirectory}${fileName}`;
                  await FSModule.writeAsStringAsync(fileUri, csv, { encoding: FSModule.EncodingType.UTF8 });
                  if (await SharingModule.isAvailableAsync()) {
                    await SharingModule.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: fileName });
                  }
                }
              } catch (e) { console.log('CSV export error:', e); }
            }}
          >
            <MaterialIcons name="table-chart" size={20} color="#FFF" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{fr ? 'Exporter en CSV' : 'Export CSV'}</Text>
          </Pressable>

          <Pressable
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#6366F1', paddingVertical: 16, borderRadius: 14, marginBottom: 14, ...theme.shadows.card }}
            onPress={async () => {
              if (!analytics || !club) return;
              try {
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${club.name} - Analytics</title><style>body{font-family:system-ui;max-width:800px;margin:0 auto;padding:24px;color:#1E293B}h1{font-size:24px;margin-bottom:4px}h2{font-size:18px;margin-top:24px;margin-bottom:12px;color:#475569;border-bottom:2px solid #E2E8F0;padding-bottom:6px}.grid{display:flex;gap:16px;flex-wrap:wrap}.card{background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:16px;flex:1;min-width:140px;text-align:center}.card .value{font-size:28px;font-weight:800;color:#1E40AF}.card .label{font-size:12px;color:#64748B;margin-top:4px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{text-align:left;padding:8px 12px;border-bottom:1px solid #E2E8F0}th{background:#F1F5F9;font-weight:600;font-size:12px;color:#475569;text-transform:uppercase}td{font-size:14px}.footer{margin-top:32px;text-align:center;color:#94A3B8;font-size:11px}</style></head><body><h1>${club.name}</h1><p style="color:#64748B;margin-bottom:24px">${fr ? 'Rapport analytique' : 'Analytics Report'} - ${new Date().toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</p><div class="grid"><div class="card"><div class="value">${analytics.totalMembers}</div><div class="label">${fr ? 'Membres' : 'Members'}</div></div><div class="card"><div class="value">${analytics.avgElo}</div><div class="label">${fr ? 'ELO moyen' : 'Avg ELO'}</div></div><div class="card"><div class="value">${analytics.avgWinRate}%</div><div class="label">${fr ? 'Taux victoire' : 'Win Rate'}</div></div><div class="card"><div class="value">${analytics.totalMatches}</div><div class="label">${fr ? 'Matchs total' : 'Total Matches'}</div></div></div><h2>${fr ? 'Top 5 Joueurs' : 'Top 5 Players'}</h2><table><tr><th>#</th><th>${fr ? 'Joueur' : 'Player'}</th><th>ELO</th><th>${fr ? 'Matchs' : 'Matches'}</th><th>${fr ? 'Victoires' : 'Win Rate'}</th></tr>${analytics.topMembers.map((m, i) => `<tr><td>${i + 1}</td><td>${m.name}</td><td><strong>${m.elo}</strong></td><td>${m.matches}</td><td>${m.winRate}%</td></tr>`).join('')}</table><div class="footer">Ultimate Petanque - ${new Date().toISOString().slice(0, 10)}</div></body></html>`;
                if (Platform.OS === 'web') {
                  const pw = window.open('', '_blank');
                  if (pw) { pw.document.write(html); pw.document.close(); pw.print(); }
                } else {
                  const PrintModule = require('expo-print');
                  const SharingModule = require('expo-sharing');
                  const FSModule = require('expo-file-system');
                  const { uri } = await PrintModule.printToFileAsync({ html });
                  const fileName = `analytics_${club.name.replace(/\s+/g, '_').slice(0, 20)}_${new Date().toISOString().slice(0, 10)}.pdf`;
                  const newUri = `${FSModule.cacheDirectory}${fileName}`;
                  await FSModule.moveAsync({ from: uri, to: newUri });
                  if (await SharingModule.isAvailableAsync()) {
                    await SharingModule.shareAsync(newUri, { mimeType: 'application/pdf', dialogTitle: fileName });
                  }
                }
              } catch (e) { console.log('Analytics PDF export error:', e); }
            }}
          >
            <MaterialIcons name="picture-as-pdf" size={20} color="#FFF" />
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#FFF' }}>{fr ? 'Exporter en PDF' : 'Export PDF'}</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <MaterialIcons name="analytics" size={48} color={theme.textMuted} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: theme.textPrimary, marginTop: 12 }}>{fr ? 'Aucune donnee' : 'No data'}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  headerSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // Overview
  overviewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  overviewCard: { flex: 1, minWidth: '45%', backgroundColor: theme.surface, borderRadius: 16, padding: 16, alignItems: 'center', gap: 8, ...theme.shadows.card },
  overviewIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  overviewValue: { fontSize: 24, fontWeight: '800', color: theme.textPrimary },
  overviewLabel: { fontSize: 11, color: theme.textMuted, textAlign: 'center' },

  // Section
  sectionCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 14, ...theme.shadows.card },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  sectionIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },

  // Chart legend
  chartLegend: { alignItems: 'center', marginTop: 8 },
  chartLegendText: { fontSize: 12, color: theme.textMuted },

  // Members
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border + '60' },
  memberRank: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSecondary },
  memberRankText: { fontSize: 13, fontWeight: '700', color: theme.textSecondary },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  memberAvatarText: { fontSize: 14, fontWeight: '700', color: theme.primary },
  memberName: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  memberElo: { fontSize: 16, fontWeight: '800' },

  // Roles
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  roleIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  roleBarTrack: { height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden' },
  roleBarFill: { height: '100%', borderRadius: 3 },

  // Tournaments
  tournamentStat: { flex: 1, alignItems: 'center', backgroundColor: theme.backgroundSecondary, borderRadius: 12, paddingVertical: 16, gap: 4 },
  tournamentStatValue: { fontSize: 22, fontWeight: '800', color: theme.textPrimary },
  tournamentStatLabel: { fontSize: 10, color: theme.textMuted, textAlign: 'center' },

  // Member Analytics
  maCard: { backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  maCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  maAvatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  maAvatarText: { fontSize: 16, fontWeight: '700', color: theme.primary },
  maName: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  maStatsRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  maStatItem: { flex: 1, alignItems: 'center', backgroundColor: theme.surface, borderRadius: 8, paddingVertical: 6 },
  maStatValue: { fontSize: 13, fontWeight: '800', color: theme.textPrimary },
  maStatLabel: { fontSize: 8, fontWeight: '600', color: theme.textMuted, marginTop: 1 },
  maActivityRow: { flexDirection: 'row', alignItems: 'flex-end', paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border + '60' },
  maRoleTrendRow: { flexDirection: 'row' as const, alignItems: 'flex-end' as const, paddingTop: 6, borderTopWidth: 1, borderTopColor: theme.border + '60', marginTop: 4 },

  // Matchmaking
  mmCard: { backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: theme.border },
  mmRankBadge: { position: 'absolute' as const, top: 8, right: 8, backgroundColor: '#10B98115', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  mmRankText: { fontSize: 11, fontWeight: '800' as const, color: '#10B981' },
  mmPlayersRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 10, paddingRight: 40 },
  mmPlayer: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  mmPlayerAvatar: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.primary + '15', alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const },
  mmPlayerAvatarText: { fontSize: 13, fontWeight: '700' as const, color: theme.primary },
  mmPlayerName: { fontSize: 12, fontWeight: '600' as const, color: theme.textPrimary },
  mmRoleBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 2, paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 6 },
  mmRoleBadgeText: { fontSize: 9, fontWeight: '700' as const },
  mmBottomRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '60' },
  mmScoreCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: theme.border, alignItems: 'center' as const, justifyContent: 'center' as const },
  mmScoreText: { fontSize: 16, fontWeight: '900' as const },
  mmScoreLabel: { fontSize: 7, fontWeight: '600' as const, color: theme.textMuted, textTransform: 'uppercase' as const },
  mmStatsCol: { flex: 1 },
  mmStrengthBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, backgroundColor: '#22C55E08', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#22C55E15' },
  mmStrengthText: { fontSize: 9, fontWeight: '600' as const, color: '#22C55E' },
});
