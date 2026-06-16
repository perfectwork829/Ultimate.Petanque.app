
/**
 * ShareCardSeasonComparison — Compares current vs previous season for social sharing.
 * Shows deltas for ELO, wins, win rate, carreaux, peak, matches.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';

interface SeasonStats {
  year: number;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  carreaux: number;
  elo: number;
  peak: number;
}

interface Props {
  playerName?: string;
  eloColor?: string;
  eloRankLabel?: string;
  eloIcon?: string;
  current: SeasonStats;
  previous: SeasonStats;
  clubName?: string;
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

function DeltaBadge({ value, suffix, compact }: { value: number; suffix?: string; compact?: boolean }) {
  const isUp = value > 0;
  const isEqual = value === 0;
  const color = isUp ? '#22C55E' : isEqual ? '#94A3B8' : '#EF4444';
  const bg = isUp ? '#22C55E15' : isEqual ? '#94A3B815' : '#EF444415';
  const fs = compact ? 9 : 11;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: bg, paddingHorizontal: compact ? 5 : 7, paddingVertical: compact ? 2 : 3, borderRadius: 8 }}>
      {!isEqual ? <MaterialIcons name={isUp ? 'arrow-upward' : 'arrow-downward'} size={compact ? 8 : 10} color={color} /> : null}
      <Text style={{ fontSize: fs, fontWeight: '700', color }}>{isEqual ? '=' : `${isUp ? '+' : ''}${value}${suffix || ''}`}</Text>
    </View>
  );
}

function CompRow({ label, icon, color, current, previous, suffix, compact }: {
  label: string; icon: string; color: string; current: number | string; previous: number | string; suffix?: string; compact?: boolean;
}) {
  const diff = typeof current === 'number' && typeof previous === 'number' ? current - previous : 0;
  const fs = compact ? 11 : 13;
  const valFs = compact ? 14 : 17;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 6 : 8, paddingVertical: compact ? 5 : 7, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
      <View style={{ width: compact ? 22 : 26, height: compact ? 22 : 26, borderRadius: compact ? 7 : 8, backgroundColor: color + '15', alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcons name={icon as any} size={compact ? 11 : 13} color={color} />
      </View>
      <Text style={{ flex: 1, fontSize: compact ? 10 : 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)' }}>{label}</Text>
      <Text style={{ fontSize: valFs, fontWeight: '800', color }}>{current}{suffix || ''}</Text>
      <Text style={{ fontSize: compact ? 8 : 10, color: 'rgba(255,255,255,0.3)' }}>vs</Text>
      <Text style={{ fontSize: compact ? 10 : 12, fontWeight: '600', color: 'rgba(255,255,255,0.45)' }}>{previous}{suffix || ''}</Text>
      <DeltaBadge value={diff} suffix={suffix} compact={compact} />
    </View>
  );
}

export default function ShareCardSeasonComparison({
  playerName, eloColor, eloRankLabel, eloIcon,
  current, previous, clubName,
  language = 'fr', colorTheme = 'dark', format = 'square',
}: Props) {
  const fr = language === 'fr';
  const ct = CARD_COLOR_THEMES[colorTheme];
  const isStory = format === 'story';
  const isLandscape = format === 'landscape';
  const ec = eloColor || '#8B5CF6';

  const metrics = [
    { label: fr ? 'Matchs joues' : 'Matches Played', icon: 'sports', color: '#60A5FA', c: current.matches, p: previous.matches },
    { label: fr ? 'Victoires' : 'Wins', icon: 'emoji-events', color: '#22C55E', c: current.wins, p: previous.wins },
    { label: fr ? 'Taux de victoire' : 'Win Rate', icon: 'trending-up', color: '#F59E0B', c: current.winRate, p: previous.winRate, suffix: '%' },
    { label: 'ELO', icon: 'diamond', color: ec, c: current.elo, p: previous.elo },
    { label: fr ? 'Pic ELO' : 'Peak ELO', icon: 'arrow-upward', color: '#D97706', c: current.peak, p: previous.peak },
    { label: 'Carreaux', icon: 'stars', color: '#A78BFA', c: current.carreaux, p: previous.carreaux },
  ];

  // Overall improvement score
  const improvements = metrics.filter(m => m.c > m.p).length;
  const improvementLabel = improvements >= 5 ? (fr ? 'Saison exceptionnelle' : 'Outstanding season')
    : improvements >= 3 ? (fr ? 'Bonne progression' : 'Good progress')
    : improvements >= 1 ? (fr ? 'Progression mixte' : 'Mixed progress')
    : (fr ? 'Saison difficile' : 'Tough season');
  const improvementColor = improvements >= 5 ? '#22C55E' : improvements >= 3 ? '#F59E0B' : improvements >= 1 ? '#60A5FA' : '#EF4444';

  // === LANDSCAPE ===
  if (isLandscape) {
    return (
      <View style={st.card}>
        <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: 10, paddingBottom: 44, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 }}>
            <MaterialIcons name="compare-arrows" size={9} color={ct.accent} />
            <Text style={{ fontSize: 7, fontWeight: '800', letterSpacing: 1, color: ct.accent }}>
              {fr ? `SAISON ${current.year} vs ${previous.year}` : `SEASON ${current.year} vs ${previous.year}`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center', paddingRight: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: ct.textPrimary, marginBottom: 2 }}>{playerName || (fr ? 'Joueur' : 'Player')}</Text>
              {clubName ? <Text style={{ fontSize: 7, color: ct.textSecondary, marginBottom: 2 }}>{clubName}</Text> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: improvementColor + '20', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start' }}>
                <MaterialIcons name={improvements >= 3 ? 'trending-up' : 'trending-flat'} size={10} color={improvementColor} />
                <Text style={{ fontSize: 8, fontWeight: '700', color: improvementColor }}>{improvementLabel}</Text>
              </View>
            </View>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 6 }} />
            <View style={{ flex: 1.5, justifyContent: 'center' }}>
              {metrics.map((m, i) => (
                <CompRow key={i} label={m.label} icon={m.icon} color={m.color} current={m.c} previous={m.p} suffix={m.suffix} compact />
              ))}
            </View>
          </View>
          {/* Content complete indicator */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3, marginTop: 2 }}>
            <MaterialIcons name="verified" size={8} color="rgba(255,255,255,0.2)" />
            <Text style={{ fontSize: 6, fontWeight: '600', color: 'rgba(255,255,255,0.2)' }}>{fr ? 'Contenu complet' : 'Complete'}</Text>
          </View>
          <ShareCardWatermark variant="light" size="sm" />
        </LinearGradient>
      </View>
    );
  }

  // === STORY / SQUARE ===
  const pad = isStory ? 22 : 14;
  const compact = !isStory;

  return (
    <View style={st.card}>
      <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: pad, paddingBottom: isStory ? 56 : 48, justifyContent: 'flex-start' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: isStory ? 10 : 6 }}>
          <MaterialIcons name="compare-arrows" size={isStory ? 14 : 11} color={ct.accent} />
          <Text style={{ fontSize: isStory ? 10 : 8, fontWeight: '800', letterSpacing: 1.5, color: ct.accent }}>
            {fr ? `SAISON ${current.year} vs ${previous.year}` : `SEASON ${current.year} vs ${previous.year}`}
          </Text>
        </View>

        {/* Player + ELO */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: isStory ? 12 : 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: isStory ? 20 : 16, fontWeight: '800', color: ct.textPrimary }} numberOfLines={1}>{playerName || (fr ? 'Joueur' : 'Player')}</Text>
            {clubName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                <MaterialIcons name="home" size={9} color={ct.textSecondary} />
                <Text style={{ fontSize: 9, fontWeight: '600', color: ct.textSecondary }} numberOfLines={1}>{clubName}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: ec + '20', paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10 }}>
              <MaterialIcons name={(eloIcon as any) || 'diamond'} size={11} color={ec} />
              <Text style={{ fontSize: 15, fontWeight: '900', color: ec }}>{current.elo}</Text>
            </View>
            {eloRankLabel ? <Text style={{ fontSize: 7, fontWeight: '700', color: ec, marginTop: 2 }}>{eloRankLabel}</Text> : null}
          </View>
        </View>

        {/* Improvement badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: improvementColor + '15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, alignSelf: 'flex-start', marginBottom: isStory ? 12 : 8, borderWidth: 1, borderColor: improvementColor + '20' }}>
          <MaterialIcons name={improvements >= 3 ? 'trending-up' : improvements >= 1 ? 'trending-flat' : 'trending-down'} size={14} color={improvementColor} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: improvementColor }}>{improvementLabel}</Text>
          <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.35)' }}>{improvements}/6 {fr ? 'ameliorations' : 'improved'}</Text>
        </View>

        {/* Comparison rows */}
        <View style={{ marginBottom: isStory ? 10 : 6 }}>
          {metrics.map((m, i) => (
            <CompRow key={i} label={m.label} icon={m.icon} color={m.color} current={m.c} previous={m.p} suffix={m.suffix} compact={compact} />
          ))}
        </View>

        {/* Win/Loss comparison bars */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: isStory ? 8 : 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, fontWeight: '700', color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginBottom: 3 }}>{current.year}</Text>
            <View style={{ flexDirection: 'row', height: 5, borderRadius: 2.5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <View style={{ flex: Math.max(current.wins, 0.1), backgroundColor: '#22C55E', borderRadius: 2.5 }} />
              <View style={{ flex: Math.max(current.losses, 0.1), backgroundColor: '#EF4444', borderRadius: 2.5 }} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 7, fontWeight: '700', color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginBottom: 3 }}>{previous.year}</Text>
            <View style={{ flexDirection: 'row', height: 5, borderRadius: 2.5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)' }}>
              <View style={{ flex: Math.max(previous.wins, 0.1), backgroundColor: '#22C55E', borderRadius: 2.5 }} />
              <View style={{ flex: Math.max(previous.losses, 0.1), backgroundColor: '#EF4444', borderRadius: 2.5 }} />
            </View>
          </View>
        </View>

        <ShareCardWatermark variant="light" size={isStory ? 'sm' : 'xs'} />
      </LinearGradient>
    </View>
  );
}

const st = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
});
