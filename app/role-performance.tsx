/**
 * Role Performance Page
 *
 * Radar chart comparing Tireur/Pointeur/Milieu performance
 * with success rates, carreaux and points, filterable by period and format.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Dimensions,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useAppData } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import RadarChart from '@/components/ui/RadarChart';
import { getRoleColor, getRoleIcon, generateRoleExportData } from '@/services/roleAnalysisService';
import { useAuth } from '@/template';

type PeriodFilter = 'all' | '3months' | '6months' | 'year';
type FormatFilter = 'all' | 'Doublette' | 'Triplette';
type PlayerRoleType = 'Pointeur' | 'Milieu' | 'Tireur';

interface RoleAggregation {
  role: PlayerRoleType;
  matchCount: number;
  tirs: number;
  tirsSuccess: number;
  points: number;
  pointsSuccess: number;
  carreaux: number;
  wins: number;
  losses: number;
}

export default function RolePerformanceScreen() {
  const insets = useSafeAreaInsets();
  const { matches, selfPlayer } = useAppData();
  const { t, language } = useLanguage();
  const fr = language === 'fr';

  const [period, setPeriod] = useState<PeriodFilter>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [selectedRole, setSelectedRole] = useState<PlayerRoleType | null>(null);
  const [screenW, setScreenW] = useState(() => Dimensions.get('window').width || 375);
  React.useEffect(() => { const sub = Dimensions.addEventListener('change', ({ window }) => setScreenW(window.width)); return () => sub?.remove(); }, []);

  const radarSize = Math.min(screenW - 48, 280);
  const [exporting, setExporting] = useState(false);

  // Filter matches by period
  const filteredMatches = useMemo(() => {
    let items = matches;
    if (period !== 'all') {
      const now = Date.now();
      const ms = period === '3months' ? 90 * 86400000 : period === '6months' ? 180 * 86400000 : 365 * 86400000;
      items = items.filter(m => now - new Date(m.date).getTime() < ms);
    }
    if (formatFilter !== 'all') {
      items = items.filter(m => m.format === formatFilter);
    }
    return items;
  }, [matches, period, formatFilter]);

  // Aggregate stats per role for selfPlayer
  const roleData = useMemo(() => {
    if (!selfPlayer) return new Map<PlayerRoleType, RoleAggregation>();
    const agg = new Map<PlayerRoleType, RoleAggregation>();
    (['Pointeur', 'Milieu', 'Tireur'] as PlayerRoleType[]).forEach(r => {
      agg.set(r, { role: r, matchCount: 0, tirs: 0, tirsSuccess: 0, points: 0, pointsSuccess: 0, carreaux: 0, wins: 0, losses: 0 });
    });

    for (const match of filteredMatches) {
      // Find role in this match
      let playerRole: PlayerRoleType | null = null;
      let team: 'A' | 'B' | null = null;
      const aEntry = match.teamA.playerRoles?.find(r => r.playerId === selfPlayer.id);
      const bEntry = match.teamB.playerRoles?.find(r => r.playerId === selfPlayer.id);
      if (aEntry) { playerRole = aEntry.role as PlayerRoleType; team = 'A'; }
      else if (bEntry) { playerRole = bEntry.role as PlayerRoleType; team = 'B'; }
      if (!playerRole || !team) continue;

      const entry = agg.get(playerRole)!;
      entry.matchCount++;
      if (match.winner === team) entry.wins++;
      else entry.losses++;

      // Check for role segments first (mid-match role changes)
      const pa = match.playerActions?.find(a => a.playerId === selfPlayer.id);
      if (pa) {
        const segments = (pa as any).roleSegments as { role: PlayerRoleType; actions: typeof pa.actions }[] | undefined;
        if (segments && segments.length > 0) {
          for (const seg of segments) {
            const segEntry = agg.get(seg.role);
            if (!segEntry) continue;
            segEntry.tirs += seg.actions.tirs;
            segEntry.tirsSuccess += seg.actions.tirsSuccess;
            segEntry.points += seg.actions.points;
            segEntry.pointsSuccess += seg.actions.pointsSuccess;
            segEntry.carreaux += seg.actions.carreaux;
          }
        } else {
          // No segments, attribute all actions to the match role
          entry.tirs += pa.actions.tirs;
          entry.tirsSuccess += pa.actions.tirsSuccess;
          entry.points += pa.actions.points;
          entry.pointsSuccess += pa.actions.pointsSuccess;
          entry.carreaux += pa.actions.carreaux;
        }
      }
    }
    return agg;
  }, [filteredMatches, selfPlayer]);

  const roles = useMemo(() => {
    return (['Tireur', 'Pointeur', 'Milieu'] as PlayerRoleType[]).map(role => {
      const d = roleData.get(role)!;
      const tirRate = d.tirs > 0 ? Math.round((d.tirsSuccess / d.tirs) * 100) : 0;
      const pointRate = d.points > 0 ? Math.round((d.pointsSuccess / d.points) * 100) : 0;
      const carreauRate = d.tirs > 0 ? Math.round((d.carreaux / d.tirs) * 100) : 0;
      const winRate = d.matchCount > 0 ? Math.round((d.wins / d.matchCount) * 100) : 0;
      return { ...d, tirRate, pointRate, carreauRate, winRate };
    });
  }, [roleData]);

  const totalMatches = roles.reduce((s, r) => s + r.matchCount, 0);

  const handleExport = useCallback(async () => {
    if (!selfPlayer || totalMatches === 0) {
      Alert.alert(fr ? 'Pas de donnees' : 'No data', fr ? 'Jouez des matchs pour exporter.' : 'Play matches to export.');
      return;
    }
    setExporting(true);
    try {
      const exportData = generateRoleExportData(selfPlayer.id, filteredMatches);
      const sep = ',';
      const headers = [fr ? 'Role' : 'Role', fr ? 'Matchs' : 'Matches', fr ? 'Victoires' : 'Wins', fr ? 'Defaites' : 'Losses', fr ? 'Taux Victoire' : 'Win Rate', fr ? 'Taux Tir' : 'Shot Rate', fr ? 'Taux Point' : 'Point Rate', fr ? 'Taux Carreau' : 'Carreau Rate', fr ? 'Tirs' : 'Shots', fr ? 'Tirs Reussis' : 'Shots Hit', 'Points', fr ? 'Points Reussis' : 'Points Hit', 'Carreaux'];
      const rows = exportData.map(r => [r.role, r.matchCount, r.wins, r.losses, `${r.winRate}%`, `${r.tirRate}%`, `${r.pointRate}%`, `${r.carreauRate}%`, r.tirs, r.tirsSuccess, r.points, r.pointsSuccess, r.carreaux].join(sep));
      const csv = '\ufeff' + [headers.join(sep), ...rows].join('\n');

      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = `role_performance_${new Date().toISOString().slice(0, 10)}.csv`; link.click();
        URL.revokeObjectURL(url);
      } else {
        const ExpoFS = require('expo-file-system');
        const ExpoSharing = require('expo-sharing');
        const fileName = `role_performance_${new Date().toISOString().slice(0, 10)}.csv`;
        const fileUri = `${ExpoFS.cacheDirectory}${fileName}`;
        await ExpoFS.writeAsStringAsync(fileUri, csv, { encoding: ExpoFS.EncodingType.UTF8 });
        if (await ExpoSharing.isAvailableAsync()) {
          await ExpoSharing.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: fileName });
        }
      }
    } catch (e) {
      console.log('Export error:', e);
    } finally {
      setExporting(false);
    }
  }, [selfPlayer, filteredMatches, totalMatches, fr]);
  const bestRole = [...roles].sort((a, b) => {
    const scoreA = a.tirRate * 0.3 + a.pointRate * 0.3 + a.winRate * 0.3 + a.carreauRate * 0.1;
    const scoreB = b.tirRate * 0.3 + b.pointRate * 0.3 + b.winRate * 0.3 + b.carreauRate * 0.1;
    return scoreB - scoreA;
  })[0];

  // Radar chart data
  const radarData = useMemo(() => {
    if (selectedRole) {
      const r = roles.find(ro => ro.role === selectedRole);
      if (!r) return [];
      return [
        { label: fr ? 'Tir' : 'Shot', value: r.tirRate, color: getRoleColor('Tireur') },
        { label: fr ? 'Point' : 'Point', value: r.pointRate, color: getRoleColor('Pointeur') },
        { label: fr ? 'Carreau' : 'Carreau', value: r.carreauRate, color: '#D97706' },
        { label: fr ? 'Victoire' : 'Win', value: r.winRate, color: '#10B981' },
        { label: fr ? 'Volume' : 'Volume', value: Math.min(100, r.matchCount * 10), color: '#64748B' },
      ];
    }
    // Compare all 3 roles - use best metric per dimension
    return [
      { label: fr ? 'Tir' : 'Shot', value: Math.max(...roles.map(r => r.tirRate), 0) },
      { label: fr ? 'Point' : 'Point', value: Math.max(...roles.map(r => r.pointRate), 0) },
      { label: fr ? 'Carreau' : 'Carreau', value: Math.max(...roles.map(r => r.carreauRate), 0) },
      { label: fr ? 'Victoire' : 'Win', value: Math.max(...roles.map(r => r.winRate), 0) },
      { label: fr ? 'Matchs' : 'Matches', value: Math.min(100, totalMatches * 5) },
    ];
  }, [roles, selectedRole, fr, totalMatches]);

  const radarFill = selectedRole ? getRoleColor(selectedRole) : theme.primary;

  return (
    <SafeAreaView edges={['top']} style={st.container}>
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>{fr ? 'Performance par Role' : 'Role Performance'}</Text>
        <Pressable style={st.exportBtn} onPress={handleExport} disabled={exporting}>
          {exporting ? <ActivityIndicator size="small" color={theme.primary} /> : <MaterialIcons name="file-download" size={22} color={theme.primary} />}
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Period Filter */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.filterRow}>
            {([
              { id: 'all' as PeriodFilter, label: fr ? 'Tout' : 'All' },
              { id: '3months' as PeriodFilter, label: fr ? '3 mois' : '3 months' },
              { id: '6months' as PeriodFilter, label: fr ? '6 mois' : '6 months' },
              { id: 'year' as PeriodFilter, label: fr ? '1 an' : '1 year' },
            ]).map(f => (
              <Pressable key={f.id} style={[st.filterPill, period === f.id && st.filterPillActive]} onPress={() => { Haptics.selectionAsync(); setPeriod(f.id); }}>
                <Text style={[st.filterPillText, period === f.id && st.filterPillTextActive]}>{f.label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Format Filter */}
        <Animated.View entering={FadeInDown.duration(300).delay(50)}>
          <View style={st.formatRow}>
            {([
              { id: 'all' as FormatFilter, label: fr ? 'Tous formats' : 'All formats', icon: 'select-all' },
              { id: 'Doublette' as FormatFilter, label: t('formats', 'Doublette'), icon: 'people' },
              { id: 'Triplette' as FormatFilter, label: t('formats', 'Triplette'), icon: 'groups' },
            ]).map(f => (
              <Pressable key={f.id} style={[st.formatChip, formatFilter === f.id && st.formatChipActive]} onPress={() => { Haptics.selectionAsync(); setFormatFilter(f.id); }}>
                <MaterialIcons name={f.icon as any} size={14} color={formatFilter === f.id ? '#FFF' : theme.textSecondary} />
                <Text style={[st.formatChipText, formatFilter === f.id && st.formatChipTextActive]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>

        {totalMatches === 0 ? (
          <View style={st.emptyState}>
            <MaterialIcons name="bar-chart" size={56} color={theme.textMuted} />
            <Text style={st.emptyTitle}>{fr ? 'Pas assez de donnees' : 'Not enough data'}</Text>
            <Text style={st.emptyText}>{fr ? 'Jouez des matchs en Doublette ou Triplette avec des roles pour voir vos stats.' : 'Play Doubles or Triples matches with roles to see your stats.'}</Text>
          </View>
        ) : (
          <>
            {/* Best Role Banner */}
            {bestRole && bestRole.matchCount > 0 ? (
              <Animated.View entering={FadeInDown.duration(300).delay(100)}>
                <View style={[st.bestRoleBanner, { borderColor: getRoleColor(bestRole.role) + '30', backgroundColor: getRoleColor(bestRole.role) + '06' }]}>
                  <View style={[st.bestRoleIcon, { backgroundColor: getRoleColor(bestRole.role) + '15' }]}>
                    <MaterialIcons name={getRoleIcon(bestRole.role) as any} size={28} color={getRoleColor(bestRole.role)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.bestRoleLabel}>{fr ? 'Meilleur role' : 'Best Role'}</Text>
                    <Text style={[st.bestRoleName, { color: getRoleColor(bestRole.role) }]}>{t('roles', bestRole.role)}</Text>
                    <Text style={st.bestRoleSub}>
                      {bestRole.matchCount} {fr ? 'matchs' : 'matches'} {"•"} {bestRole.winRate}% {fr ? 'victoires' : 'wins'}
                    </Text>
                  </View>
                  <View style={[st.bestRoleScore, { backgroundColor: getRoleColor(bestRole.role) }]}>
                    <Text style={st.bestRoleScoreText}>{bestRole.tirRate + bestRole.pointRate > 0 ? Math.round((bestRole.tirRate + bestRole.pointRate) / 2) : 0}%</Text>
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {/* Radar Chart */}
            <Animated.View entering={FadeInDown.duration(300).delay(150)} style={st.radarCard}>
              <Text style={st.radarTitle}>{selectedRole ? t('roles', selectedRole) : (fr ? 'Vue globale' : 'Overview')}</Text>
              <View style={st.radarWrap}>
                {radarData.length >= 3 ? (
                  <RadarChart data={radarData} size={radarSize} fillColor={radarFill} strokeColor={radarFill} fillOpacity={0.2} />
                ) : null}
              </View>
              {/* Role selector */}
              <View style={st.roleSelectorRow}>
                <Pressable
                  style={[st.roleSelectorBtn, !selectedRole && st.roleSelectorBtnActive]}
                  onPress={() => { Haptics.selectionAsync(); setSelectedRole(null); }}
                >
                  <MaterialIcons name="radar" size={14} color={!selectedRole ? '#FFF' : theme.textMuted} />
                  <Text style={[st.roleSelectorText, !selectedRole && { color: '#FFF' }]}>{fr ? 'Tous' : 'All'}</Text>
                </Pressable>
                {(['Tireur', 'Pointeur', 'Milieu'] as PlayerRoleType[]).map(role => {
                  const active = selectedRole === role;
                  const rc = getRoleColor(role);
                  return (
                    <Pressable
                      key={role}
                      style={[st.roleSelectorBtn, active && { backgroundColor: rc, borderColor: rc }]}
                      onPress={() => { Haptics.selectionAsync(); setSelectedRole(active ? null : role); }}
                    >
                      <MaterialIcons name={getRoleIcon(role) as any} size={14} color={active ? '#FFF' : rc} />
                      <Text style={[st.roleSelectorText, active && { color: '#FFF' }, !active && { color: rc }]}>{t('roles', role).substring(0, 1)}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Animated.View>

            {/* Role Cards */}
            {roles.map((role, idx) => {
              const rc = getRoleColor(role.role);
              const hasData = role.matchCount > 0;
              return (
                <Animated.View key={role.role} entering={FadeInDown.duration(300).delay(200 + idx * 60)}>
                  <View style={[st.roleCard, { borderColor: rc + '20' }]}>
                    <View style={st.roleCardHeader}>
                      <View style={[st.roleCardIcon, { backgroundColor: rc + '15' }]}>
                        <MaterialIcons name={getRoleIcon(role.role) as any} size={22} color={rc} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[st.roleCardName, { color: rc }]}>{t('roles', role.role)}</Text>
                        <Text style={st.roleCardSub}>
                          {role.matchCount} {fr ? 'matchs' : 'matches'} {"•"} {role.wins}V / {role.losses}D
                        </Text>
                      </View>
                      {hasData ? (
                        <View style={[st.roleCardWinBadge, { backgroundColor: role.winRate >= 50 ? '#DCFCE7' : '#FEF2F2' }]}>
                          <Text style={[st.roleCardWinText, { color: role.winRate >= 50 ? '#10B981' : '#EF4444' }]}>{role.winRate}%</Text>
                        </View>
                      ) : null}
                    </View>

                    {hasData ? (
                      <View style={st.roleCardStats}>
                        {/* Tir */}
                        <View style={st.roleStatRow}>
                          <View style={st.roleStatLabelGroup}>
                            <MaterialIcons name="gps-fixed" size={12} color="#F97316" />
                            <Text style={st.roleStatLabel}>{fr ? 'Tir' : 'Shot'}</Text>
                          </View>
                          <View style={st.roleStatBarBg}>
                            <View style={[st.roleStatBarFill, { width: `${Math.max(3, role.tirRate)}%`, backgroundColor: '#F97316' }]} />
                          </View>
                          <Text style={[st.roleStatValue, { color: '#F97316' }]}>{role.tirRate}%</Text>
                          <Text style={st.roleStatCount}>{role.tirsSuccess}/{role.tirs}</Text>
                        </View>

                        {/* Point */}
                        <View style={st.roleStatRow}>
                          <View style={st.roleStatLabelGroup}>
                            <MaterialIcons name="adjust" size={12} color="#3B82F6" />
                            <Text style={st.roleStatLabel}>{fr ? 'Point' : 'Point'}</Text>
                          </View>
                          <View style={st.roleStatBarBg}>
                            <View style={[st.roleStatBarFill, { width: `${Math.max(3, role.pointRate)}%`, backgroundColor: '#3B82F6' }]} />
                          </View>
                          <Text style={[st.roleStatValue, { color: '#3B82F6' }]}>{role.pointRate}%</Text>
                          <Text style={st.roleStatCount}>{role.pointsSuccess}/{role.points}</Text>
                        </View>

                        {/* Carreau */}
                        <View style={st.roleStatRow}>
                          <View style={st.roleStatLabelGroup}>
                            <MaterialIcons name="stars" size={12} color="#D97706" />
                            <Text style={st.roleStatLabel}>{fr ? 'Carreau' : 'Carreau'}</Text>
                          </View>
                          <View style={st.roleStatBarBg}>
                            <View style={[st.roleStatBarFill, { width: `${Math.max(3, role.carreauRate)}%`, backgroundColor: '#D97706' }]} />
                          </View>
                          <Text style={[st.roleStatValue, { color: '#D97706' }]}>{role.carreauRate}%</Text>
                          <Text style={st.roleStatCount}>{role.carreaux}</Text>
                        </View>
                      </View>
                    ) : (
                      <View style={st.roleCardEmpty}>
                        <MaterialIcons name="sports" size={20} color={theme.textMuted} />
                        <Text style={st.roleCardEmptyText}>{fr ? 'Pas de matchs dans ce role' : 'No matches in this role'}</Text>
                      </View>
                    )}
                  </View>
                </Animated.View>
              );
            })}

            {/* Role Distribution */}
            <Animated.View entering={FadeInDown.duration(300).delay(400)}>
              <View style={st.distCard}>
                <Text style={st.distTitle}>{fr ? 'REPARTITION DES MATCHS' : 'MATCH DISTRIBUTION'}</Text>
                <View style={st.distBarRow}>
                  {roles.filter(r => r.matchCount > 0).map(role => {
                    const pct = totalMatches > 0 ? Math.round((role.matchCount / totalMatches) * 100) : 0;
                    return (
                      <View key={role.role} style={[st.distBarSegment, { flex: Math.max(1, role.matchCount), backgroundColor: getRoleColor(role.role) }]}>
                        <Text style={st.distBarText}>{pct}%</Text>
                      </View>
                    );
                  })}
                </View>
                <View style={st.distLegend}>
                  {roles.map(role => (
                    <View key={role.role} style={st.distLegendItem}>
                      <View style={[st.distLegendDot, { backgroundColor: getRoleColor(role.role) }]} />
                      <Text style={st.distLegendLabel}>{t('roles', role.role)}</Text>
                      <Text style={st.distLegendCount}>{role.matchCount}</Text>
                    </View>
                  ))}
                </View>
              </View>
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  filterRow: { gap: 8, paddingBottom: 12 },
  filterPill: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  filterPillActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  filterPillText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  filterPillTextActive: { color: '#FFF' },
  formatRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  formatChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  formatChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  formatChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  formatChipTextActive: { color: '#FFF' },
  emptyState: { alignItems: 'center', paddingVertical: 56, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  emptyText: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  // Best role
  bestRoleBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 16, borderWidth: 1.5 },
  bestRoleIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bestRoleLabel: { fontSize: 10, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' },
  bestRoleName: { fontSize: 20, fontWeight: '800', marginTop: 2 },
  bestRoleSub: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  bestRoleScore: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  bestRoleScoreText: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  // Radar
  radarCard: { backgroundColor: theme.surface, borderRadius: 18, padding: 20, marginBottom: 16, alignItems: 'center', ...theme.shadows.card },
  radarTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  radarWrap: { alignItems: 'center', marginBottom: 12 },
  roleSelectorRow: { flexDirection: 'row', gap: 8 },
  roleSelectorBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: theme.backgroundSecondary, borderWidth: 1.5, borderColor: theme.border },
  roleSelectorBtnActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  roleSelectorText: { fontSize: 12, fontWeight: '700', color: theme.textSecondary },
  // Role cards
  roleCard: { backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1.5, ...theme.shadows.card },
  roleCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  roleCardIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  roleCardName: { fontSize: 17, fontWeight: '800' },
  roleCardSub: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  roleCardWinBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  roleCardWinText: { fontSize: 14, fontWeight: '800' },
  roleCardStats: { gap: 8 },
  roleStatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roleStatLabelGroup: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 60 },
  roleStatLabel: { fontSize: 11, fontWeight: '600', color: theme.textSecondary },
  roleStatBarBg: { flex: 1, height: 10, backgroundColor: theme.backgroundSecondary, borderRadius: 5, overflow: 'hidden' },
  roleStatBarFill: { height: '100%', borderRadius: 5 },
  roleStatValue: { fontSize: 13, fontWeight: '800', width: 36, textAlign: 'right' },
  roleStatCount: { fontSize: 10, fontWeight: '600', color: theme.textMuted, width: 34, textAlign: 'right' },
  roleCardEmpty: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 20 },
  roleCardEmptyText: { fontSize: 13, color: theme.textMuted },
  // Distribution
  distCard: { backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 16, ...theme.shadows.card },
  distTitle: { fontSize: 10, fontWeight: '700', color: theme.textMuted, letterSpacing: 1, marginBottom: 12 },
  distBarRow: { flexDirection: 'row', height: 28, borderRadius: 14, overflow: 'hidden', gap: 2, marginBottom: 12 },
  distBarSegment: { alignItems: 'center', justifyContent: 'center', borderRadius: 14 },
  distBarText: { fontSize: 10, fontWeight: '800', color: '#FFF' },
  distLegend: { flexDirection: 'row', justifyContent: 'space-around' },
  distLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  distLegendDot: { width: 8, height: 8, borderRadius: 4 },
  distLegendLabel: { fontSize: 11, fontWeight: '600', color: theme.textSecondary },
  distLegendCount: { fontSize: 11, fontWeight: '800', color: theme.textPrimary },
  exportBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
