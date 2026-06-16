/**
 * ShareCardEventLeaderboard — Event leaderboard card for social sharing.
 * Shows top participants from sponsored events with podium, scores, and stats.
 * Adapts layout to square / story / landscape formats.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';

interface LeaderboardEntry {
  userName: string;
  wins: number;
  podiums: number;
  avgScore: number;
  eventsCompleted: number;
  isCurrentUser?: boolean;
}

interface Props {
  entries: LeaderboardEntry[];
  eventTitle?: string;
  totalEvents: number;
  totalParticipants: number;
  playerName?: string;
  playerRank?: number;
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

const PODIUM_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const PODIUM_ICONS: string[] = ['emoji-events', 'workspace-premium', 'military-tech'];

export default function ShareCardEventLeaderboard({
  entries, eventTitle, totalEvents, totalParticipants, playerName, playerRank,
  language = 'fr', colorTheme = 'purple', format = 'square',
}: Props) {
  const fr = language === 'fr';
  const ct = CARD_COLOR_THEMES[colorTheme];
  const isStory = format === 'story';
  const isLandscape = format === 'landscape';

  const top3 = entries.slice(0, 3);
  const restEntries = entries.slice(3);

  // === LANDSCAPE ===
  if (isLandscape) {
    return (
      <View style={s.card}>
        <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: 10, paddingBottom: 44, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MaterialIcons name="leaderboard" size={9} color={ct.accent} />
              <Text style={{ fontSize: 7, fontWeight: '800', letterSpacing: 1, color: ct.accent }}>{fr ? 'CLASSEMENT DEFIS' : 'EVENT LEADERBOARD'}</Text>
            </View>
            <Text style={{ fontSize: 7, color: ct.textSecondary }}>{totalEvents} {fr ? 'evenements' : 'events'} - {totalParticipants} {fr ? 'joueurs' : 'players'}</Text>
          </View>

          <View style={{ flexDirection: 'row', flex: 1 }}>
            {/* Left: podium */}
            <View style={{ flex: 1, justifyContent: 'center' }}>
              {top3.map((entry, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, borderBottomWidth: idx < 2 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: PODIUM_COLORS[idx] + '20', alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name={PODIUM_ICONS[idx] as any} size={9} color={PODIUM_COLORS[idx]} />
                  </View>
                  <Text style={{ fontSize: 9, fontWeight: entry.isCurrentUser ? '800' : '600', color: entry.isCurrentUser ? ct.accent : ct.textPrimary, flex: 1 }} numberOfLines={1}>{entry.userName}</Text>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: '#FFD700' }}>{entry.wins}W</Text>
                  <Text style={{ fontSize: 8, fontWeight: '600', color: ct.textSecondary }}>{entry.avgScore.toFixed(1)}</Text>
                </View>
              ))}
            </View>

            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 6 }} />

            {/* Right: current player rank + more entries */}
            <View style={{ width: '35%', justifyContent: 'center' }}>
              {playerRank && playerName ? (
                <View style={{ backgroundColor: ct.accent + '15', borderRadius: 8, padding: 6, marginBottom: 4, borderWidth: 1, borderColor: ct.accent + '30' }}>
                  <Text style={{ fontSize: 7, fontWeight: '600', color: ct.textSecondary }}>{fr ? 'MON RANG' : 'MY RANK'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 2 }}>
                    <Text style={{ fontSize: 16, fontWeight: '900', color: ct.accent }}>#{playerRank}</Text>
                    <Text style={{ fontSize: 8, fontWeight: '600', color: ct.textPrimary }} numberOfLines={1}>{playerName}</Text>
                  </View>
                </View>
              ) : null}
              {restEntries.slice(0, 3).map((entry, idx) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 7, fontWeight: '700', color: ct.textSecondary, width: 14 }}>#{idx + 4}</Text>
                  <Text style={{ fontSize: 7, fontWeight: entry.isCurrentUser ? '800' : '500', color: entry.isCurrentUser ? ct.accent : ct.textSecondary, flex: 1 }} numberOfLines={1}>{entry.userName}</Text>
                  <Text style={{ fontSize: 7, color: '#64748B' }}>{entry.avgScore.toFixed(1)}</Text>
                </View>
              ))}
            </View>
          </View>
          <ShareCardWatermark variant="light" size="sm" />
        </LinearGradient>
      </View>
    );
  }

  // === STORY / SQUARE ===
  const pad = isStory ? 24 : 14;
  const maxEntries = isStory ? 10 : 6;

  return (
    <View style={s.card}>
      <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: pad, paddingBottom: isStory ? 56 : 48, justifyContent: isStory ? 'center' : 'flex-start' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: isStory ? 14 : 10 }}>
          <View style={{ backgroundColor: ct.accent + '20', width: isStory ? 36 : 30, height: isStory ? 36 : 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name="leaderboard" size={isStory ? 20 : 17} color={ct.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8, fontWeight: '800', letterSpacing: 1.5, color: ct.accent }}>{fr ? 'CLASSEMENT DEFIS' : 'EVENT LEADERBOARD'}</Text>
            {eventTitle ? (
              <Text style={{ fontSize: isStory ? 12 : 10, fontWeight: '700', color: ct.textPrimary, marginTop: 1 }} numberOfLines={1}>{eventTitle}</Text>
            ) : null}
          </View>
        </View>

        {/* Stats bar */}
        <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 6, marginBottom: isStory ? 14 : 10 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: isStory ? 16 : 14, fontWeight: '800', color: ct.textPrimary }}>{totalEvents}</Text>
            <Text style={{ fontSize: 8, color: ct.textSecondary }}>{fr ? 'Evenements' : 'Events'}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: isStory ? 16 : 14, fontWeight: '800', color: ct.textPrimary }}>{totalParticipants}</Text>
            <Text style={{ fontSize: 8, color: ct.textSecondary }}>{fr ? 'Joueurs' : 'Players'}</Text>
          </View>
          {playerRank ? (
            <>
              <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: isStory ? 16 : 14, fontWeight: '900', color: ct.accent }}>#{playerRank}</Text>
                <Text style={{ fontSize: 8, color: ct.textSecondary }}>{fr ? 'Mon rang' : 'My rank'}</Text>
              </View>
            </>
          ) : null}
        </View>

        {/* Podium top 3 */}
        {top3.length >= 3 ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: isStory ? 14 : 10, marginBottom: isStory ? 14 : 10 }}>
            {/* 2nd */}
            <View style={{ alignItems: 'center', gap: 3 }}>
              <MaterialIcons name="workspace-premium" size={isStory ? 20 : 16} color="#C0C0C0" />
              <Text style={{ fontSize: isStory ? 11 : 9, fontWeight: '700', color: top3[1].isCurrentUser ? ct.accent : ct.textPrimary, maxWidth: 70, textAlign: 'center' }} numberOfLines={1}>{top3[1].userName}</Text>
              <View style={{ backgroundColor: '#C0C0C020', width: isStory ? 60 : 50, height: isStory ? 40 : 30, borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: isStory ? 14 : 12, fontWeight: '900', color: '#C0C0C0' }}>2</Text>
              </View>
            </View>
            {/* 1st */}
            <View style={{ alignItems: 'center', gap: 3 }}>
              <MaterialIcons name="emoji-events" size={isStory ? 26 : 22} color="#FFD700" />
              <Text style={{ fontSize: isStory ? 12 : 10, fontWeight: '800', color: top3[0].isCurrentUser ? ct.accent : ct.textPrimary, maxWidth: 80, textAlign: 'center' }} numberOfLines={1}>{top3[0].userName}</Text>
              <View style={{ backgroundColor: '#FFD70020', width: isStory ? 68 : 56, height: isStory ? 56 : 44, borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: isStory ? 18 : 16, fontWeight: '900', color: '#FFD700' }}>1</Text>
              </View>
            </View>
            {/* 3rd */}
            <View style={{ alignItems: 'center', gap: 3 }}>
              <MaterialIcons name="military-tech" size={isStory ? 20 : 16} color="#CD7F32" />
              <Text style={{ fontSize: isStory ? 11 : 9, fontWeight: '700', color: top3[2].isCurrentUser ? ct.accent : ct.textPrimary, maxWidth: 70, textAlign: 'center' }} numberOfLines={1}>{top3[2].userName}</Text>
              <View style={{ backgroundColor: '#CD7F3220', width: isStory ? 60 : 50, height: isStory ? 32 : 24, borderTopLeftRadius: 8, borderTopRightRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: isStory ? 14 : 12, fontWeight: '900', color: '#CD7F32' }}>3</Text>
              </View>
            </View>
          </View>
        ) : null}

        {/* Full ranking list */}
        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: isStory ? 10 : 6 }}>
          {/* Table header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 4, marginBottom: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
            <Text style={{ fontSize: 7, fontWeight: '700', color: '#64748B', width: 22 }}>#</Text>
            <Text style={{ fontSize: 7, fontWeight: '700', color: '#64748B', flex: 1 }}>{fr ? 'JOUEUR' : 'PLAYER'}</Text>
            <Text style={{ fontSize: 7, fontWeight: '700', color: '#FFD700', width: 22, textAlign: 'center' }}>W</Text>
            <Text style={{ fontSize: 7, fontWeight: '700', color: '#64748B', width: 22, textAlign: 'center' }}>P</Text>
            <Text style={{ fontSize: 7, fontWeight: '700', color: '#64748B', width: 30, textAlign: 'right' }}>AVG</Text>
          </View>
          {entries.slice(0, maxEntries).map((entry, idx) => {
            const isTop3 = idx < 3;
            return (
              <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: isStory ? 4 : 3, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)', backgroundColor: entry.isCurrentUser ? ct.accent + '08' : 'transparent', paddingHorizontal: entry.isCurrentUser ? 4 : 0, borderRadius: entry.isCurrentUser ? 6 : 0 }}>
                <View style={{ width: 22, alignItems: 'center' }}>
                  {isTop3 ? (
                    <MaterialIcons name={PODIUM_ICONS[idx] as any} size={isStory ? 12 : 10} color={PODIUM_COLORS[idx]} />
                  ) : (
                    <Text style={{ fontSize: isStory ? 10 : 9, fontWeight: '700', color: entry.isCurrentUser ? ct.accent : ct.textSecondary }}>{idx + 1}</Text>
                  )}
                </View>
                <Text style={{ fontSize: isStory ? 11 : 9, fontWeight: entry.isCurrentUser ? '800' : '600', color: entry.isCurrentUser ? ct.accent : ct.textPrimary, flex: 1 }} numberOfLines={1}>{entry.userName}</Text>
                <Text style={{ fontSize: isStory ? 10 : 9, fontWeight: '800', color: '#FFD700', width: 22, textAlign: 'center' }}>{entry.wins}</Text>
                <Text style={{ fontSize: isStory ? 10 : 9, fontWeight: '600', color: ct.textSecondary, width: 22, textAlign: 'center' }}>{entry.podiums}</Text>
                <Text style={{ fontSize: isStory ? 10 : 9, fontWeight: '700', color: ct.textSecondary, width: 30, textAlign: 'right' }}>{entry.avgScore.toFixed(1)}</Text>
              </View>
            );
          })}
          {entries.length > maxEntries ? (
            <Text style={{ fontSize: 7, color: '#64748B', textAlign: 'center', marginTop: 4 }}>+{entries.length - maxEntries} {fr ? 'joueurs' : 'players'}</Text>
          ) : null}
        </View>

        <ShareCardWatermark variant="light" size={isStory ? 'sm' : 'xs'} />
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
});
