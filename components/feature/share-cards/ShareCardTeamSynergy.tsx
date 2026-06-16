/**
 * ShareCardTeamSynergy — Visual share card for team synergy score.
 * Shows team members, synergy breakdown, win rate sparkline, tournament info.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import ShareCardWatermark from './ShareCardWatermark';

interface TeamMember {
  name: string;
  isCaptain?: boolean;
}

interface SynergyBreakdown {
  winRate: number;
  frequency: number;
  elo: number;
  role: number;
}

interface Props {
  teamMembers: TeamMember[];
  synergyScore: number;
  synergyLabel: string;
  synergyColor: string;
  breakdown: SynergyBreakdown;
  winRateHistory: number[];
  tournamentName: string;
  tournamentDate: string;
  tournamentFormat: string;
  playerName: string;
  language?: string;
  colorTheme?: 'dark' | 'light';
  format?: 'square' | 'story' | 'landscape';
}

export default function ShareCardTeamSynergy({
  teamMembers,
  synergyScore,
  synergyLabel,
  synergyColor,
  breakdown,
  winRateHistory,
  tournamentName,
  tournamentDate,
  tournamentFormat,
  playerName,
  language = 'fr',
  colorTheme = 'dark',
  format = 'square',
}: Props) {
  const fr = language === 'fr';
  const isDark = colorTheme === 'dark';
  const bgColor = isDark ? '#0F172A' : '#FFFFFF';
  const textColor = isDark ? '#F8FAFC' : '#0F172A';
  const subtextColor = isDark ? 'rgba(255,255,255,0.5)' : '#64748B';
  const cardBg = isDark ? 'rgba(255,255,255,0.06)' : '#F8FAFC';
  const borderColor = isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0';

  const isStory = format === 'story';
  const isLandscape = format === 'landscape';
  const cardWidth = isStory ? 360 : isLandscape ? 560 : 400;
  const cardHeight = isStory ? 640 : isLandscape ? 315 : 400;
  const lPad = isLandscape ? 14 : 20;

  const MEMBER_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  const breakdownItems = [
    { label: fr ? 'Victoires' : 'Win Rate', value: breakdown.winRate, max: 30, color: '#22C55E', icon: 'emoji-events' as const },
    { label: fr ? 'Frequence' : 'Frequency', value: breakdown.frequency, max: 25, color: '#3B82F6', icon: 'sports' as const },
    { label: 'ELO', value: breakdown.elo, max: 25, color: '#F59E0B', icon: 'leaderboard' as const },
    { label: fr ? 'Role' : 'Role', value: breakdown.role, max: 20, color: '#7C3AED', icon: 'swap-horiz' as const },
  ];

  return (
    <View style={[st.card, { width: cardWidth, height: cardHeight, backgroundColor: bgColor }]}>
      {/* Header */}
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={[st.title, { color: textColor }]}>{fr ? 'Synergie d\'equipe' : 'Team Synergy'}</Text>
          <Text style={[st.subtitle, { color: subtextColor }]} numberOfLines={1}>{tournamentName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <View style={[st.formatChip, { backgroundColor: synergyColor + '15' }]}>
              <Text style={[st.formatChipText, { color: synergyColor }]}>{tournamentFormat}</Text>
            </View>
            {tournamentDate ? (
              <Text style={[st.dateText, { color: subtextColor }]}>
                {new Date(tournamentDate).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            ) : null}
          </View>
        </View>
        {/* Score ring */}
        <View style={[st.scoreRing, { borderColor: synergyColor }]}>
          <Text style={[st.scoreNum, { color: synergyColor }]}>{synergyScore}</Text>
          <Text style={[st.scoreLabel, { color: synergyColor }]}>{synergyLabel}</Text>
        </View>
      </View>

      {/* Team members */}
      <View style={[st.membersRow, { backgroundColor: cardBg, borderColor }]}>
        {teamMembers.map((member, i) => (
          <View key={i} style={st.memberItem}>
            <View style={[st.memberAvatar, { backgroundColor: MEMBER_COLORS[i % 5] }]}>
              <Text style={st.memberInitial}>{member.name.charAt(0)}</Text>
            </View>
            <Text style={[st.memberName, { color: textColor }]} numberOfLines={1}>{member.name}</Text>
            {member.isCaptain ? (
              <MaterialIcons name="star" size={12} color="#F59E0B" />
            ) : null}
          </View>
        ))}
      </View>

      {/* Breakdown bars */}
      <View style={[st.breakdownSection, { backgroundColor: cardBg, borderColor }]}>
        {breakdownItems.map((item, i) => (
          <View key={i} style={st.breakdownRow}>
            <MaterialIcons name={item.icon} size={12} color={item.color} />
            <Text style={[st.breakdownLabel, { color: subtextColor }]}>{item.label}</Text>
            <View style={[st.barTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0' }]}>
              <View style={[st.barFill, { width: `${(item.value / item.max) * 100}%`, backgroundColor: item.color }]} />
            </View>
            <Text style={[st.breakdownValue, { color: item.color }]}>{item.value}/{item.max}</Text>
          </View>
        ))}
      </View>

      {/* Sparkline */}
      {winRateHistory.length >= 2 ? (
        <View style={[st.sparklineWrap, { backgroundColor: cardBg, borderColor }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <MaterialIcons name="show-chart" size={12} color="#3B82F6" />
            <Text style={[st.sparklineTitle, { color: subtextColor }]}>{fr ? 'Taux de victoire' : 'Win Rate'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 32, gap: 2 }}>
            {winRateHistory.map((val, i) => {
              const barH = Math.max(4, (val / 100) * 32);
              const barColor = val >= 60 ? '#22C55E' : val >= 40 ? '#F59E0B' : '#EF4444';
              return (
                <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end' }}>
                  <View style={{ width: '80%', height: barH, backgroundColor: barColor, borderRadius: 2, opacity: i === winRateHistory.length - 1 ? 1 : 0.5 }} />
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
            <Text style={{ fontSize: 8, color: subtextColor }}>{fr ? 'Ancien' : 'Old'}</Text>
            <Text style={{ fontSize: 8, fontWeight: '700', color: winRateHistory[winRateHistory.length - 1] >= 60 ? '#22C55E' : '#F59E0B' }}>
              {winRateHistory[winRateHistory.length - 1]}%
            </Text>
            <Text style={{ fontSize: 8, color: subtextColor }}>{fr ? 'Recent' : 'Recent'}</Text>
          </View>
        </View>
      ) : null}

      <ShareCardWatermark variant={isDark ? 'light' : 'dark'} size="sm" />
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 24, overflow: 'hidden', padding: 20, paddingBottom: 48, position: 'relative' as const },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 14 },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontWeight: '500', marginTop: 2 },
  formatChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  formatChipText: { fontSize: 10, fontWeight: '700' },
  dateText: { fontSize: 11, fontWeight: '500' },
  scoreRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  scoreNum: { fontSize: 22, fontWeight: '900' },
  scoreLabel: { fontSize: 8, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  membersRow: { flexDirection: 'row', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 10 },
  memberItem: { flex: 1, alignItems: 'center', gap: 4 },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  memberInitial: { fontSize: 14, fontWeight: '800', color: '#FFF' },
  memberName: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  breakdownSection: { padding: 12, borderRadius: 14, borderWidth: 1, gap: 8, marginBottom: 10 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownLabel: { fontSize: 10, fontWeight: '600', width: 62 },
  barTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  breakdownValue: { fontSize: 9, fontWeight: '800', width: 30, textAlign: 'right' },
  sparklineWrap: { padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 6 },
  sparklineTitle: { fontSize: 10, fontWeight: '600' },
});
