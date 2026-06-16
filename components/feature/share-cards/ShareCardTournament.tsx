/**
 * ShareCardTournament — Tournament result card for social sharing.
 * Shows name, result, format, type, ELO, geo ranks, club.
 * Adapts layout to square / story / landscape formats without truncation.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';
import type { Tournament } from '@/types/petanque';

interface GeoRankInfo {
  city?: { name?: string; rank?: number };
  country?: { name?: string; rank?: number };
}

interface TournamentMatchInfo {
  id: string;
  teamANames: string[];
  teamBNames: string[];
  scoreA: number;
  scoreB: number;
  winner: 'A' | 'B';
  tournamentPhase?: string;
}

interface GoldSponsorInfo {
  displayName: string;
  photo?: string;
}

interface Props {
  tournament: Tournament;
  playerName?: string;
  eloRating?: number;
  eloColor?: string;
  eloRankLabel?: string;
  clubName?: string;
  geoRank?: GeoRankInfo | null;
  tournamentMatches?: TournamentMatchInfo[];
  goldSponsor?: GoldSponsorInfo | null;
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

const STATUS_CONFIG: Record<string, { color: string; icon: string }> = {
  'Terminé': { color: '#22C55E', icon: 'check-circle' },
  'En cours': { color: '#F59E0B', icon: 'play-circle-filled' },
  'À venir': { color: '#3B82F6', icon: 'schedule' },
};

const RESULT_LABELS: Record<string, { fr: string; en: string; color: string; icon: string }> = {
  '1er': { fr: '1er - Champion', en: '1st - Champion', color: '#FFD700', icon: 'emoji-events' },
  '2ème': { fr: '2eme - Finaliste', en: '2nd - Finalist', color: '#C0C0C0', icon: 'workspace-premium' },
  '3ème': { fr: '3eme', en: '3rd', color: '#CD7F32', icon: 'military-tech' },
  'Demi-finale': { fr: 'Demi-finale', en: 'Semi-final', color: '#8B5CF6', icon: 'trending-up' },
  'Quart de finale': { fr: 'Quart de finale', en: 'Quarter-final', color: '#3B82F6', icon: 'format-list-numbered' },
};

function getResultConfig(result: string | undefined, fr: boolean): { label: string; color: string; icon: string } | null {
  if (!result) return null;
  const cfg = RESULT_LABELS[result];
  if (cfg) return { label: fr ? cfg.fr : cfg.en, color: cfg.color, icon: cfg.icon };
  return { label: result, color: '#94A3B8', icon: 'info' };
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

export default function ShareCardTournament({ tournament, playerName, eloRating, eloColor, eloRankLabel, clubName, geoRank, tournamentMatches, goldSponsor, language = 'fr', colorTheme = 'dark', format = 'square' }: Props) {
  const fr = language === 'fr';
  const ct = CARD_COLOR_THEMES[colorTheme];
  const status = STATUS_CONFIG[tournament.status] || STATUS_CONFIG['À venir'];
  const resultCfg = getResultConfig(tournament.finalResult, fr);
  const dateStr = new Date(tournament.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  const hasEndDate = tournament.endDate && tournament.endDate !== tournament.date;
  const endDateStr = hasEndDate ? new Date(tournament.endDate!).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' }) : null;

  const isStory = format === 'story';
  const isLandscape = format === 'landscape';

  // === LANDSCAPE ===
  if (isLandscape) {
    return (
      <View style={s.card}>
        <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: 10, paddingBottom: 44, justifyContent: 'space-between' }}>
          {/* Top header */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MaterialIcons name="emoji-events" size={9} color="#F59E0B" />
              <Text style={{ fontSize: 7, fontWeight: '800', letterSpacing: 1, color: ct.accent }}>{fr ? 'TOURNOI' : 'TOURNAMENT'}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MaterialIcons name={status.icon as any} size={7} color={status.color} />
              <Text style={{ fontSize: 6, fontWeight: '700', color: status.color }}>{tournament.status}</Text>
              <Text style={{ fontSize: 7, color: ct.textSecondary }}>{dateStr}{endDateStr ? ` - ${endDateStr}` : ''}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', flex: 1 }}>
            {/* Left: name + result */}
            <View style={{ flex: 1, justifyContent: 'center', paddingRight: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: ct.textPrimary, marginBottom: 3, lineHeight: 15, flexShrink: 1 }} numberOfLines={2}>{tournament.name}</Text>
              {resultCfg ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: resultCfg.color + '30', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 6, marginBottom: 4 }}>
                  <MaterialIcons name={resultCfg.icon as any} size={12} color={resultCfg.color} />
                  <Text style={{ fontSize: 9, fontWeight: '800', color: resultCfg.color }}>{resultCfg.label}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                {playerName ? <Text style={{ fontSize: 9, fontWeight: '700', color: ct.textPrimary }} numberOfLines={1}>{playerName}</Text> : null}
                {eloRating ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: (eloColor || '#94A3B8') + '20', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                    <Text style={{ fontSize: 8, fontWeight: '700', color: eloColor || '#94A3B8' }}>ELO {eloRating}{eloRankLabel ? ` ${eloRankLabel}` : ''}</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ marginTop: 3, gap: 2 }}>
                <GeoRankBadges geoRank={geoRank} compact />
                {clubName ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                    <MaterialIcons name="home" size={7} color={ct.textSecondary} />
                    <Text style={{ fontSize: 7, color: ct.textSecondary }} numberOfLines={1}>{clubName}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 6 }} />

            {/* Right: meta */}
            <View style={{ width: '28%', justifyContent: 'center', gap: 3 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6 }}>
                <MaterialIcons name="groups" size={9} color="#94A3B8" />
                <Text style={{ fontSize: 8, fontWeight: '600', color: '#CBD5E1CC' }}>{tournament.format}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6 }}>
                <MaterialIcons name="category" size={9} color="#94A3B8" />
                <Text style={{ fontSize: 8, fontWeight: '600', color: '#CBD5E1CC' }}>{tournament.type}</Text>
              </View>
              {tournament.participants > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6 }}>
                  <MaterialIcons name="people" size={9} color="#94A3B8" />
                  <Text style={{ fontSize: 8, fontWeight: '600', color: '#CBD5E1CC' }}>{tournament.participants}/{tournament.maxParticipants}</Text>
                </View>
              ) : null}
              {tournament.location?.city ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 5, paddingVertical: 3, borderRadius: 6 }}>
                  <MaterialIcons name="place" size={9} color="#94A3B8" />
                  <Text style={{ fontSize: 8, fontWeight: '600', color: '#CBD5E1CC' }} numberOfLines={1}>{tournament.location.city}</Text>
                </View>
              ) : null}
              {tournament.tournamentLevel ? (
                <View style={{ backgroundColor: '#8B5CF615', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                  <Text style={{ fontSize: 7, fontWeight: '700', color: '#8B5CF6' }}>{tournament.tournamentLevel}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {/* Gold Sponsor */}
          {goldSponsor ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B12', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 3, marginBottom: 2 }}>
              <MaterialIcons name="star" size={7} color="#F59E0B" />
              <Text style={{ fontSize: 6, fontWeight: '700', color: '#F59E0B' }}>{fr ? 'Partenaire' : 'Partner'}: {goldSponsor.displayName}</Text>
            </View>
          ) : null}
          <ShareCardWatermark variant="light" size="sm" />
        </LinearGradient>
      </View>
    );
  }

  // === STORY / SQUARE ===
  const pad = isStory ? 24 : 14;
  const nameSize = isStory ? 22 : 18;

  return (
    <View style={s.card}>
      <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: isStory ? 18 : pad, paddingBottom: isStory ? 52 : 48, justifyContent: isStory ? 'center' : 'flex-start', position: 'relative' }}>
        <View style={{ position: 'absolute', top: -30, right: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(245,158,11,0.04)' }} />

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: isStory ? 8 : 8 }}>
          <View style={{ backgroundColor: '#F59E0B20', width: isStory ? 30 : 34, height: isStory ? 30 : 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name="emoji-events" size={isStory ? 17 : 17} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 8, fontWeight: '800', letterSpacing: 1.5, color: ct.accent }}>{fr ? 'TOURNOI' : 'TOURNAMENT'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 }}>
              <MaterialIcons name={status.icon as any} size={9} color={status.color} />
              <Text style={{ fontSize: 9, fontWeight: '700', color: status.color }}>{tournament.status}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 9, fontWeight: '500', color: '#64748B' }}>{dateStr}</Text>
            {endDateStr ? <Text style={{ fontSize: 9, fontWeight: '500', color: '#64748B' }}>{fr ? 'au' : 'to'} {endDateStr}</Text> : null}
          </View>
        </View>

        {/* Tournament Name */}
        <Text style={{ fontSize: isStory ? 18 : nameSize, fontWeight: '900', color: ct.textPrimary, marginBottom: isStory ? 8 : 10, letterSpacing: -0.3, lineHeight: (isStory ? 18 : nameSize) * 1.25, flexShrink: 1 }} numberOfLines={2}>{tournament.name}</Text>

        {/* Result Badge */}
        {resultCfg ? (
          <LinearGradient
            colors={[resultCfg.color + '18', resultCfg.color + '08']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderColor: resultCfg.color + '30', borderRadius: 11, paddingVertical: isStory ? 7 : 8, paddingHorizontal: 10, marginBottom: isStory ? 8 : 10 }}
          >
            <MaterialIcons name={resultCfg.icon as any} size={isStory ? 20 : 22} color={resultCfg.color} />
            <View>
              <Text style={{ fontSize: isStory ? 14 : 14, fontWeight: '800', color: resultCfg.color }}>{resultCfg.label}</Text>
              {tournament.prizeWon ? <Text style={{ fontSize: 10, fontWeight: '600', color: '#94A3B8' }}>{tournament.prizeWon > 0 ? `+${tournament.prizeWon} \u20AC` : ''}</Text> : null}
            </View>
          </LinearGradient>
        ) : null}

        {/* Meta Grid */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: isStory ? 6 : 6 }}>
          <View style={s.metaItem}><MaterialIcons name="groups" size={10} color="#94A3B8" /><Text style={s.metaValue}>{tournament.format}</Text></View>
          <View style={s.metaItem}><MaterialIcons name="category" size={10} color="#94A3B8" /><Text style={s.metaValue}>{tournament.type}</Text></View>
          {tournament.participants > 0 ? <View style={s.metaItem}><MaterialIcons name="people" size={10} color="#94A3B8" /><Text style={s.metaValue}>{tournament.participants}/{tournament.maxParticipants}</Text></View> : null}
          {tournament.location?.city ? <View style={s.metaItem}><MaterialIcons name="place" size={10} color="#94A3B8" /><Text style={s.metaValue} numberOfLines={1}>{tournament.location.city}</Text></View> : null}
        </View>

        {/* Tags */}
        {(tournament.tournamentLevel || tournament.tournamentScope || tournament.prize) ? (
          <View style={{ flexDirection: 'row', gap: 4, marginBottom: isStory ? 6 : 8, flexWrap: 'wrap' }}>
            {tournament.tournamentLevel ? <View style={{ backgroundColor: '#8B5CF615', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}><Text style={{ fontSize: 9, fontWeight: '700', color: '#8B5CF6' }}>{tournament.tournamentLevel}</Text></View> : null}
            {tournament.tournamentScope ? <View style={{ backgroundColor: '#3B82F615', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}><Text style={{ fontSize: 9, fontWeight: '700', color: '#3B82F6' }}>{tournament.tournamentScope}</Text></View> : null}
            {tournament.prize ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F59E0B15', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}><MaterialIcons name="card-giftcard" size={9} color="#F59E0B" /><Text style={{ fontSize: 9, fontWeight: '700', color: '#F59E0B' }}>{tournament.prize}</Text></View> : null}
          </View>
        ) : null}

        {/* Footer */}
        {/* Match List */}
        {tournamentMatches && tournamentMatches.length > 0 ? (
          <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 8, marginBottom: isStory ? 10 : 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
              <MaterialIcons name="format-list-numbered" size={10} color={ct.accent} />
              <Text style={{ fontSize: 8, fontWeight: '700', letterSpacing: 0.8, color: ct.accent }}>{fr ? 'MATCHS' : 'MATCHES'}</Text>
              <Text style={{ fontSize: 8, fontWeight: '600', color: '#64748B' }}>({tournamentMatches.length})</Text>
            </View>
            {tournamentMatches.slice(0, isStory ? 8 : 5).map((tm, idx) => {
              const won = tm.winner === 'A';
              return (
                <View key={tm.id || idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, borderBottomWidth: idx < (isStory ? 7 : 4) ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                  <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: won ? '#22C55E' : '#EF4444' }} />
                  {tm.tournamentPhase ? (
                    <Text style={{ fontSize: 7, fontWeight: '700', color: '#F59E0B', width: isStory ? 50 : 40 }} numberOfLines={1}>{tm.tournamentPhase}</Text>
                  ) : null}
                  <Text style={{ fontSize: 8, fontWeight: '600', color: ct.textPrimary, flex: 1, flexShrink: 1 }} numberOfLines={1}>{tm.teamANames.join(', ')}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 }}>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: won ? '#22C55E' : ct.textPrimary }}>{tm.scoreA}</Text>
                    <Text style={{ fontSize: 7, color: '#64748B' }}>-</Text>
                    <Text style={{ fontSize: 9, fontWeight: '800', color: !won ? '#EF4444' : ct.textPrimary }}>{tm.scoreB}</Text>
                  </View>
                  <Text style={{ fontSize: 8, fontWeight: '500', color: '#64748B', flex: 1, textAlign: 'right', flexShrink: 1 }} numberOfLines={1}>{tm.teamBNames.join(', ')}</Text>
                </View>
              );
            })}
            {tournamentMatches.length > (isStory ? 8 : 5) ? (
              <Text style={{ fontSize: 7, color: '#64748B', textAlign: 'center', marginTop: 3 }}>+{tournamentMatches.length - (isStory ? 8 : 5)} {fr ? 'matchs' : 'matches'}</Text>
            ) : null}
          </View>
        ) : null}

        {/* Gold Sponsor Banner */}
        {goldSponsor ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F59E0B12', borderRadius: 10, paddingVertical: isStory ? 8 : 6, paddingHorizontal: 10, marginBottom: isStory ? 10 : 6, borderWidth: 1, borderColor: '#F59E0B25' }}>
            <View style={{ width: isStory ? 28 : 22, height: isStory ? 28 : 22, borderRadius: isStory ? 8 : 6, backgroundColor: '#F59E0B20', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="workspace-premium" size={isStory ? 16 : 12} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 7, fontWeight: '700', color: '#F59E0B', letterSpacing: 0.5 }}>{fr ? 'PARTENAIRE OR' : 'GOLD PARTNER'}</Text>
              <Text style={{ fontSize: isStory ? 11 : 9, fontWeight: '700', color: ct.textPrimary }} numberOfLines={1}>{goldSponsor.displayName}</Text>
            </View>
            <MaterialIcons name="star" size={isStory ? 14 : 10} color="#F59E0B" />
          </View>
        ) : null}

        {/* Footer */}
        <View style={{ borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 8, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {playerName ? <Text style={{ fontSize: 11, fontWeight: '700', color: ct.textPrimary }} numberOfLines={1}>{playerName}</Text> : null}
            {eloRating ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: (eloColor || '#94A3B8') + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                <MaterialIcons name="diamond" size={9} color={eloColor || '#94A3B8'} />
                <Text style={{ fontSize: 9, fontWeight: '700', color: eloColor || '#94A3B8' }}>ELO {eloRating}{eloRankLabel ? ` ${eloRankLabel}` : ''}</Text>
              </View>
            ) : null}
          </View>
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
        <ShareCardWatermark variant="light" size="sm" />
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  metaValue: { fontSize: 10, fontWeight: '600', color: '#CBD5E1CC', maxWidth: 80, flexShrink: 1 },
});
