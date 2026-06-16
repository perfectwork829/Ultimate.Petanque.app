/**
 * ShareCardMatch — Visual match result card for social sharing.
 * Shows score, teams with ELO/club/geo, mene details, player actions.
 * Adapts layout to square / story / landscape formats without truncation.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';
import type { Match, PlayerAction, Mene } from '@/types/petanque';

interface GeoRankInfo {
  city?: { name?: string; rank?: number };
  country?: { name?: string; rank?: number };
}

interface PlayerInfo {
  eloRating?: number;
  club?: string;
  city?: string;
  country?: string;
}

interface Props {
  match: Match;
  playerName?: string;
  eloRating?: number;
  eloRankLabel?: string;
  eloColor?: string;
  terrainName?: string;
  clubName?: string;
  geoRank?: GeoRankInfo | null;
  playersData?: Record<string, PlayerInfo>;
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

/** Momentum chart: cumulative score progression across menes */
function MomentumChart({ menes, ct, compact }: { menes: Mene[]; ct: any; compact?: boolean }) {
  if (!menes || menes.length < 2) return null;
  const w = compact ? 140 : 200;
  const h = compact ? 28 : 40;
  let cumA = 0, cumB = 0;
  const pointsA: number[] = [0];
  const pointsB: number[] = [0];
  menes.forEach(m => {
    cumA += m.teamAPoints || 0;
    cumB += m.teamBPoints || 0;
    pointsA.push(cumA);
    pointsB.push(cumB);
  });
  const maxS = Math.max(cumA, cumB, 1);
  const stepX = w / (pointsA.length - 1);
  const toY = (v: number) => h - 2 - ((v / maxS) * (h - 4));
  const lineA = pointsA.map((v, i) => `${i * stepX},${toY(v)}`).join(' ');
  const lineB = pointsB.map((v, i) => `${i * stepX},${toY(v)}`).join(' ');
  const fs = compact ? 6 : 7;
  return (
    <View style={{ marginTop: compact ? 2 : 4, marginBottom: compact ? 2 : 4 }}>
      <Text style={{ fontSize: compact ? 5 : 7, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.5, marginBottom: 2 }}>MOMENTUM</Text>
      <View style={{ width: w, height: h }}>
        {/* Use View-based lines since SVG is already imported */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
        {pointsA.map((v, i) => {
          if (i === 0) return null;
          const x1 = (i - 1) * stepX;
          const y1 = toY(pointsA[i - 1]);
          const x2 = i * stepX;
          const y2 = toY(v);
          return (
            <View key={`a${i}`} style={{ position: 'absolute', left: x2 - 2, top: y2 - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: '#22C55E' }} />
          );
        })}
        {pointsB.map((v, i) => {
          if (i === 0) return null;
          const x2 = i * stepX;
          const y2 = toY(v);
          return (
            <View key={`b${i}`} style={{ position: 'absolute', left: x2 - 2, top: y2 - 2, width: 4, height: 4, borderRadius: 2, backgroundColor: '#EF4444' }} />
          );
        })}
        {/* Score labels */}
        <View style={{ position: 'absolute', right: 0, top: toY(cumA) - (compact ? 4 : 5) }}>
          <Text style={{ fontSize: fs, fontWeight: '800', color: '#22C55E' }}>{cumA}</Text>
        </View>
        <View style={{ position: 'absolute', right: 0, top: toY(cumB) - (compact ? 4 : 5) }}>
          <Text style={{ fontSize: fs, fontWeight: '800', color: '#EF4444' }}>{cumB}</Text>
        </View>
      </View>
    </View>
  );
}

/** Action heatmap: visual distribution of player actions */
function ActionHeatmap({ actions, ct, compact }: { actions: PlayerAction[]; ct: any; compact?: boolean }) {
  if (!actions || actions.length === 0) return null;
  const fs = compact ? 6 : 8;
  const barH = compact ? 6 : 8;
  return (
    <View style={{ marginTop: compact ? 2 : 4 }}>
      <Text style={{ fontSize: compact ? 5 : 7, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.5, marginBottom: compact ? 2 : 3 }}>HEATMAP</Text>
      {actions.slice(0, compact ? 3 : 4).map((pa, i) => {
        const a = pa.actions;
        const total = Math.max(a.tirs + a.points + (a.carreaux || 0), 1);
        const tirPct = (a.tirs / total) * 100;
        const ptPct = (a.points / total) * 100;
        const cPct = ((a.carreaux || 0) / total) * 100;
        return (
          <View key={i} style={{ marginBottom: compact ? 1.5 : 2.5 }}>
            <Text style={{ fontSize: fs, fontWeight: '600', color: ct.textPrimary, marginBottom: 1 }} numberOfLines={1}>{pa.playerName}</Text>
            <View style={{ flexDirection: 'row', height: barH, borderRadius: barH / 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.04)' }}>
              {tirPct > 0 ? <View style={{ width: `${tirPct}%`, backgroundColor: '#3B82F680', height: barH }} /> : null}
              {ptPct > 0 ? <View style={{ width: `${ptPct}%`, backgroundColor: '#10B98180', height: barH }} /> : null}
              {cPct > 0 ? <View style={{ width: `${cPct}%`, backgroundColor: '#F59E0B80', height: barH }} /> : null}
            </View>
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', gap: compact ? 4 : 6, marginTop: compact ? 1 : 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3B82F680' }} /><Text style={{ fontSize: compact ? 5 : 6, color: ct.textSecondary }}>Tir</Text></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B98180' }} /><Text style={{ fontSize: compact ? 5 : 6, color: ct.textSecondary }}>Point</Text></View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#F59E0B80' }} /><Text style={{ fontSize: compact ? 5 : 6, color: ct.textSecondary }}>Carr.</Text></View>
      </View>
    </View>
  );
}

function MeneBar({ menes, compact }: { menes: Mene[]; compact?: boolean }) {
  if (!menes || menes.length === 0) return null;
  const h = compact ? 3 : 5;
  const max = compact ? 13 : 18;
  return (
    <View style={{ flexDirection: 'row', gap: compact ? 1 : 2, alignItems: 'flex-end' }}>
      {menes.slice(0, max).map((m, i) => {
        const aWon = (m.teamAPoints || 0) > (m.teamBPoints || 0);
        const isNull = m.isNull;
        return (
          <View key={i} style={{
            width: compact ? 3 : 4,
            height: isNull ? h : Math.max(h, ((aWon ? m.teamAPoints : m.teamBPoints) || 1) * (compact ? 2 : 2.5)),
            backgroundColor: isNull ? '#64748B40' : aWon ? '#22C55E80' : '#EF444480',
            borderRadius: 1,
          }} />
        );
      })}
    </View>
  );
}

function PlayerActionRow({ pa, ct, compact }: { pa: PlayerAction; ct: any; compact?: boolean }) {
  const a = pa.actions;
  const tirPct = a.tirs > 0 ? Math.round((a.tirsSuccess / a.tirs) * 100) : 0;
  const ptPct = a.points > 0 ? Math.round((a.pointsSuccess / a.points) * 100) : 0;
  const fs = compact ? 7 : 9;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? 3 : 5, paddingVertical: compact ? 0.5 : 1.5 }}>
      <Text style={{ fontSize: fs, fontWeight: '700', color: ct.textPrimary, width: compact ? 44 : 60 }} numberOfLines={1}>{pa.playerName}</Text>
      {a.tirs > 0 ? <Text style={{ fontSize: fs, color: '#3B82F6' }}>T:{a.tirsSuccess}/{a.tirs}({tirPct}%)</Text> : null}
      {a.points > 0 ? <Text style={{ fontSize: fs, color: '#10B981' }}>P:{a.pointsSuccess}/{a.points}({ptPct}%)</Text> : null}
      {a.carreaux > 0 ? <Text style={{ fontSize: fs, color: '#F59E0B' }}>C:{a.carreaux}</Text> : null}
    </View>
  );
}

function GeoRankBadges({ geoRank, compact }: { geoRank?: GeoRankInfo | null; compact?: boolean }) {
  if (!geoRank) return null;
  const fs = compact ? 7 : 9;
  return (
    <View style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap' }}>
      {geoRank.city?.rank ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 5 }}>
          <MaterialIcons name="location-city" size={compact ? 7 : 9} color="#3B82F6" />
          <Text style={{ fontSize: fs, fontWeight: '600', color: '#94A3B8' }}>#{geoRank.city.rank} {geoRank.city.name}</Text>
        </View>
      ) : null}
      {geoRank.country?.rank ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 5 }}>
          <MaterialIcons name="flag" size={compact ? 7 : 9} color="#10B981" />
          <Text style={{ fontSize: fs, fontWeight: '600', color: '#94A3B8' }}>#{geoRank.country.rank} {geoRank.country.name}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Inline player info (ELO + club + city) for team members */
function TeamPlayerInfo({ name, info, ct, compact }: { name: string; info?: PlayerInfo; ct: any; compact?: boolean }) {
  const fs = compact ? 7 : 9;
  if (!info) return <Text style={{ fontSize: fs, fontWeight: '600', color: ct.textPrimary }} numberOfLines={1}>{name}</Text>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
      <Text style={{ fontSize: fs, fontWeight: '600', color: ct.textPrimary }} numberOfLines={1}>{name}</Text>
      {info.eloRating ? <Text style={{ fontSize: compact ? 6 : 8, fontWeight: '700', color: '#94A3B8' }}>ELO {info.eloRating}</Text> : null}
      {info.club ? <Text style={{ fontSize: compact ? 6 : 7, color: '#64748B' }} numberOfLines={1}>{info.club}</Text> : null}
      {info.city ? <Text style={{ fontSize: compact ? 6 : 7, color: '#64748B' }}>{info.city}</Text> : null}
    </View>
  );
}

export default function ShareCardMatch({ match, playerName, eloRating, eloRankLabel, eloColor, terrainName, clubName, geoRank, playersData, language = 'fr', colorTheme = 'dark', format = 'square' }: Props) {
  const fr = language === 'fr';
  const ct = CARD_COLOR_THEMES[colorTheme];
  const isWinnerA = match.winner === 'A';
  const winGrad: [string, string] = ['#22C55E', '#16A34A'];
  const loseGrad: [string, string] = ['#EF4444', '#DC2626'];
  const dateStr = new Date(match.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  const durationStr = match.duration ? `${Math.floor(match.duration / 60)}h${String(match.duration % 60).padStart(2, '0')}` : '';
  const hasActions = match.playerActions && match.playerActions.length > 0;
  const hasMenes = match.menes && match.menes.length > 0;
  const pd = playersData || {};

  const isStory = format === 'story';
  const isLandscape = format === 'landscape';

  // === LANDSCAPE ===
  if (isLandscape) {
    return (
      <View style={s.card}>
        <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: 10, paddingBottom: 44, justifyContent: 'space-between' }}>
          {/* Top row: header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MaterialIcons name="sports" size={9} color={ct.accent} />
              <Text style={{ fontSize: 7, fontWeight: '800', letterSpacing: 1, color: ct.accent }}>MATCH</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 3 }}>
                <Text style={{ fontSize: 7, color: ct.textSecondary }}>{match.format}</Text>
                <Text style={{ fontSize: 7, color: ct.textSecondary }}>{match.mode}</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 7, color: ct.textSecondary }}>{dateStr}</Text>
              {durationStr ? <Text style={{ fontSize: 7, color: ct.textSecondary }}>{durationStr}</Text> : null}
            </View>
          </View>

          {/* Main content */}
          <View style={{ flexDirection: 'row', flex: 1 }}>
            {/* Left: scores + teams */}
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 3 }}>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <LinearGradient colors={isWinnerA ? winGrad : loseGrad} style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFF' }}>{match.teamA.score}</Text>
                  </LinearGradient>
                  <Text style={{ fontSize: 5, fontWeight: '700', color: ct.textSecondary, marginTop: 1, letterSpacing: 0.5 }}>{fr ? 'EQ. A' : 'TM A'}</Text>
                  {match.teamA.playerNames.map((n, i) => (
                    <TeamPlayerInfo key={i} name={n} info={pd[match.teamA.players?.[i]]} ct={ct} compact />
                  ))}
                </View>
                <View style={{ width: 16, alignItems: 'center' }}>
                  <Text style={{ fontSize: 7, fontWeight: '800', color: ct.textSecondary }}>VS</Text>
                </View>
                <View style={{ alignItems: 'center', flex: 1 }}>
                  <LinearGradient colors={!isWinnerA ? winGrad : loseGrad} style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFF' }}>{match.teamB.score}</Text>
                  </LinearGradient>
                  <Text style={{ fontSize: 5, fontWeight: '700', color: ct.textSecondary, marginTop: 1, letterSpacing: 0.5 }}>{fr ? 'EQ. B' : 'TM B'}</Text>
                  {match.teamB.playerNames.map((n, i) => (
                    <TeamPlayerInfo key={i} name={n} info={pd[match.teamB.players?.[i]]} ct={ct} compact />
                  ))}
                </View>
              </View>
              {hasMenes ? (
                <View style={{ alignItems: 'center' }}>
                  <MeneBar menes={match.menes} compact />
                  <MomentumChart menes={match.menes} ct={ct} compact />
                </View>
              ) : null}
            </View>

            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 6 }} />

            {/* Right: actions + info */}
            <View style={{ width: '32%', justifyContent: 'center', gap: 2 }}>
              {match.tournamentName ? <Text style={{ fontSize: 7, fontWeight: '600', color: ct.accent }} numberOfLines={1}>{match.tournamentName}</Text> : null}
              {hasActions ? (
                <View style={{ gap: 0.5 }}>
                  <Text style={{ fontSize: 6, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.5 }}>ACTIONS</Text>
                  {match.playerActions!.slice(0, 3).map((pa, i) => <PlayerActionRow key={i} pa={pa} ct={ct} compact />)}
                  <ActionHeatmap actions={match.playerActions!} ct={ct} compact />
                </View>
              ) : null}
              {playerName ? <Text style={{ fontSize: 8, fontWeight: '700', color: ct.textPrimary }}>{playerName}</Text> : null}
              {eloRating ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: (eloColor || '#94A3B8') + '20', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5, alignSelf: 'flex-start' }}>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: eloColor || '#94A3B8' }}>ELO {eloRating}{eloRankLabel ? ` ${eloRankLabel}` : ''}</Text>
                </View>
              ) : null}
              <GeoRankBadges geoRank={geoRank} compact />
              {clubName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <MaterialIcons name="home" size={7} color={ct.textSecondary} />
                  <Text style={{ fontSize: 7, color: ct.textSecondary }} numberOfLines={1}>{clubName}</Text>
                </View>
              ) : null}
              {terrainName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <MaterialIcons name="place" size={7} color={ct.textSecondary} />
                  <Text style={{ fontSize: 7, color: ct.textSecondary }} numberOfLines={1}>{terrainName}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <ShareCardWatermark variant="light" size="sm" />
        </LinearGradient>
      </View>
    );
  }

  // === STORY ===
  if (isStory) {
    return (
      <View style={s.card}>
        <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: 18, paddingBottom: 52, justifyContent: 'center' }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <MaterialIcons name="sports" size={13} color={ct.accent} />
              <Text style={{ fontSize: 9, fontWeight: '800', letterSpacing: 1.2, color: ct.accent }}>MATCH</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 9, fontWeight: '600', color: ct.textSecondary }}>{dateStr}</Text>
              {durationStr ? <Text style={{ fontSize: 8, color: ct.textSecondary }}>{durationStr}</Text> : null}
            </View>
          </View>

          {/* Meta */}
          <View style={{ flexDirection: 'row', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
            <View style={s.metaChip}><MaterialIcons name="group" size={10} color={ct.textSecondary} /><Text style={{ fontSize: 9, fontWeight: '600', color: ct.textSecondary }}>{match.format}</Text></View>
            <View style={[s.metaChip, match.mode === 'Tournoi' ? { backgroundColor: ct.accent + '20' } : null]}>
              <MaterialIcons name={match.mode === 'Tournoi' ? 'emoji-events' : 'fitness-center'} size={10} color={match.mode === 'Tournoi' ? ct.accent : ct.textSecondary} />
              <Text style={{ fontSize: 9, fontWeight: '600', color: match.mode === 'Tournoi' ? ct.accent : ct.textSecondary }}>{match.mode}</Text>
            </View>
            {match.tournamentName ? <View style={[s.metaChip, { backgroundColor: ct.accent + '15' }]}><Text style={{ fontSize: 9, fontWeight: '600', color: ct.accent }} numberOfLines={1}>{match.tournamentName}</Text></View> : null}
          </View>

          {/* Score */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
              <LinearGradient colors={isWinnerA ? winGrad : loseGrad} style={{ width: 58, height: 58, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 28, fontWeight: '900', color: '#FFF' }}>{match.teamA.score}</Text>
              </LinearGradient>
              <Text style={{ fontSize: 7, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.8 }}>{fr ? 'EQUIPE A' : 'TEAM A'}</Text>
              {match.teamA.playerNames.map((n, i) => (
                <TeamPlayerInfo key={i} name={n} info={pd[match.teamA.players?.[i]]} ct={ct} compact />
              ))}
            </View>
            <View style={{ width: 28, alignItems: 'center', gap: 3 }}>
              <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 8, fontWeight: '800', color: ct.textSecondary }}>VS</Text>
              </View>
              <MaterialIcons name={isWinnerA ? 'arrow-back' : 'arrow-forward'} size={10} color="#22C55E" />
            </View>
            <View style={{ flex: 1, alignItems: 'center', gap: 3 }}>
              <LinearGradient colors={!isWinnerA ? winGrad : loseGrad} style={{ width: 58, height: 58, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 28, fontWeight: '900', color: '#FFF' }}>{match.teamB.score}</Text>
              </LinearGradient>
              <Text style={{ fontSize: 7, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.8 }}>{fr ? 'EQUIPE B' : 'TEAM B'}</Text>
              {match.teamB.playerNames.map((n, i) => (
                <TeamPlayerInfo key={i} name={n} info={pd[match.teamB.players?.[i]]} ct={ct} compact />
              ))}
            </View>
          </View>

          {/* Mene bar + detail */}
          {hasMenes ? (
            <View style={{ alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontSize: 7, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.8, marginBottom: 3 }}>{match.menes.length} {fr ? 'MENES' : 'ENDS'}</Text>
              <MeneBar menes={match.menes} />
              <View style={{ flexDirection: 'row', gap: 4, marginTop: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
                {match.menes.slice(0, 8).map((m, i) => (
                  <View key={i} style={{ alignItems: 'center' }}>
                    <Text style={{ fontSize: 5, color: ct.textSecondary }}>{i + 1}</Text>
                    <Text style={{ fontSize: 6, fontWeight: '700', color: (m.teamAPoints || 0) > (m.teamBPoints || 0) ? '#22C55E' : '#EF4444' }}>
                      {m.teamAPoints}-{m.teamBPoints}
                    </Text>
                  </View>
                ))}
                {match.menes.length > 8 ? <Text style={{ fontSize: 6, color: ct.textSecondary, alignSelf: 'center' }}>+{match.menes.length - 8}</Text> : null}
              </View>
              {/* Momentum Chart */}
              <MomentumChart menes={match.menes} ct={ct} compact />
            </View>
          ) : null}

          {/* Actions + Heatmap */}
          {hasActions ? (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 6, marginBottom: 8 }}>
              <Text style={{ fontSize: 7, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.8, marginBottom: 3 }}>{fr ? 'ACTIONS JOUEURS' : 'PLAYER ACTIONS'}</Text>
              {match.playerActions!.slice(0, 4).map((pa, i) => <PlayerActionRow key={i} pa={pa} ct={ct} compact />)}
              <ActionHeatmap actions={match.playerActions!} ct={ct} compact />
            </View>
          ) : null}

          {/* Footer */}
          <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 6, gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {playerName ? <Text style={{ fontSize: 10, fontWeight: '700', color: ct.textPrimary }}>{playerName}</Text> : null}
              {eloRating ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: (eloColor || '#94A3B8') + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
                  <MaterialIcons name="diamond" size={8} color={eloColor || '#94A3B8'} />
                  <Text style={{ fontSize: 9, fontWeight: '700', color: eloColor || '#94A3B8' }}>ELO {eloRating}{eloRankLabel ? ` ${eloRankLabel}` : ''}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ gap: 2 }}>
                <GeoRankBadges geoRank={geoRank} compact />
                {clubName ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <MaterialIcons name="home" size={8} color={ct.textSecondary} />
                    <Text style={{ fontSize: 8, color: ct.textSecondary }} numberOfLines={1}>{clubName}</Text>
                  </View>
                ) : null}
              </View>
              {terrainName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <MaterialIcons name="place" size={8} color={ct.textSecondary} />
                  <Text style={{ fontSize: 8, color: ct.textSecondary }} numberOfLines={1}>{terrainName}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <ShareCardWatermark variant="light" size="sm" />
        </LinearGradient>
      </View>
    );
  }

  // === SQUARE (default) ===
  // Tight layout to fit all content + watermark in 1:1 format
  const squareMaxActions = 2;
  const squareMaxMenes = 5;
  return (
    <View style={s.card}>
      <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: 10, paddingBottom: 44, justifyContent: 'flex-start' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialIcons name="sports" size={11} color={ct.accent} />
            <Text style={{ fontSize: 8, fontWeight: '800', letterSpacing: 1, color: ct.accent }}>MATCH</Text>
            <View style={s.metaChip}><Text style={{ fontSize: 8, fontWeight: '600', color: ct.textSecondary }}>{match.format}</Text></View>
            <View style={[s.metaChip, match.mode === 'Tournoi' ? { backgroundColor: ct.accent + '20' } : null]}>
              <Text style={{ fontSize: 8, fontWeight: '600', color: match.mode === 'Tournoi' ? ct.accent : ct.textSecondary }}>{match.mode}</Text>
            </View>
          </View>
          <Text style={{ fontSize: 8, fontWeight: '500', color: ct.textSecondary }}>{dateStr}</Text>
        </View>

        {match.tournamentName ? (
          <View style={{ marginBottom: 4 }}>
            <Text style={{ fontSize: 9, fontWeight: '700', color: ct.accent }} numberOfLines={1}>{match.tournamentName}</Text>
          </View>
        ) : null}

        {/* Score */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <LinearGradient colors={isWinnerA ? winGrad : loseGrad} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFF' }}>{match.teamA.score}</Text>
            </LinearGradient>
            <Text style={{ fontSize: 6, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.5 }}>{fr ? 'EQ. A' : 'TM A'}</Text>
            {match.teamA.playerNames.slice(0, 3).map((n, i) => (
              <TeamPlayerInfo key={i} name={n} info={pd[match.teamA.players?.[i]]} ct={ct} compact />
            ))}
          </View>
          <View style={{ width: 24, alignItems: 'center', gap: 2 }}>
            <Text style={{ fontSize: 8, fontWeight: '800', color: ct.textSecondary }}>VS</Text>
            <MaterialIcons name={isWinnerA ? 'arrow-back' : 'arrow-forward'} size={9} color="#22C55E" />
          </View>
          <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <LinearGradient colors={!isWinnerA ? winGrad : loseGrad} style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: '#FFF' }}>{match.teamB.score}</Text>
            </LinearGradient>
            <Text style={{ fontSize: 6, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.5 }}>{fr ? 'EQ. B' : 'TM B'}</Text>
            {match.teamB.playerNames.slice(0, 3).map((n, i) => (
              <TeamPlayerInfo key={i} name={n} info={pd[match.teamB.players?.[i]]} ct={ct} compact />
            ))}
          </View>
        </View>

        {/* Mene bar (compact for square — limit items) */}
        {hasMenes ? (
          <View style={{ alignItems: 'center', marginBottom: 4 }}>
            <MeneBar menes={match.menes} compact />
            <View style={{ flexDirection: 'row', gap: 3, marginTop: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
              {match.menes.slice(0, squareMaxMenes).map((m, i) => (
                <View key={i} style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 5, color: ct.textSecondary }}>{i + 1}</Text>
                  <Text style={{ fontSize: 6, fontWeight: '700', color: (m.teamAPoints || 0) > (m.teamBPoints || 0) ? '#22C55E' : '#EF4444' }}>
                    {m.teamAPoints}-{m.teamBPoints}
                  </Text>
                </View>
              ))}
              {match.menes.length > squareMaxMenes ? <Text style={{ fontSize: 5, color: ct.textSecondary, alignSelf: 'center' }}>+{match.menes.length - squareMaxMenes}</Text> : null}
            </View>
          </View>
        ) : null}

        {/* Actions (compact, limited for square) */}
        {hasActions ? (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: 4, marginBottom: 4 }}>
            <Text style={{ fontSize: 5, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.5, marginBottom: 1 }}>ACTIONS</Text>
            {match.playerActions!.slice(0, squareMaxActions).map((pa, i) => <PlayerActionRow key={i} pa={pa} ct={ct} compact />)}
          </View>
        ) : null}

        {/* Footer */}
        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 4, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {playerName ? <Text style={{ fontSize: 9, fontWeight: '700', color: ct.textPrimary }}>{playerName}</Text> : null}
            {eloRating ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: (eloColor || '#94A3B8') + '20', paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 4 }}>
                <Text style={{ fontSize: 8, fontWeight: '700', color: eloColor || '#94A3B8' }}>ELO {eloRating}</Text>
              </View>
            ) : null}
            {durationStr ? <Text style={{ fontSize: 7, color: ct.textSecondary }}>{durationStr}</Text> : null}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
              <GeoRankBadges geoRank={geoRank} compact />
              {clubName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <MaterialIcons name="home" size={7} color={ct.textSecondary} />
                  <Text style={{ fontSize: 7, color: ct.textSecondary }} numberOfLines={1}>{clubName}</Text>
                </View>
              ) : null}
            </View>
            {terrainName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <MaterialIcons name="place" size={7} color={ct.textSecondary} />
                <Text style={{ fontSize: 7, color: ct.textSecondary }} numberOfLines={1}>{terrainName}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <ShareCardWatermark variant="light" size="xs" />
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
});
