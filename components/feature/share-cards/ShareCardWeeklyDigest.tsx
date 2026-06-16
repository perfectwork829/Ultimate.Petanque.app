/**
 * ShareCardWeeklyDigest — Weekly summary card for social sharing.
 * Shows weekly rank, matches played, ELO variation, win rate, best performance.
 * Adapts layout to square / story / landscape formats.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';
import { LeagueTier } from '@/services/globalRankingService';

interface GeoRankInfo {
  city?: { name?: string; rank?: number };
  country?: { name?: string; rank?: number };
}

interface Props {
  playerName: string;
  weekLabel: string; // e.g. "Semaine du 31 Mars" or "Week of March 31"
  weeklyRank?: number | null;
  weeklyRankChange?: { direction: 'up' | 'down' | 'same' | 'new'; diff: number };
  matchesPlayed: number;
  wins: number;
  winRate: number;
  eloDelta: number;
  currentElo: number;
  leagueTier: LeagueTier;
  tirRate?: number;
  carreauCount?: number;
  bestPerformance?: string; // e.g. "13-2 vs Team Alpha"
  clubName?: string;
  geoRank?: GeoRankInfo | null;
  isGoldPartner?: boolean;
  goldPartnerName?: string;
  goldBrandColor?: string;
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

function RankChangeBadge({ direction, diff, size = 'md' }: { direction: string; diff: number; size?: 'sm' | 'md' }) {
  const isSm = size === 'sm';
  const fs = isSm ? 8 : 10;
  const iconSize = isSm ? 10 : 13;
  if (direction === 'up') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#22C55E15', paddingHorizontal: isSm ? 4 : 6, paddingVertical: isSm ? 1.5 : 2.5, borderRadius: 6 }}>
        <MaterialIcons name="arrow-upward" size={iconSize} color="#22C55E" />
        <Text style={{ fontSize: fs, fontWeight: '800', color: '#22C55E' }}>+{diff}</Text>
      </View>
    );
  }
  if (direction === 'down') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#EF444415', paddingHorizontal: isSm ? 4 : 6, paddingVertical: isSm ? 1.5 : 2.5, borderRadius: 6 }}>
        <MaterialIcons name="arrow-downward" size={iconSize} color="#EF4444" />
        <Text style={{ fontSize: fs, fontWeight: '800', color: '#EF4444' }}>-{diff}</Text>
      </View>
    );
  }
  if (direction === 'new') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#3B82F615', paddingHorizontal: isSm ? 4 : 6, paddingVertical: isSm ? 1.5 : 2.5, borderRadius: 6 }}>
        <MaterialIcons name="fiber-new" size={iconSize} color="#3B82F6" />
        <Text style={{ fontSize: fs, fontWeight: '800', color: '#3B82F6' }}>NEW</Text>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: isSm ? 4 : 6, paddingVertical: isSm ? 1.5 : 2.5, borderRadius: 6 }}>
      <MaterialIcons name="remove" size={iconSize} color="#94A3B8" />
    </View>
  );
}

export default function ShareCardWeeklyDigest({
  playerName, weekLabel, weeklyRank, weeklyRankChange,
  matchesPlayed, wins, winRate, eloDelta, currentElo, leagueTier,
  tirRate, carreauCount, bestPerformance,
  clubName, geoRank,
  isGoldPartner, goldPartnerName, goldBrandColor,
  language = 'fr', colorTheme = 'dark', format = 'square',
}: Props) {
  const fr = language === 'fr';
  const ct = CARD_COLOR_THEMES[colorTheme];
  const isStory = format === 'story';
  const isLandscape = format === 'landscape';
  const tierGrad = leagueTier.gradient;

  // === LANDSCAPE ===
  if (isLandscape) {
    return (
      <View style={s.card}>
        <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: 10, paddingBottom: 44, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 }}>
            <MaterialIcons name="date-range" size={9} color={ct.accent} />
            <Text style={{ fontSize: 7, fontWeight: '800', letterSpacing: 1, color: ct.accent }}>{fr ? 'BILAN HEBDO' : 'WEEKLY DIGEST'}</Text>
            <Text style={{ fontSize: 6, fontWeight: '600', color: ct.textSecondary, marginLeft: 'auto' }}>{weekLabel}</Text>
          </View>
          <View style={{ flexDirection: 'row', flex: 1 }}>
            {/* Left: player + rank */}
            <View style={{ flex: 1, justifyContent: 'center', paddingRight: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                <LinearGradient colors={tierGrad} style={{ width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 13 }}>{leagueTier.emblem}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: ct.textPrimary }} numberOfLines={1}>{playerName}</Text>
                  <Text style={{ fontSize: 7, fontWeight: '600', color: ct.textSecondary }}>{currentElo} ELO</Text>
                </View>
              </View>
              {weeklyRank ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                  <Text style={{ fontSize: 8, fontWeight: '600', color: ct.textSecondary }}>#{weeklyRank}</Text>
                  {weeklyRankChange ? <RankChangeBadge direction={weeklyRankChange.direction} diff={weeklyRankChange.diff} size="sm" /> : null}
                </View>
              ) : null}
              {geoRank?.city?.rank ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 4, alignSelf: 'flex-start' }}>
                  <MaterialIcons name="place" size={7} color="#3B82F6" />
                  <Text style={{ fontSize: 7, fontWeight: '600', color: ct.textSecondary }}>#{geoRank.city.rank} {geoRank.city.name}</Text>
                </View>
              ) : null}
            </View>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 6 }} />
            {/* Right: stats */}
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                <View style={s.statBoxSm}><Text style={{ fontSize: 14, fontWeight: '900', color: ct.textPrimary }}>{matchesPlayed}</Text><Text style={{ fontSize: 6, color: ct.textSecondary }}>{fr ? 'Matchs' : 'Games'}</Text></View>
                <View style={[s.statBoxSm, { borderColor: '#22C55E20' }]}><Text style={{ fontSize: 14, fontWeight: '900', color: '#22C55E' }}>{winRate}%</Text><Text style={{ fontSize: 6, color: ct.textSecondary }}>{fr ? 'Victoires' : 'Win'}</Text></View>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <View style={[s.statBoxSm, { borderColor: eloDelta >= 0 ? '#22C55E20' : '#EF444420' }]}>
                  <Text style={{ fontSize: 14, fontWeight: '900', color: eloDelta >= 0 ? '#22C55E' : '#EF4444' }}>{eloDelta >= 0 ? '+' : ''}{eloDelta}</Text>
                  <Text style={{ fontSize: 6, color: ct.textSecondary }}>ELO</Text>
                </View>
                {carreauCount !== undefined ? (
                  <View style={[s.statBoxSm, { borderColor: '#F59E0B20' }]}>
                    <Text style={{ fontSize: 14, fontWeight: '900', color: '#F59E0B' }}>{carreauCount}</Text>
                    <Text style={{ fontSize: 6, color: ct.textSecondary }}>Carreaux</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          <ShareCardWatermark variant="light" size="sm" />
        </LinearGradient>
      </View>
    );
  }

  // === STORY / SQUARE ===
  const pad = isStory ? 18 : 16;
  const titleSize = isStory ? 17 : 16;
  const statFs = isStory ? 18 : 16;

  return (
    <View style={s.card}>
      <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: pad, paddingBottom: isStory ? 52 : 48, justifyContent: isStory ? 'center' : 'flex-start' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: isStory ? 5 : 6 }}>
          <MaterialIcons name="date-range" size={isStory ? 14 : 12} color={ct.accent} />
          <Text style={{ fontSize: isStory ? 10 : 8, fontWeight: '800', letterSpacing: 1.5, color: ct.accent }}>{fr ? 'BILAN HEBDO' : 'WEEKLY DIGEST'}</Text>
        </View>

        {/* Week label */}
        <Text style={{ fontSize: isStory ? 10 : 10, fontWeight: '600', color: ct.textSecondary, marginBottom: isStory ? 8 : 8 }}>{weekLabel}</Text>

        {/* Player + League */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isStory ? 10 : 10, marginBottom: isStory ? 12 : 12 }}>
          <LinearGradient colors={tierGrad} style={{ width: isStory ? 42 : 40, height: isStory ? 42 : 40, borderRadius: isStory ? 14 : 13, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' }}>
            <Text style={{ fontSize: isStory ? 22 : 20 }}>{leagueTier.emblem}</Text>
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: titleSize, fontWeight: '800', color: ct.textPrimary }}>{playerName}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={{ fontSize: isStory ? 12 : 10, fontWeight: '700', color: leagueTier.color }}>{fr ? leagueTier.name.fr : leagueTier.name.en}</Text>
              {clubName ? <Text style={{ fontSize: isStory ? 10 : 8, fontWeight: '500', color: ct.textSecondary }}>{clubName}</Text> : null}
            </View>
          </View>
          {weeklyRank ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontSize: isStory ? 22 : 17, fontWeight: '900', color: ct.textPrimary }}>#{weeklyRank}</Text>
              {weeklyRankChange ? <RankChangeBadge direction={weeklyRankChange.direction} diff={weeklyRankChange.diff} size="sm" /> : null}
            </View>
          ) : null}
        </View>

        {/* Main stats grid */}
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: isStory ? 8 : 8 }}>
          <View style={s.statBox}><Text style={{ fontSize: statFs, fontWeight: '900', color: ct.textPrimary }}>{matchesPlayed}</Text><Text style={s.statLabel}>{fr ? 'Matchs' : 'Games'}</Text></View>
          <View style={[s.statBox, { borderColor: '#22C55E20' }]}><Text style={{ fontSize: statFs, fontWeight: '900', color: '#22C55E' }}>{wins}</Text><Text style={s.statLabel}>{fr ? 'Victoires' : 'Wins'}</Text></View>
          <View style={[s.statBox, { borderColor: '#22C55E20' }]}><Text style={{ fontSize: statFs, fontWeight: '900', color: '#22C55E' }}>{winRate}%</Text><Text style={s.statLabel}>{fr ? 'Win Rate' : 'Win Rate'}</Text></View>
        </View>

        {/* ELO delta + secondary stats */}
        <View style={{ flexDirection: 'row', gap: 4, marginBottom: isStory ? 8 : 8 }}>
          <View style={[s.statBox, { borderColor: eloDelta >= 0 ? '#22C55E20' : '#EF444420' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MaterialIcons name={eloDelta >= 0 ? 'trending-up' : 'trending-down'} size={isStory ? 16 : 12} color={eloDelta >= 0 ? '#22C55E' : '#EF4444'} />
              <Text style={{ fontSize: statFs, fontWeight: '900', color: eloDelta >= 0 ? '#22C55E' : '#EF4444' }}>{eloDelta >= 0 ? '+' : ''}{eloDelta}</Text>
            </View>
            <Text style={s.statLabel}>ELO ({currentElo})</Text>
          </View>
          {tirRate !== undefined ? (
            <View style={[s.statBox, { borderColor: '#3B82F620' }]}>
              <Text style={{ fontSize: statFs, fontWeight: '900', color: '#3B82F6' }}>{tirRate}%</Text>
              <Text style={s.statLabel}>{fr ? 'Tir' : 'Shot'}</Text>
            </View>
          ) : null}
          {carreauCount !== undefined ? (
            <View style={[s.statBox, { borderColor: '#F59E0B20' }]}>
              <Text style={{ fontSize: statFs, fontWeight: '900', color: '#F59E0B' }}>{carreauCount}</Text>
              <Text style={s.statLabel}>Carreaux</Text>
            </View>
          ) : null}
        </View>

        {/* Best performance highlight */}
        {bestPerformance ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: isStory ? 8 : 6, backgroundColor: '#F59E0B10', borderRadius: 10, paddingHorizontal: isStory ? 12 : 8, paddingVertical: isStory ? 8 : 6, marginBottom: isStory ? 10 : 6, borderWidth: 1, borderColor: '#F59E0B15' }}>
            <MaterialIcons name="star" size={isStory ? 14 : 11} color="#F59E0B" />
            <Text style={{ fontSize: isStory ? 11 : 9, fontWeight: '700', color: '#F59E0B', flex: 1 }} numberOfLines={1}>{bestPerformance}</Text>
          </View>
        ) : null}

        {/* Gold Partner Highlight */}
        {isGoldPartner && goldPartnerName ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: isStory ? 8 : 6, backgroundColor: (goldBrandColor || '#D4A017') + '18', borderRadius: 10, paddingHorizontal: isStory ? 12 : 8, paddingVertical: isStory ? 8 : 6, marginBottom: isStory ? 10 : 6, borderWidth: 1.5, borderColor: (goldBrandColor || '#D4A017') + '30' }}>
            <MaterialIcons name="star" size={isStory ? 14 : 11} color={goldBrandColor || '#D4A017'} />
            <Text style={{ fontSize: isStory ? 11 : 9, fontWeight: '800', color: goldBrandColor || '#D4A017', flex: 1 }}>{fr ? 'PARTENAIRE OR' : 'GOLD PARTNER'} {goldPartnerName}</Text>
          </View>
        ) : null}

        {/* Geo ranks */}
        {geoRank ? (
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: isStory ? 6 : 4 }}>
            {geoRank.city?.rank ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                <MaterialIcons name="place" size={isStory ? 9 : 7} color="#3B82F6" />
                <Text style={{ fontSize: isStory ? 9 : 7, fontWeight: '600', color: ct.textSecondary }}>#{geoRank.city.rank} {geoRank.city.name}</Text>
              </View>
            ) : null}
            {geoRank.country?.rank ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                <MaterialIcons name="flag" size={isStory ? 9 : 7} color="#10B981" />
                <Text style={{ fontSize: isStory ? 9 : 7, fontWeight: '600', color: ct.textSecondary }}>#{geoRank.country.rank} {geoRank.country.name}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <ShareCardWatermark variant="light" size={isStory ? 'sm' : 'xs'} />
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
  statBox: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statBoxSm: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statLabel: { fontSize: 8, fontWeight: '600', color: '#64748B', letterSpacing: 0.3 },
});
