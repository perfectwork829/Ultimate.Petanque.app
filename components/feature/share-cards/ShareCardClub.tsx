/**
 * ShareCardClub — Club card for social sharing.
 * Shows club name, city, members, facilities, geographic ranking, top players.
 * Adapts layout to square / story / landscape formats.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';

interface GeoRankInfo {
  city?: { name?: string; rank?: number; total?: number };
  country?: { name?: string; rank?: number; total?: number };
  continent?: { name?: string; rank?: number; total?: number };
}

interface TopPlayerInfo {
  name: string;
  winRate: number;
  eloRating?: number;
  role?: string;
}

interface TournamentInfo {
  name: string;
  date: string;
  status: string;
  format?: string;
}

interface MemberRoleInfo {
  name: string;
  role: string;
  roleLabel: string;
  color: string;
  icon: string;
}

interface Props {
  clubName: string;
  city?: string;
  country?: string;
  logo?: string | null;
  membersCount?: number;
  foundedYear?: number | null;
  membershipCost?: number | null;
  facilities?: string[];
  description?: string;
  geoRank?: GeoRankInfo | null;
  topPlayers?: TopPlayerInfo[];
  memberRoles?: MemberRoleInfo[];
  upcomingTournaments?: TournamentInfo[];
  totalMatches?: number;
  avgWinRate?: number;
  avgTirRate?: number;
  avgCarreauRate?: number;
  isVerified?: boolean;
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

function GeoRankBadges({ geoRank, compact }: { geoRank?: GeoRankInfo | null; compact?: boolean }) {
  if (!geoRank) return null;
  const fs = compact ? 7 : 9;
  return (
    <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
      {geoRank.city?.rank ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 }}>
          <MaterialIcons name="location-city" size={compact ? 8 : 10} color="#3B82F6" />
          <Text style={{ fontSize: fs, fontWeight: '700', color: geoRank.city.rank <= 3 ? '#F59E0B' : '#3B82F6' }}>#{geoRank.city.rank}</Text>
          <Text style={{ fontSize: fs, fontWeight: '500', color: '#94A3B8' }}>{geoRank.city.name}</Text>
        </View>
      ) : null}
      {geoRank.country?.rank ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 }}>
          <MaterialIcons name="flag" size={compact ? 8 : 10} color="#10B981" />
          <Text style={{ fontSize: fs, fontWeight: '700', color: geoRank.country.rank <= 3 ? '#F59E0B' : '#10B981' }}>#{geoRank.country.rank}</Text>
          <Text style={{ fontSize: fs, fontWeight: '500', color: '#94A3B8' }}>{geoRank.country.name}</Text>
        </View>
      ) : null}
      {geoRank.continent?.rank ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.06)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 }}>
          <MaterialIcons name="public" size={compact ? 8 : 10} color="#F59E0B" />
          <Text style={{ fontSize: fs, fontWeight: '700', color: '#F59E0B' }}>#{geoRank.continent.rank}</Text>
          <Text style={{ fontSize: fs, fontWeight: '500', color: '#94A3B8' }}>{geoRank.continent.name}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function ShareCardClub({
  clubName, city, country, logo, membersCount, foundedYear, membershipCost,
  facilities, description, geoRank, topPlayers, memberRoles, upcomingTournaments,
  totalMatches, avgWinRate, avgTirRate, avgCarreauRate, isVerified,
  language = 'fr', colorTheme = 'dark', format = 'square',
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 }}>
            <MaterialIcons name="home" size={9} color={ct.accent} />
            <Text style={{ fontSize: 7, fontWeight: '800', letterSpacing: 1, color: ct.accent }}>CLUB</Text>
          </View>
          <View style={{ flexDirection: 'row', flex: 1 }}>
            <View style={{ flex: 1, justifyContent: 'center', paddingRight: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: ct.textPrimary }} numberOfLines={1}>{clubName}</Text>
                {isVerified ? <MaterialIcons name="verified" size={12} color="#2563EB" /> : null}
              </View>
              {city ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 3 }}>
                  <MaterialIcons name="place" size={8} color={ct.textSecondary} />
                  <Text style={{ fontSize: 8, color: ct.textSecondary }}>{[city, country].filter(Boolean).join(', ')}</Text>
                </View>
              ) : null}
              <GeoRankBadges geoRank={geoRank} compact />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 3 }}>
                {(facilities || []).slice(0, 3).map((f, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 1.5, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 3, paddingVertical: 1, borderRadius: 3 }}>
                    <MaterialIcons name="check-circle" size={6} color="#10B981" />
                    <Text style={{ fontSize: 6, fontWeight: '600', color: '#10B981' }}>{f}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 6 }} />
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
                <View style={s.statBoxSm}><Text style={{ fontSize: 14, fontWeight: '900', color: '#F8FAFC' }}>{membersCount || 0}</Text><Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B' }}>{fr ? 'Membres' : 'Members'}</Text></View>
                <View style={[s.statBoxSm, { borderColor: '#22C55E20' }]}><Text style={{ fontSize: 14, fontWeight: '900', color: '#22C55E' }}>{avgWinRate || 0}%</Text><Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B' }}>{fr ? 'Victoires' : 'Win'}</Text></View>
              </View>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <View style={[s.statBoxSm, { borderColor: '#3B82F620' }]}><Text style={{ fontSize: 14, fontWeight: '900', color: '#3B82F6' }}>{avgTirRate || 0}%</Text><Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B' }}>{fr ? 'Tir' : 'Shot'}</Text></View>
                <View style={[s.statBoxSm, { borderColor: '#F59E0B20' }]}><Text style={{ fontSize: 14, fontWeight: '900', color: '#F59E0B' }}>{avgCarreauRate || 0}%</Text><Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B' }}>Carreau</Text></View>
              </View>
            </View>
          </View>
          <ShareCardWatermark variant="light" size="sm" />
        </LinearGradient>
      </View>
    );
  }

  // === STORY / SQUARE ===
  const pad = isStory ? 24 : 14;
  const titleSize = isStory ? 22 : 17;
  const statFontSize = isStory ? 22 : 16;

  return (
    <View style={s.card}>
      <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: pad, paddingBottom: isStory ? 56 : 48, justifyContent: isStory ? 'center' : 'flex-start' }}>
        {/* Header badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: isStory ? 12 : 6 }}>
          <MaterialIcons name="home" size={isStory ? 16 : 13} color={ct.accent} />
          <Text style={{ fontSize: isStory ? 11 : 9, fontWeight: '800', letterSpacing: 1.5, color: ct.accent }}>CLUB</Text>
        </View>

        {/* Club identity */}
        <View style={{ marginBottom: isStory ? 16 : 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <View style={{ width: isStory ? 44 : 34, height: isStory ? 44 : 34, borderRadius: isStory ? 14 : 10, backgroundColor: ct.accent + '20', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name="home" size={isStory ? 22 : 16} color={ct.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: titleSize, fontWeight: '800', color: ct.textPrimary }} numberOfLines={1}>{clubName}</Text>
                {isVerified ? <MaterialIcons name="verified" size={14} color="#2563EB" /> : null}
              </View>
              {city ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                  <MaterialIcons name="place" size={10} color={ct.textSecondary} />
                  <Text style={{ fontSize: 11, color: ct.textSecondary }}>{[city, country].filter(Boolean).join(', ')}</Text>
                </View>
              ) : null}
            </View>
          </View>
          {description ? (
            <Text style={{ fontSize: 10, color: ct.textSecondary, lineHeight: 14, marginTop: 6 }} numberOfLines={2}>{description}</Text>
          ) : null}
        </View>

        {/* Stats grid */}
        <View style={{ flexDirection: 'row', gap: 5, marginBottom: isStory ? 12 : 8 }}>
          <View style={s.statBox}><Text style={{ fontSize: statFontSize, fontWeight: '900', color: '#F8FAFC' }}>{membersCount || 0}</Text><Text style={s.statLabel}>{fr ? 'Membres' : 'Members'}</Text></View>
          <View style={[s.statBox, { borderColor: '#22C55E20' }]}><Text style={{ fontSize: statFontSize, fontWeight: '900', color: '#22C55E' }}>{avgWinRate || 0}%</Text><Text style={s.statLabel}>{fr ? 'Victoires' : 'Win'}</Text></View>
          <View style={[s.statBox, { borderColor: '#3B82F620' }]}><Text style={{ fontSize: statFontSize, fontWeight: '900', color: '#3B82F6' }}>{totalMatches || 0}</Text><Text style={s.statLabel}>{fr ? 'Matchs' : 'Matches'}</Text></View>
        </View>

        {/* Shot stats row */}
        <View style={{ flexDirection: 'row', gap: 5, marginBottom: isStory ? 12 : 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }}>
            <MaterialIcons name="gps-fixed" size={10} color="#3B82F6" />
            <Text style={{ fontSize: 8, color: '#94A3B8' }}>{fr ? 'Tir' : 'Shot'}</Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#3B82F6', marginLeft: 'auto' }}>{avgTirRate || 0}%</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 }}>
            <MaterialIcons name="stars" size={10} color="#F59E0B" />
            <Text style={{ fontSize: 8, color: '#94A3B8' }}>Carreau</Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#F59E0B', marginLeft: 'auto' }}>{avgCarreauRate || 0}%</Text>
          </View>
        </View>

        {/* Facilities */}
        {facilities && facilities.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: isStory ? 10 : 6 }}>
            {facilities.slice(0, 5).map((f, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 6, paddingVertical: 2.5, borderRadius: 5 }}>
                <MaterialIcons name="check-circle" size={8} color="#10B981" />
                <Text style={{ fontSize: 8, fontWeight: '600', color: '#10B981' }}>{f}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {/* Top players */}
        {topPlayers && topPlayers.length > 0 ? (
          <View style={{ marginBottom: isStory ? 10 : 6 }}>
            <Text style={{ fontSize: 8, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' }}>{fr ? 'Top joueurs' : 'Top players'}</Text>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {topPlayers.slice(0, 3).map((p, i) => {
                const medals = ['🥇', '🥈', '🥉'];
                return (
                  <View key={i} style={{ flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 4 }}>
                    <Text style={{ fontSize: 12 }}>{medals[i]}</Text>
                    <Text style={{ fontSize: 9, fontWeight: '700', color: ct.textPrimary, marginTop: 2 }} numberOfLines={1}>{p.name.split(' ')[0]}</Text>
                    <Text style={{ fontSize: 8, fontWeight: '600', color: '#22C55E' }}>{p.winRate}%</Text>
                    {p.eloRating ? <Text style={{ fontSize: 7, fontWeight: '600', color: '#94A3B8' }}>{p.eloRating}</Text> : null}
                    {p.role ? <Text style={{ fontSize: 6, fontWeight: '600', color: '#64748B' }}>{p.role}</Text> : null}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Member Roles */}
        {memberRoles && memberRoles.length > 0 ? (
          <View style={{ marginBottom: isStory ? 10 : 6 }}>
            <Text style={{ fontSize: 8, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' }}>{fr ? 'Bureau du club' : 'Club Board'}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {memberRoles.slice(0, 4).map((m, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: m.color + '12', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7 }}>
                  <MaterialIcons name={m.icon as any} size={9} color={m.color} />
                  <Text style={{ fontSize: 8, fontWeight: '700', color: m.color }}>{m.roleLabel}</Text>
                  <Text style={{ fontSize: 7, fontWeight: '600', color: ct.textSecondary }}>{m.name.split(' ')[0]}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Upcoming Tournaments */}
        {upcomingTournaments && upcomingTournaments.length > 0 ? (
          <View style={{ marginBottom: isStory ? 10 : 6 }}>
            <Text style={{ fontSize: 8, fontWeight: '700', color: ct.textSecondary, letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase' }}>{fr ? 'Tournois' : 'Tournaments'}</Text>
            <View style={{ gap: 3 }}>
              {upcomingTournaments.slice(0, 3).map((t, i) => {
                const tDate = new Date(t.date);
                const statusColor = t.status === 'En cours' ? '#22C55E' : '#3B82F6';
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 }}>
                    <View style={{ width: 18, height: 18, borderRadius: 5, backgroundColor: statusColor + '15', alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialIcons name="emoji-events" size={9} color={statusColor} />
                    </View>
                    <Text style={{ fontSize: 8, fontWeight: '700', color: ct.textPrimary, flex: 1 }} numberOfLines={1}>{t.name}</Text>
                    <Text style={{ fontSize: 7, fontWeight: '600', color: statusColor }}>{tDate.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Geo + Founded */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 8, alignItems: 'center', marginBottom: isStory ? 0 : 4 }}>
          {foundedYear ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 6, paddingVertical: 2.5, borderRadius: 5 }}>
              <MaterialIcons name="calendar-today" size={8} color={ct.textSecondary} />
              <Text style={{ fontSize: 8, fontWeight: '600', color: ct.textSecondary }}>{fr ? 'Depuis' : 'Since'} {foundedYear}</Text>
            </View>
          ) : null}
          {membershipCost ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 6, paddingVertical: 2.5, borderRadius: 5 }}>
              <MaterialIcons name="euro" size={8} color={ct.textSecondary} />
              <Text style={{ fontSize: 8, fontWeight: '600', color: ct.textSecondary }}>{membershipCost}\u20AC/{fr ? 'an' : 'yr'}</Text>
            </View>
          ) : null}
          <GeoRankBadges geoRank={geoRank} compact={!isStory} />
        </View>

        <ShareCardWatermark variant="light" size={isStory ? 'sm' : 'xs'} />
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
  statBox: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statBoxSm: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, paddingVertical: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  statLabel: { fontSize: 8, fontWeight: '600', color: '#64748B', letterSpacing: 0.3 },
});
