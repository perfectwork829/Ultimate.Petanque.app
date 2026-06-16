/**
 * ShareCardH2H — Head-to-Head comparison card for social sharing.
 * Shows two players side by side with stats comparison, win history, ELO, geo ranks.
 * Adapts layout to square / story / landscape formats.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';

interface PlayerH2HData {
  name: string;
  eloRating?: number;
  eloColor?: string;
  eloRankLabel?: string;
  club?: string;
  city?: string;
  country?: string;
  winRate?: number;
  tirRate?: number;
  pointRate?: number;
  carreauCount?: number;
}

interface H2HRecord {
  winsA: number;
  winsB: number;
  draws: number;
  totalMatches: number;
  avgScoreA: number;
  avgScoreB: number;
  lastMatchDate?: string;
}

interface H2HMatchResult {
  date: string;
  won: boolean;
  scoreA: number;
  scoreB: number;
}

interface Props {
  playerA: PlayerH2HData;
  playerB: PlayerH2HData;
  record: H2HRecord;
  recentH2H?: H2HMatchResult[];
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

function ComparisonBar({ valueA, valueB, labelA, labelB, colorA, colorB, unit, compact }: {
  valueA: number; valueB: number; labelA?: string; labelB?: string; colorA: string; colorB: string; unit?: string; compact?: boolean;
}) {
  const total = Math.max(1, valueA + valueB);
  const pctA = (valueA / total) * 100;
  const pctB = (valueB / total) * 100;
  const fs = compact ? 8 : 10;
  const barH = compact ? 5 : 7;

  return (
    <View style={{ marginBottom: compact ? 5 : 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
        <Text style={{ fontSize: fs, fontWeight: '800', color: valueA >= valueB ? colorA : 'rgba(255,255,255,0.4)' }}>{valueA}{unit || ''}</Text>
        {labelA ? <Text style={{ fontSize: compact ? 6 : 8, fontWeight: '600', color: 'rgba(255,255,255,0.35)', flex: 1, textAlign: 'center' }}>{labelA}</Text> : null}
        <Text style={{ fontSize: fs, fontWeight: '800', color: valueB >= valueA ? colorB : 'rgba(255,255,255,0.4)' }}>{valueB}{unit || ''}</Text>
      </View>
      <View style={{ flexDirection: 'row', height: barH, borderRadius: barH / 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)' }}>
        <View style={{ width: `${Math.max(2, pctA)}%`, backgroundColor: colorA, borderTopLeftRadius: barH / 2, borderBottomLeftRadius: barH / 2 }} />
        <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.15)' }} />
        <View style={{ width: `${Math.max(2, pctB)}%`, backgroundColor: colorB, borderTopRightRadius: barH / 2, borderBottomRightRadius: barH / 2 }} />
      </View>
    </View>
  );
}

function PlayerHeader({ player, side, ct, compact }: { player: PlayerH2HData; side: 'left' | 'right'; ct: any; compact?: boolean }) {
  const align = side === 'left' ? 'flex-start' : 'flex-end';
  const textAlign = side === 'left' ? 'left' : 'right';
  const nameSize = compact ? 11 : 14;
  const eloSize = compact ? 8 : 10;

  return (
    <View style={{ flex: 1, alignItems: align as any }}>
      <Text style={{ fontSize: nameSize, fontWeight: '800', color: ct.textPrimary, textAlign: textAlign as any }} numberOfLines={1}>{player.name}</Text>
      {player.eloRating ? (
        <View style={{ flexDirection: side === 'left' ? 'row' : 'row-reverse', alignItems: 'center', gap: 3, marginTop: 2 }}>
          <MaterialIcons name="diamond" size={compact ? 7 : 9} color={player.eloColor || '#94A3B8'} />
          <Text style={{ fontSize: eloSize, fontWeight: '700', color: player.eloColor || '#94A3B8' }}>{player.eloRating}</Text>
          {player.eloRankLabel ? <Text style={{ fontSize: compact ? 6 : 8, fontWeight: '600', color: 'rgba(255,255,255,0.4)' }}>{player.eloRankLabel}</Text> : null}
        </View>
      ) : null}
      {player.club ? (
        <View style={{ flexDirection: side === 'left' ? 'row' : 'row-reverse', alignItems: 'center', gap: 2, marginTop: 2 }}>
          <MaterialIcons name="home" size={compact ? 6 : 8} color={ct.textSecondary} />
          <Text style={{ fontSize: compact ? 6 : 8, fontWeight: '500', color: ct.textSecondary }} numberOfLines={1}>{player.club}</Text>
        </View>
      ) : null}
      {player.city ? (
        <View style={{ flexDirection: side === 'left' ? 'row' : 'row-reverse', alignItems: 'center', gap: 2, marginTop: 1 }}>
          <MaterialIcons name="place" size={compact ? 6 : 8} color={ct.textSecondary} />
          <Text style={{ fontSize: compact ? 6 : 8, fontWeight: '500', color: ct.textSecondary }} numberOfLines={1}>{player.city}{player.country ? `, ${player.country}` : ''}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TrendLine({ results, colorA, colorB, compact }: { results: H2HMatchResult[]; colorA: string; colorB: string; compact?: boolean }) {
  if (results.length < 2) return null;
  const dotSize = compact ? 5 : 7;
  const lineW = compact ? 6 : 10;

  // Compute cumulative score: +1 for win, -1 for loss
  const cumulative = results.reduce<number[]>((acc, r) => {
    const prev = acc.length > 0 ? acc[acc.length - 1] : 0;
    acc.push(prev + (r.won ? 1 : -1));
    return acc;
  }, []);
  const minVal = Math.min(0, ...cumulative);
  const maxVal = Math.max(0, ...cumulative);
  const range = Math.max(1, maxVal - minVal);
  const chartH = compact ? 18 : 28;

  return (
    <View style={{ alignItems: 'center', gap: compact ? 2 : 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {results.map((r, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <View style={{ width: lineW, height: 1.5, backgroundColor: 'rgba(255,255,255,0.06)' }} /> : null}
            <View style={{ width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: r.won ? colorA : colorB, borderWidth: 1, borderColor: r.won ? colorA + '80' : colorB + '80' }} />
          </React.Fragment>
        ))}
      </View>
      {/* Mini elevation chart */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: chartH, gap: 1 }}>
        {cumulative.map((val, i) => {
          const normalized = (val - minVal) / range;
          const barH = Math.max(2, normalized * chartH);
          const isPositive = val >= 0;
          return (
            <View key={i} style={{ width: compact ? 4 : 6, height: barH, borderRadius: compact ? 1.5 : 2, backgroundColor: isPositive ? colorA + '40' : colorB + '40' }} />
          );
        })}
      </View>
    </View>
  );
}

function FormBadge({ results, fr, colorA, colorB, compact }: { results: H2HMatchResult[]; fr: boolean; colorA: string; colorB: string; compact?: boolean }) {
  if (results.length === 0) return null;
  let streak = 0;
  const streakWon = results[results.length - 1]?.won;
  for (let i = results.length - 1; i >= 0; i--) {
    if (results[i].won === streakWon) streak++;
    else break;
  }
  const last5 = results.slice(-5);
  const fs = compact ? 7 : 9;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: compact ? 5 : 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 1 : 2 }}>
        <Text style={{ fontSize: compact ? 6 : 7, fontWeight: '600', color: 'rgba(255,255,255,0.2)', marginRight: 2 }}>{fr ? 'FORME' : 'FORM'}</Text>
        {last5.map((r, i) => (
          <View key={i} style={{ width: compact ? 10 : 14, height: compact ? 12 : 16, borderRadius: compact ? 2 : 3, backgroundColor: r.won ? colorA + '25' : colorB + '25', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: fs, fontWeight: '900', color: r.won ? colorA : colorB }}>{r.won ? 'V' : 'D'}</Text>
          </View>
        ))}
      </View>
      {streak >= 2 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: (streakWon ? colorA : colorB) + '18', paddingHorizontal: compact ? 4 : 6, paddingVertical: compact ? 1.5 : 2.5, borderRadius: 6, borderWidth: 1, borderColor: (streakWon ? colorA : colorB) + '30' }}>
          <Text style={{ fontSize: compact ? 6 : 8, fontWeight: '800', color: streakWon ? colorA : colorB }}>
            {streak}{streakWon ? 'V' : 'D'} {fr ? 'serie' : 'streak'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function ShareCardH2H({
  playerA, playerB, record, recentH2H,
  language = 'fr', colorTheme = 'dark', format = 'square',
}: Props) {
  const fr = language === 'fr';
  const ct = CARD_COLOR_THEMES[colorTheme];
  const isStory = format === 'story';
  const isLandscape = format === 'landscape';

  const colorA = '#22C55E';
  const colorB = '#3B82F6';
  const winnerSide = record.winsA > record.winsB ? 'A' : record.winsB > record.winsA ? 'B' : null;

  // === LANDSCAPE ===
  if (isLandscape) {
    return (
      <View style={s.card}>
        <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: 10, paddingBottom: 44, justifyContent: 'space-between' }}>
          {/* Title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
            <MaterialIcons name="compare-arrows" size={9} color={ct.accent} />
            <Text style={{ fontSize: 6, fontWeight: '800', letterSpacing: 1, color: ct.accent }}>HEAD TO HEAD</Text>
          </View>

          <View style={{ flexDirection: 'row', flex: 1 }}>
            {/* Left: players */}
            <View style={{ flex: 1, justifyContent: 'center', paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <PlayerHeader player={playerA} side="left" ct={ct} compact />
                <View style={{ alignItems: 'center', paddingHorizontal: 4 }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.25)' }}>VS</Text>
                </View>
                <PlayerHeader player={playerB} side="right" ct={ct} compact />
              </View>
              {/* Score record */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: winnerSide === 'A' ? colorA : 'rgba(255,255,255,0.4)' }}>{record.winsA}</Text>
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 6, fontWeight: '700', color: 'rgba(255,255,255,0.25)', letterSpacing: 0.5 }}>{fr ? 'VICTOIRES' : 'WINS'}</Text>
                  {record.draws > 0 ? <Text style={{ fontSize: 6, color: 'rgba(255,255,255,0.2)' }}>{record.draws} {fr ? 'nuls' : 'draws'}</Text> : null}
                </View>
                <Text style={{ fontSize: 16, fontWeight: '900', color: winnerSide === 'B' ? colorB : 'rgba(255,255,255,0.4)' }}>{record.winsB}</Text>
              </View>
            </View>

            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 4 }} />

            {/* Right: comparison bars */}
            <View style={{ flex: 1, justifyContent: 'center' }}>
              {playerA.winRate !== undefined && playerB.winRate !== undefined ? (
                <ComparisonBar valueA={playerA.winRate} valueB={playerB.winRate} labelA={fr ? 'Vict.' : 'Win'} colorA={colorA} colorB={colorB} unit="%" compact />
              ) : null}
              {playerA.tirRate !== undefined && playerB.tirRate !== undefined ? (
                <ComparisonBar valueA={playerA.tirRate} valueB={playerB.tirRate} labelA={fr ? 'Tir' : 'Shot'} colorA={colorA} colorB={colorB} unit="%" compact />
              ) : null}
              {playerA.pointRate !== undefined && playerB.pointRate !== undefined ? (
                <ComparisonBar valueA={playerA.pointRate} valueB={playerB.pointRate} labelA="Point" colorA={colorA} colorB={colorB} unit="%" compact />
              ) : null}
              <ComparisonBar valueA={Math.round(record.avgScoreA * 10) / 10} valueB={Math.round(record.avgScoreB * 10) / 10} labelA={fr ? 'Moy.' : 'Avg.'} colorA={colorA} colorB={colorB} compact />
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 2 }}>
                <Text style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)' }}>{record.totalMatches} {fr ? 'matchs' : 'matches'}</Text>
              </View>
              {recentH2H && recentH2H.length >= 2 ? (
                <View style={{ marginTop: 4, gap: 3, alignItems: 'center' }}>
                  <TrendLine results={recentH2H} colorA={colorA} colorB={colorB} compact />
                  <FormBadge results={recentH2H} fr={fr} colorA={colorA} colorB={colorB} compact />
                </View>
              ) : null}
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
  const pad = isStory ? 18 : 14;
  const titleSize = isStory ? 10 : 9;
  const nameSize = isStory ? 14 : 13;
  const scoreFontSize = isStory ? 32 : 28;

  return (
    <View style={s.card}>
      <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: pad, paddingBottom: isStory ? 52 : 48, justifyContent: isStory ? 'center' : 'flex-start' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: isStory ? 8 : 6 }}>
          <MaterialIcons name="compare-arrows" size={isStory ? 16 : 12} color={ct.accent} />
          <Text style={{ fontSize: titleSize, fontWeight: '800', letterSpacing: 1.5, color: ct.accent }}>HEAD TO HEAD</Text>
        </View>

        {/* Player names */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: isStory ? 6 : 6, marginBottom: isStory ? 10 : 8 }}>
          <PlayerHeader player={playerA} side="left" ct={ct} compact={!isStory} />
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, paddingHorizontal: 2 }}>
            <View style={{ width: isStory ? 28 : 22, height: isStory ? 28 : 22, borderRadius: isStory ? 14 : 11, backgroundColor: ct.accent + '18', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: ct.accent + '30' }}>
              <Text style={{ fontSize: isStory ? 9 : 7, fontWeight: '900', color: ct.accent }}>VS</Text>
            </View>
          </View>
          <PlayerHeader player={playerB} side="right" ct={ct} compact={!isStory} />
        </View>

        {/* Win record - big score */}
        <View style={{ alignItems: 'center', marginBottom: isStory ? 12 : 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: isStory ? 12 : 10, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: isStory ? 14 : 12, paddingVertical: isStory ? 10 : 7, paddingHorizontal: isStory ? 18 : 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: scoreFontSize, fontWeight: '900', color: winnerSide === 'A' ? colorA : 'rgba(255,255,255,0.35)' }}>{record.winsA}</Text>
              <View style={{ width: isStory ? 24 : 18, height: 3, borderRadius: 1.5, backgroundColor: colorA, marginTop: 2, opacity: winnerSide === 'A' ? 1 : 0.2 }} />
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: isStory ? 10 : 7, fontWeight: '700', color: 'rgba(255,255,255,0.2)', letterSpacing: 0.5 }}>{fr ? 'VICTOIRES' : 'WINS'}</Text>
              {record.draws > 0 ? (
                <Text style={{ fontSize: isStory ? 9 : 6, color: 'rgba(255,255,255,0.15)', marginTop: 1 }}>{record.draws} {fr ? 'nuls' : 'draws'}</Text>
              ) : null}
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: scoreFontSize, fontWeight: '900', color: winnerSide === 'B' ? colorB : 'rgba(255,255,255,0.35)' }}>{record.winsB}</Text>
              <View style={{ width: isStory ? 24 : 18, height: 3, borderRadius: 1.5, backgroundColor: colorB, marginTop: 2, opacity: winnerSide === 'B' ? 1 : 0.2 }} />
            </View>
          </View>
          <Text style={{ fontSize: isStory ? 8 : 7, color: 'rgba(255,255,255,0.25)', marginTop: isStory ? 4 : 3 }}>{record.totalMatches} {fr ? 'matchs joues' : 'matches played'}</Text>
        </View>

        {/* Trend line + Form indicator */}
        {recentH2H && recentH2H.length >= 2 ? (
          <View style={{ alignItems: 'center', marginBottom: isStory ? 8 : 6, gap: isStory ? 4 : 3, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: isStory ? 10 : 8, paddingVertical: isStory ? 6 : 5, paddingHorizontal: isStory ? 10 : 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' }}>
            <Text style={{ fontSize: isStory ? 8 : 6, fontWeight: '700', color: 'rgba(255,255,255,0.2)', letterSpacing: 1 }}>{fr ? 'TENDANCE' : 'TREND'}</Text>
            <TrendLine results={recentH2H} colorA={colorA} colorB={colorB} compact={!isStory} />
            <FormBadge results={recentH2H} fr={fr} colorA={colorA} colorB={colorB} compact={!isStory} />
          </View>
        ) : null}

        {/* Comparison bars */}
        <View style={{ marginBottom: isStory ? 8 : 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: isStory ? 4 : 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: isStory ? 8 : 6, height: isStory ? 8 : 6, borderRadius: 4, backgroundColor: colorA }} />
              <Text style={{ fontSize: isStory ? 9 : 6, fontWeight: '600', color: 'rgba(255,255,255,0.35)' }}>{playerA.name.split(' ')[0]}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Text style={{ fontSize: isStory ? 9 : 6, fontWeight: '600', color: 'rgba(255,255,255,0.35)' }}>{playerB.name.split(' ')[0]}</Text>
              <View style={{ width: isStory ? 8 : 6, height: isStory ? 8 : 6, borderRadius: 4, backgroundColor: colorB }} />
            </View>
          </View>

          {playerA.winRate !== undefined && playerB.winRate !== undefined ? (
            <ComparisonBar valueA={playerA.winRate} valueB={playerB.winRate} labelA={fr ? 'Taux Victoire' : 'Win Rate'} colorA={colorA} colorB={colorB} unit="%" compact={!isStory} />
          ) : null}
          {playerA.tirRate !== undefined && playerB.tirRate !== undefined ? (
            <ComparisonBar valueA={playerA.tirRate} valueB={playerB.tirRate} labelA={fr ? 'Taux Tir' : 'Shot Rate'} colorA={colorA} colorB={colorB} unit="%" compact={!isStory} />
          ) : null}
          {playerA.pointRate !== undefined && playerB.pointRate !== undefined ? (
            <ComparisonBar valueA={playerA.pointRate} valueB={playerB.pointRate} labelA={fr ? 'Taux Point' : 'Point Rate'} colorA={colorA} colorB={colorB} unit="%" compact={!isStory} />
          ) : null}
          {playerA.carreauCount !== undefined && playerB.carreauCount !== undefined ? (
            <ComparisonBar valueA={playerA.carreauCount} valueB={playerB.carreauCount} labelA="Carreaux" colorA={colorA} colorB={colorB} compact={!isStory} />
          ) : null}
          <ComparisonBar valueA={Math.round(record.avgScoreA * 10) / 10} valueB={Math.round(record.avgScoreB * 10) / 10} labelA={fr ? 'Score Moyen' : 'Avg Score'} colorA={colorA} colorB={colorB} compact={!isStory} />
        </View>

        {/* Last match date */}
        {record.lastMatchDate ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: isStory ? 6 : 2 }}>
            <MaterialIcons name="schedule" size={isStory ? 10 : 7} color="rgba(255,255,255,0.2)" />
            <Text style={{ fontSize: isStory ? 9 : 6, color: 'rgba(255,255,255,0.2)' }}>
              {fr ? 'Dernier match' : 'Last match'}: {new Date(record.lastMatchDate).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        ) : null}

        <ShareCardWatermark variant="light" size={isStory ? 'sm' : 'xs'} />
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
});
