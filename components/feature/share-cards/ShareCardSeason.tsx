/**
 * ShareCardSeason — Season summary card for social sharing.
 * Shows current ELO, wins/losses, win rate, best month, streak, sparkline,
 * monthly detail table, and all season info without truncation.
 * Story format uses extended vertical space to fit everything.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';

interface MonthlyElo {
  month: string;
  elo: number;
}

interface MonthlyDetail {
  month: string;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
  eloEnd: number;
  eloDelta: number;
}

interface Props {
  playerName?: string;
  year: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  carreaux: number;
  eloRating: number;
  eloColor?: string;
  eloRankLabel?: string;
  eloIcon?: string;
  seasonPeak?: number;
  bestMonth?: { name: string; delta: number; wins: number; matches: number } | null;
  streak?: { type: 'win' | 'loss'; count: number } | null;
  monthlyElo?: MonthlyElo[];
  monthlyDetails?: MonthlyDetail[];
  clubName?: string;
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

export default function ShareCardSeason({
  playerName, year, matchesPlayed, wins, losses, winRate, carreaux,
  eloRating, eloColor, eloRankLabel, eloIcon,
  seasonPeak, bestMonth, streak, monthlyElo, monthlyDetails,
  clubName, language = 'fr', colorTheme = 'dark', format = 'square',
}: Props) {
  const fr = language === 'fr';
  const ct = CARD_COLOR_THEMES[colorTheme];
  const isStory = format === 'story';
  const isLandscape = format === 'landscape';
  const ec = eloColor || '#94A3B8';

  const renderSparkline = (w: number, h: number, showLabels?: boolean) => {
    if (!monthlyElo || monthlyElo.length < 2) return null;
    const vals = monthlyElo.map(m => m.elo);
    const minE = Math.min(...vals) - 5;
    const maxE = Math.max(...vals) + 5;
    const range = Math.max(maxE - minE, 1);
    const padL = showLabels ? 4 : 2;
    const padR = showLabels ? 4 : 2;
    const padT = 4;
    const padB = showLabels ? 14 : 4;
    const iW = w - padL - padR;
    const iH = h - padT - padB;
    const stepX = iW / (monthlyElo.length - 1);
    const pts = monthlyElo.map((m, i) => ({
      x: padL + i * stepX,
      y: padT + iH - ((m.elo - minE) / range) * iH,
    }));
    return (
      <View style={{ width: w, height: h, position: 'relative' }}>
        {/* Baseline */}
        <View style={{ position: 'absolute', top: padT + iH, left: padL, right: padR, height: 0.5, backgroundColor: 'rgba(255,255,255,0.08)' }} />
        {/* Line segments */}
        {pts.slice(1).map((p, i) => {
          const p0 = pts[i];
          const dx = p.x - p0.x;
          const dy = p.y - p0.y;
          const len = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View key={`l${i}`} style={{
              position: 'absolute', left: p0.x, top: p0.y - 1,
              width: len, height: 2, backgroundColor: ec, opacity: 0.9,
              borderRadius: 1, transform: [{ rotate: `${angle}deg` }], transformOrigin: 'left center',
            }} />
          );
        })}
        {/* Dots */}
        {pts.map((p, i) => (
          <View key={i} style={{
            position: 'absolute', left: p.x - 2.5, top: p.y - 2.5,
            width: 5, height: 5, borderRadius: 2.5, backgroundColor: ec,
            borderWidth: 1, borderColor: 'rgba(0,0,0,0.3)',
          }} />
        ))}
        {/* Labels */}
        {showLabels ? monthlyElo.map((m, i) => (
          <Text key={`t${i}`} style={{
            position: 'absolute', left: pts[i].x - 10, top: h - 12,
            width: 20, fontSize: 7, fontWeight: '600',
            color: 'rgba(255,255,255,0.4)', textAlign: 'center',
          }}>{m.month}</Text>
        )) : null}
      </View>
    );
  };

  // Helper: render monthly detail table rows
  const renderMonthlyTable = (compact?: boolean) => {
    if (!monthlyDetails || monthlyDetails.length === 0) return null;
    const fs = compact ? 7 : 8;
    const hfs = compact ? 6 : 7;
    return (
      <View style={{ marginTop: compact ? 4 : 6 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', paddingBottom: 3, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.1)', marginBottom: 2 }}>
          <Text style={{ flex: 2, fontSize: hfs, fontWeight: '700', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase' }}>{fr ? 'Mois' : 'Month'}</Text>
          <Text style={{ flex: 1, fontSize: hfs, fontWeight: '700', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>{fr ? 'M' : 'G'}</Text>
          <Text style={{ flex: 1, fontSize: hfs, fontWeight: '700', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>{fr ? 'V/D' : 'W/L'}</Text>
          <Text style={{ flex: 1, fontSize: hfs, fontWeight: '700', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>%</Text>
          <Text style={{ flex: 1, fontSize: hfs, fontWeight: '700', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>ELO</Text>
          <Text style={{ flex: 1, fontSize: hfs, fontWeight: '700', color: 'rgba(255,255,255,0.35)', textAlign: 'center' }}>{'\u0394'}</Text>
        </View>
        {monthlyDetails.map((m, idx) => (
          <View key={idx} style={{ flexDirection: 'row', paddingVertical: compact ? 2 : 2.5, borderBottomWidth: idx < monthlyDetails.length - 1 ? 0.5 : 0, borderBottomColor: 'rgba(255,255,255,0.05)' }}>
            <Text style={{ flex: 2, fontSize: fs, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>{m.month}</Text>
            <Text style={{ flex: 1, fontSize: fs, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{m.matches}</Text>
            <Text style={{ flex: 1, fontSize: fs, fontWeight: '600', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>{m.wins}/{m.losses}</Text>
            <Text style={{ flex: 1, fontSize: fs, fontWeight: '700', color: m.winRate >= 50 ? '#22C55E' : m.matches > 0 ? '#EF4444' : 'rgba(255,255,255,0.3)', textAlign: 'center' }}>{m.matches > 0 ? `${m.winRate}%` : '-'}</Text>
            <Text style={{ flex: 1, fontSize: fs, fontWeight: '700', color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>{m.eloEnd}</Text>
            <Text style={{ flex: 1, fontSize: fs, fontWeight: '700', color: m.eloDelta > 0 ? '#22C55E' : m.eloDelta < 0 ? '#EF4444' : 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
              {m.eloDelta !== 0 ? `${m.eloDelta > 0 ? '+' : ''}${m.eloDelta}` : '-'}
            </Text>
          </View>
        ))}
      </View>
    );
  };

  // === LANDSCAPE ===
  if (isLandscape) {
    return (
      <View style={st.card}>
        <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: 10, paddingBottom: 44, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 }}>
            <MaterialIcons name="calendar-today" size={9} color={ct.accent} />
            <Text style={{ fontSize: 7, fontWeight: '800', letterSpacing: 1, color: ct.accent }}>
              {fr ? `SAISON ${year}` : `SEASON ${year}`}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center', paddingRight: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: ct.textPrimary, marginBottom: 3 }}>{playerName || (fr ? 'Joueur' : 'Player')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: ec + '20', paddingHorizontal: 6, paddingVertical: 2.5, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 4 }}>
                <MaterialIcons name={(eloIcon as any) || 'diamond'} size={9} color={ec} />
                <Text style={{ fontSize: 9, fontWeight: '700', color: ec }}>ELO {eloRating} {eloRankLabel || ''}</Text>
              </View>
              {clubName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 3 }}>
                  <MaterialIcons name="home" size={8} color={ct.textSecondary} />
                  <Text style={{ fontSize: 7, fontWeight: '600', color: ct.textSecondary }}>{clubName}</Text>
                </View>
              ) : null}
              {renderSparkline(120, 32)}
              {/* Compact best month + streak in landscape */}
              <View style={{ flexDirection: 'row', gap: 4, marginTop: 3 }}>
                {bestMonth && bestMonth.delta > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}>
                    <MaterialIcons name="emoji-events" size={7} color="#F59E0B" />
                    <Text style={{ fontSize: 7, fontWeight: '700', color: '#F59E0B' }}>{bestMonth.name.slice(0, 3)} +{bestMonth.delta}</Text>
                  </View>
                ) : null}
                {streak && streak.count >= 2 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 4, paddingVertical: 2, borderRadius: 4 }}>
                    <MaterialIcons name="local-fire-department" size={7} color={streak.type === 'win' ? '#22C55E' : '#EF4444'} />
                    <Text style={{ fontSize: 7, fontWeight: '700', color: streak.type === 'win' ? '#22C55E' : '#EF4444' }}>{streak.count} {streak.type === 'win' ? 'W' : 'L'}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 6 }} />
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                <View style={st.statBoxSm}><Text style={{ fontSize: 14, fontWeight: '900', color: '#22C55E' }}>{wins}</Text><Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B' }}>{fr ? 'Vict.' : 'Wins'}</Text></View>
                <View style={st.statBoxSm}><Text style={{ fontSize: 14, fontWeight: '900', color: '#EF4444' }}>{losses}</Text><Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B' }}>{fr ? 'Def.' : 'Loss'}</Text></View>
                <View style={st.statBoxSm}><Text style={{ fontSize: 14, fontWeight: '900', color: '#60A5FA' }}>{winRate}%</Text><Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B' }}>{fr ? 'Taux' : 'Rate'}</Text></View>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <View style={st.statBoxSm}><Text style={{ fontSize: 14, fontWeight: '900', color: '#A78BFA' }}>{carreaux}</Text><Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B' }}>Carr.</Text></View>
                <View style={st.statBoxSm}><Text style={{ fontSize: 14, fontWeight: '900', color: '#F8FAFC' }}>{matchesPlayed}</Text><Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B' }}>{fr ? 'Matchs' : 'Games'}</Text></View>
                {seasonPeak ? <View style={st.statBoxSm}><Text style={{ fontSize: 14, fontWeight: '900', color: '#F59E0B' }}>{seasonPeak}</Text><Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B' }}>Peak</Text></View> : null}
              </View>
              {/* Compact monthly table in landscape */}
              {renderMonthlyTable(true)}
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
  const titleSize = isStory ? 20 : 16;
  const statFs = isStory ? 18 : 14;

  return (
    <View style={st.card}>
      <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: pad, paddingBottom: isStory ? 56 : 48, justifyContent: 'flex-start' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: isStory ? 10 : 6 }}>
          <MaterialIcons name="calendar-today" size={isStory ? 14 : 11} color={ct.accent} />
          <Text style={{ fontSize: isStory ? 10 : 8, fontWeight: '800', letterSpacing: 1.5, color: ct.accent }}>
            {fr ? `BILAN SAISON ${year}` : `SEASON ${year} SUMMARY`}
          </Text>
        </View>

        {/* Player + ELO */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: isStory ? 12 : 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: titleSize, fontWeight: '800', color: ct.textPrimary }} numberOfLines={1}>{playerName || (fr ? 'Joueur' : 'Player')}</Text>
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
              <Text style={{ fontSize: 15, fontWeight: '900', color: ec }}>{eloRating}</Text>
            </View>
            {eloRankLabel ? <Text style={{ fontSize: 7, fontWeight: '700', color: ec, marginTop: 2 }}>{eloRankLabel}</Text> : null}
          </View>
        </View>

        {/* Stats grid */}
        <View style={{ flexDirection: 'row', gap: 5, marginBottom: isStory ? 10 : 7 }}>
          {[
            { value: wins, label: fr ? 'Victoires' : 'Wins', color: '#22C55E' },
            { value: losses, label: fr ? 'Defaites' : 'Losses', color: '#EF4444' },
            { value: `${winRate}%`, label: fr ? 'Taux V.' : 'Win %', color: '#60A5FA' },
            { value: carreaux, label: 'Carreaux', color: '#A78BFA' },
          ].map((s, i) => (
            <View key={i} style={st.statBox}>
              <Text style={{ fontSize: statFs, fontWeight: '900', color: s.color }}>{s.value}</Text>
              <Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B', letterSpacing: 0.3, textTransform: 'uppercase' }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* ELO Sparkline with month labels */}
        {monthlyElo && monthlyElo.length >= 2 ? (
          <View style={{ alignItems: 'center', marginBottom: isStory ? 10 : 7 }}>
            {renderSparkline(isStory ? 260 : 200, isStory ? 48 : 40, true)}
            <Text style={{ fontSize: 7, fontWeight: '600', color: ct.textSecondary, marginTop: 2 }}>
              {fr ? 'Progression ELO mensuelle' : 'Monthly ELO Progression'}
            </Text>
          </View>
        ) : null}

        {/* Best month + Streak + Peak row */}
        <View style={{ flexDirection: 'row', gap: 5, marginBottom: isStory ? 10 : 6 }}>
          {bestMonth && bestMonth.delta > 0 ? (
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: isStory ? 8 : 6, borderWidth: 1, borderColor: '#F59E0B20' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                <MaterialIcons name="emoji-events" size={9} color="#F59E0B" />
                <Text style={{ fontSize: 7, fontWeight: '700', color: '#F59E0B' }}>{fr ? 'MEILLEUR MOIS' : 'BEST MONTH'}</Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '800', color: ct.textPrimary, textTransform: 'capitalize' }} numberOfLines={1}>{bestMonth.name}</Text>
              <Text style={{ fontSize: 8, fontWeight: '600', color: '#22C55E' }}>+{bestMonth.delta} ELO • {bestMonth.wins}V/{bestMonth.matches}M</Text>
            </View>
          ) : null}
          {streak && streak.count >= 2 ? (
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: isStory ? 8 : 6, borderWidth: 1, borderColor: (streak.type === 'win' ? '#22C55E' : '#EF4444') + '20' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                <MaterialIcons name="local-fire-department" size={9} color={streak.type === 'win' ? '#22C55E' : '#EF4444'} />
                <Text style={{ fontSize: 7, fontWeight: '700', color: streak.type === 'win' ? '#22C55E' : '#EF4444' }}>{fr ? 'SERIE' : 'STREAK'}</Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '800', color: ct.textPrimary }}>{streak.count}</Text>
              <Text style={{ fontSize: 8, fontWeight: '600', color: streak.type === 'win' ? '#22C55E' : '#EF4444' }}>
                {streak.type === 'win' ? (fr ? 'victoires' : 'wins') : (fr ? 'defaites' : 'losses')}
              </Text>
            </View>
          ) : null}
          {seasonPeak ? (
            <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: isStory ? 8 : 6, borderWidth: 1, borderColor: '#F59E0B20' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                <MaterialIcons name="arrow-upward" size={9} color="#F59E0B" />
                <Text style={{ fontSize: 7, fontWeight: '700', color: '#F59E0B' }}>PEAK</Text>
              </View>
              <Text style={{ fontSize: 11, fontWeight: '800', color: ct.textPrimary }}>{seasonPeak}</Text>
              <Text style={{ fontSize: 8, fontWeight: '600', color: '#64748B' }}>ELO</Text>
            </View>
          ) : null}
        </View>

        {/* Monthly Detail Table */}
        {renderMonthlyTable(false)}

        {/* Win/Loss bar */}
        <View style={{ flexDirection: 'row', height: 5, borderRadius: 2.5, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.06)', marginTop: isStory ? 10 : 6, marginBottom: isStory ? 6 : 3 }}>
          <View style={{ flex: Math.max(wins, 0.1), backgroundColor: '#22C55E', borderRadius: 2.5 }} />
          <View style={{ flex: Math.max(losses, 0.1), backgroundColor: '#EF4444', borderRadius: 2.5 }} />
        </View>

        {/* Matches count */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 3 }}>
          <MaterialIcons name="sports" size={9} color={ct.textSecondary} />
          <Text style={{ fontSize: 8, fontWeight: '600', color: ct.textSecondary }}>
            {matchesPlayed} {fr ? 'matchs joues' : 'matches played'}
          </Text>
        </View>

        <ShareCardWatermark variant="light" size={isStory ? 'sm' : 'xs'} />
      </LinearGradient>
    </View>
  );
}

const st = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
  statBox: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statBoxSm: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
});
