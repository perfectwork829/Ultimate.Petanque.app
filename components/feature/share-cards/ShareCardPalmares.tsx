/**
 * ShareCardPalmares — Palmares (career trophy case) card for social sharing.
 * Shows tournament history grouped by season, podium counts, titles,
 * and overall career stats.
 * Adapts layout to square / story / landscape formats.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';

interface TournamentSummary {
  name: string;
  date: string;
  result?: string;
  format?: string;
  city?: string;
}

interface SeasonGroup {
  year: number;
  tournaments: TournamentSummary[];
  titles: number;
  podiums: number;
  totalMatches: number;
  wins: number;
}

interface Props {
  playerName?: string;
  eloRating?: number;
  eloColor?: string;
  eloRankLabel?: string;
  clubName?: string;
  geoRank?: { city?: { name?: string; rank?: number }; country?: { name?: string; rank?: number } } | null;
  seasons: SeasonGroup[];
  totalTournaments: number;
  totalTitles: number;
  totalPodiums: number;
  totalMatches: number;
  totalWins: number;
  avgWinRate: number;
  totalCarreaux: number;
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

const RESULT_COLORS: Record<string, string> = {
  '1er': '#FFD700',
  '2ème': '#C0C0C0',
  '3ème': '#CD7F32',
  'Demi-finale': '#8B5CF6',
  'Quart de finale': '#3B82F6',
};

const RESULT_ICONS: Record<string, string> = {
  '1er': 'emoji-events',
  '2ème': 'workspace-premium',
  '3ème': 'military-tech',
};

function ResultBadge({ result, compact }: { result?: string; compact?: boolean }) {
  if (!result) return null;
  const color = RESULT_COLORS[result] || '#94A3B8';
  const icon = RESULT_ICONS[result];
  const fs = compact ? 7 : 9;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: color + '20', paddingHorizontal: compact ? 4 : 6, paddingVertical: compact ? 1 : 2, borderRadius: 5 }}>
      {icon ? <MaterialIcons name={icon as any} size={compact ? 7 : 9} color={color} /> : null}
      <Text style={{ fontSize: fs, fontWeight: '800', color }}>{result}</Text>
    </View>
  );
}

function GeoRankBadges({ geoRank, compact }: { geoRank?: Props['geoRank']; compact?: boolean }) {
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

export default function ShareCardPalmares({
  playerName, eloRating, eloColor, eloRankLabel, clubName, geoRank,
  seasons, totalTournaments, totalTitles, totalPodiums, totalMatches,
  totalWins, avgWinRate, totalCarreaux,
  language = 'fr', colorTheme = 'gold', format = 'square',
}: Props) {
  const fr = language === 'fr';
  const ct = CARD_COLOR_THEMES[colorTheme];
  const isStory = format === 'story';
  const isLandscape = format === 'landscape';

  // === LANDSCAPE ===
  if (isLandscape) {
    return (
      <View style={s.card}>
        <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: 10, paddingBottom: 44, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MaterialIcons name="emoji-events" size={9} color="#FFD700" />
              <Text style={{ fontSize: 7, fontWeight: '800', letterSpacing: 1, color: ct.accent }}>{fr ? 'PALMARES' : 'CAREER'}</Text>
            </View>
            {playerName ? <Text style={{ fontSize: 8, fontWeight: '700', color: ct.textPrimary }} numberOfLines={1}>{playerName}</Text> : null}
          </View>

          <View style={{ flexDirection: 'row', flex: 1 }}>
            {/* Left: podium + stats */}
            <View style={{ flex: 1, justifyContent: 'center', paddingRight: 8 }}>
              {/* Mini podium */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, marginBottom: 6 }}>
                <View style={{ alignItems: 'center' }}>
                  <MaterialIcons name="workspace-premium" size={14} color="#C0C0C0" />
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#C0C0C0' }}>{totalPodiums - totalTitles > 0 ? totalPodiums - totalTitles : 0}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <MaterialIcons name="emoji-events" size={18} color="#FFD700" />
                  <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFD700' }}>{totalTitles}</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <MaterialIcons name="military-tech" size={14} color="#CD7F32" />
                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#CD7F32' }}>
                    {seasons.reduce((s, g) => s + g.tournaments.filter(t => t.result === '3ème').length, 0)}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                  <Text style={{ fontSize: 7, fontWeight: '600', color: ct.textSecondary }}>{totalTournaments} {fr ? 'tournois' : 'events'}</Text>
                </View>
                <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                  <Text style={{ fontSize: 7, fontWeight: '600', color: ct.textSecondary }}>{avgWinRate}% {fr ? 'vict.' : 'win'}</Text>
                </View>
                {eloRating ? (
                  <View style={{ backgroundColor: (eloColor || '#94A3B8') + '20', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                    <Text style={{ fontSize: 7, fontWeight: '700', color: eloColor || '#94A3B8' }}>ELO {eloRating}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 6 }} />

            {/* Right: season list */}
            <View style={{ flex: 1.2, justifyContent: 'center' }}>
              {seasons.slice(0, 3).map(season => (
                <View key={season.year} style={{ marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: ct.accent }}>{season.year}</Text>
                    {season.titles > 0 ? <MaterialIcons name="emoji-events" size={8} color="#FFD700" /> : null}
                    <Text style={{ fontSize: 7, color: ct.textSecondary }}>{season.tournaments.length} {fr ? 'tournois' : 'events'}</Text>
                  </View>
                  {season.tournaments.slice(0, 2).map((t, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingLeft: 4, marginBottom: 1 }}>
                      <ResultBadge result={t.result} compact />
                      <Text style={{ fontSize: 7, color: ct.textPrimary, flex: 1, flexShrink: 1 }} numberOfLines={1}>{t.name}</Text>
                    </View>
                  ))}
                  {season.tournaments.length > 2 ? (
                    <Text style={{ fontSize: 6, color: '#64748B', paddingLeft: 4 }}>+{season.tournaments.length - 2}</Text>
                  ) : null}
                </View>
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
  const pad = isStory ? 24 : 14;
  const maxSeasons = isStory ? 5 : 2;
  const maxTournamentsPerSeason = isStory ? 4 : 2;

  return (
    <View style={s.card}>
      <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: pad, paddingBottom: isStory ? 56 : 48, justifyContent: isStory ? 'center' : 'flex-start' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: isStory ? 14 : 10 }}>
          <View style={{ backgroundColor: '#FFD70020', width: isStory ? 36 : 30, height: isStory ? 36 : 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name="emoji-events" size={isStory ? 20 : 17} color="#FFD700" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8, fontWeight: '800', letterSpacing: 1.5, color: ct.accent }}>{fr ? 'PALMARES' : 'CAREER'}</Text>
            {playerName ? <Text style={{ fontSize: isStory ? 14 : 12, fontWeight: '800', color: ct.textPrimary, marginTop: 1 }} numberOfLines={1}>{playerName}</Text> : null}
          </View>
          {eloRating ? (
            <View style={{ backgroundColor: (eloColor || '#94A3B8') + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
              <Text style={{ fontSize: 10, fontWeight: '800', color: eloColor || '#94A3B8' }}>ELO {eloRating}</Text>
              {eloRankLabel ? <Text style={{ fontSize: 7, fontWeight: '600', color: eloColor || '#94A3B8', textAlign: 'center' }}>{eloRankLabel}</Text> : null}
            </View>
          ) : null}
        </View>

        {/* Podium */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: isStory ? 16 : 12, marginBottom: isStory ? 16 : 10 }}>
          <View style={{ alignItems: 'center' }}>
            <MaterialIcons name="workspace-premium" size={isStory ? 22 : 18} color="#C0C0C0" />
            <Text style={{ fontSize: isStory ? 22 : 18, fontWeight: '900', color: '#C0C0C0' }}>
              {seasons.reduce((s, g) => s + g.tournaments.filter(t => t.result === '2ème').length, 0)}
            </Text>
            <Text style={{ fontSize: 7, fontWeight: '600', color: '#64748B' }}>{fr ? '2e' : '2nd'}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <MaterialIcons name="emoji-events" size={isStory ? 30 : 24} color="#FFD700" />
            <Text style={{ fontSize: isStory ? 30 : 24, fontWeight: '900', color: '#FFD700' }}>{totalTitles}</Text>
            <Text style={{ fontSize: 8, fontWeight: '700', color: '#FFD700' }}>{fr ? '1er' : '1st'}</Text>
          </View>
          <View style={{ alignItems: 'center' }}>
            <MaterialIcons name="military-tech" size={isStory ? 22 : 18} color="#CD7F32" />
            <Text style={{ fontSize: isStory ? 22 : 18, fontWeight: '900', color: '#CD7F32' }}>
              {seasons.reduce((s, g) => s + g.tournaments.filter(t => t.result === '3ème').length, 0)}
            </Text>
            <Text style={{ fontSize: 7, fontWeight: '600', color: '#64748B' }}>{fr ? '3e' : '3rd'}</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: isStory ? 10 : 8, paddingHorizontal: 6, marginBottom: isStory ? 14 : 10 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: isStory ? 16 : 14, fontWeight: '800', color: ct.textPrimary }}>{totalTournaments}</Text>
            <Text style={{ fontSize: 8, color: ct.textSecondary }}>{fr ? 'Tournois' : 'Events'}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: isStory ? 16 : 14, fontWeight: '800', color: '#22C55E' }}>{avgWinRate}%</Text>
            <Text style={{ fontSize: 8, color: ct.textSecondary }}>{fr ? 'Victoires' : 'Win Rate'}</Text>
          </View>
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: isStory ? 16 : 14, fontWeight: '800', color: '#FBBF24' }}>{totalCarreaux}</Text>
            <Text style={{ fontSize: 8, color: ct.textSecondary }}>Carreaux</Text>
          </View>
          <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: isStory ? 16 : 14, fontWeight: '800', color: ct.textPrimary }}>{totalPodiums}</Text>
            <Text style={{ fontSize: 8, color: ct.textSecondary }}>{fr ? 'Podiums' : 'Podiums'}</Text>
          </View>
        </View>

        {/* Seasons list */}
        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: isStory ? 12 : 8, marginBottom: isStory ? 10 : 4, flex: isStory ? undefined : 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <MaterialIcons name="history" size={10} color={ct.accent} />
            <Text style={{ fontSize: 8, fontWeight: '700', letterSpacing: 0.8, color: ct.accent }}>{fr ? 'PAR SAISON' : 'BY SEASON'}</Text>
          </View>
          {seasons.slice(0, maxSeasons).map(season => (
            <View key={season.year} style={{ marginBottom: isStory ? 10 : 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                <View style={{ backgroundColor: ct.accent + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                  <Text style={{ fontSize: isStory ? 11 : 10, fontWeight: '800', color: ct.accent }}>{season.year}</Text>
                </View>
                {season.titles > 0 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <MaterialIcons name="emoji-events" size={9} color="#FFD700" />
                    <Text style={{ fontSize: 8, fontWeight: '700', color: '#FFD700' }}>x{season.titles}</Text>
                  </View>
                ) : null}
                <Text style={{ fontSize: 8, color: ct.textSecondary, flexShrink: 1 }} numberOfLines={1}>{season.tournaments.length} {fr ? 'tournois' : 'events'} - {season.wins}V/{season.totalMatches - season.wins}D</Text>
              </View>
              {season.tournaments.slice(0, maxTournamentsPerSeason).map((t, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 8, marginBottom: 2 }}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: RESULT_COLORS[t.result || ''] || '#64748B' }} />
                  <ResultBadge result={t.result} compact={!isStory} />
                  <Text style={{ fontSize: isStory ? 10 : 9, fontWeight: '600', color: ct.textPrimary, flex: 1, flexShrink: 1 }} numberOfLines={1}>{t.name}</Text>
                  {t.city ? <Text style={{ fontSize: 7, color: '#64748B' }}>{t.city}</Text> : null}
                </View>
              ))}
              {season.tournaments.length > maxTournamentsPerSeason ? (
                <Text style={{ fontSize: 7, color: '#64748B', paddingLeft: 8, marginTop: 1 }}>+{season.tournaments.length - maxTournamentsPerSeason} {fr ? 'tournois' : 'more'}</Text>
              ) : null}
            </View>
          ))}
          {seasons.length > maxSeasons ? (
            <Text style={{ fontSize: 8, color: '#64748B', textAlign: 'center' }}>+{seasons.length - maxSeasons} {fr ? 'saisons' : 'seasons'}</Text>
          ) : null}
        </View>

        {/* Footer */}
        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 6, gap: 3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <GeoRankBadges geoRank={geoRank} compact={!isStory} />
            {clubName ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <MaterialIcons name="home" size={8} color="#64748B" />
                <Text style={{ fontSize: 8, fontWeight: '500', color: '#64748B' }} numberOfLines={1}>{clubName}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <ShareCardWatermark variant="light" size={isStory ? 'sm' : 'xs'} />
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
});
