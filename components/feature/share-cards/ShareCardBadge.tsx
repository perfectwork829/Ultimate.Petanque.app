/**
 * ShareCardBadge — Visual badge unlock card for social sharing.
 * Shows badge icon, name, description, XP, ELO, geo ranks, club.
 * Adapts layout to square / story / landscape formats without truncation.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';
import { BADGES, getBadgeName, getBadgeDescription } from '@/services/badgeService';

interface GeoRankInfo {
  city?: { name?: string; rank?: number };
  country?: { name?: string; rank?: number };
}

interface Props {
  badgeId: string;
  playerName?: string;
  unlockedAt?: string;
  xpReward?: number;
  eloRating?: number;
  eloColor?: string;
  eloRankLabel?: string;
  clubName?: string;
  geoRank?: GeoRankInfo | null;
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

function GeoRankBadges({ geoRank, compact }: { geoRank?: GeoRankInfo | null; compact?: boolean }) {
  if (!geoRank) return null;
  const fs = compact ? 7 : 9;
  return (
    <View style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap', justifyContent: 'center' }}>
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

export default function ShareCardBadge({ badgeId, playerName, unlockedAt, xpReward, eloRating, eloColor, eloRankLabel, clubName, geoRank, language = 'fr', colorTheme = 'dark', format = 'square' }: Props) {
  const fr = language === 'fr';
  const ct = CARD_COLOR_THEMES[colorTheme];
  const badge = BADGES.find(b => b.id === badgeId);
  if (!badge) return null;

  const dateStr = unlockedAt
    ? new Date(unlockedAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  const isStory = format === 'story';
  const isLandscape = format === 'landscape';

  // === LANDSCAPE ===
  if (isLandscape) {
    return (
      <View style={s.card}>
        <LinearGradient colors={[badge.color + '25', ct.gradients[0], ct.gradients[1]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1, padding: 10, paddingBottom: 44, flexDirection: 'row', alignItems: 'center' }}>
          {/* Left: icon */}
          <View style={{ alignItems: 'center', marginRight: 10 }}>
            <View style={{ backgroundColor: badge.color + '20', width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ backgroundColor: badge.color, width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 }}>
                <MaterialIcons name={badge.icon as any} size={22} color="#FFF" />
              </View>
            </View>
          </View>
          {/* Right: info */}
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 1 }}>
              <MaterialIcons name="celebration" size={8} color={ct.accent} />
              <Text style={{ fontSize: 7, fontWeight: '800', letterSpacing: 1, color: ct.accent }}>{fr ? 'BADGE DEBLOQUE' : 'BADGE UNLOCKED'}</Text>
            </View>
            <Text style={{ fontSize: 13, fontWeight: '900', color: badge.color, marginBottom: 1 }} numberOfLines={1}>{getBadgeName(badgeId, language)}</Text>
            <Text style={{ fontSize: 8, fontWeight: '500', color: ct.textSecondary, marginBottom: 3, lineHeight: 11 }} numberOfLines={2}>{getBadgeDescription(badgeId, language)}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
              {(xpReward || badge.xpReward) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(252,211,77,0.1)', paddingHorizontal: 5, paddingVertical: 1.5, borderRadius: 5 }}>
                  <MaterialIcons name="bolt" size={9} color={ct.accent} />
                  <Text style={{ fontSize: 9, fontWeight: '800', color: ct.accent }}>+{xpReward || badge.xpReward} XP</Text>
                </View>
              ) : null}
              {playerName ? <Text style={{ fontSize: 8, fontWeight: '700', color: ct.textPrimary }}>{playerName}</Text> : null}
              {eloRating ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: (eloColor || '#94A3B8') + '20', paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 4 }}>
                  <Text style={{ fontSize: 7, fontWeight: '700', color: eloColor || '#94A3B8' }}>ELO {eloRating}</Text>
                </View>
              ) : null}
              {dateStr ? <Text style={{ fontSize: 7, color: ct.textSecondary }}>{dateStr}</Text> : null}
            </View>
            <View style={{ marginTop: 2, flexDirection: 'row', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
              <GeoRankBadges geoRank={geoRank} compact />
              {clubName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <MaterialIcons name="home" size={7} color={ct.textSecondary} />
                  <Text style={{ fontSize: 7, color: ct.textSecondary }} numberOfLines={1}>{clubName}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <ShareCardWatermark variant="light" size="sm" absolute />
        </LinearGradient>
      </View>
    );
  }

  // === STORY / SQUARE ===
  const iconOuterSize = isStory ? 100 : 80;
  const iconInnerSize = isStory ? 72 : 58;
  const nameSize = isStory ? 20 : 18;
  const descSize = isStory ? 11 : 10;
  const pad = isStory ? 20 : 14;

  return (
    <View style={s.card}>
      <LinearGradient colors={[badge.color + '25', ct.gradients[0], ct.gradients[1]]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={{ flex: 1, padding: pad, paddingBottom: isStory ? 52 : 48, alignItems: 'center', justifyContent: 'center' }}>
        {/* Celebration label */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: isStory ? 12 : 12, justifyContent: 'center' }}>
          <MaterialIcons name="celebration" size={isStory ? 12 : 11} color={ct.accent} />
          <Text style={{ fontSize: isStory ? 9 : 9, fontWeight: '800', letterSpacing: 1.5, color: ct.accent }}>{fr ? 'BADGE DEBLOQUE' : 'BADGE UNLOCKED'}</Text>
          <MaterialIcons name="celebration" size={isStory ? 12 : 11} color={ct.accent} />
        </View>

        {/* Badge Icon */}
        <View style={{ backgroundColor: badge.color + '20', width: iconOuterSize, height: iconOuterSize, borderRadius: iconOuterSize * 0.3, alignItems: 'center', justifyContent: 'center', marginBottom: isStory ? 10 : 10 }}>
          <View style={{ backgroundColor: badge.color, width: iconInnerSize, height: iconInnerSize, borderRadius: iconInnerSize * 0.32, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 12 }}>
            <MaterialIcons name={badge.icon as any} size={isStory ? 52 : 40} color="#FFF" />
          </View>
        </View>

        {/* Badge Name */}
        <Text style={{ fontSize: nameSize, fontWeight: '900', color: badge.color, textAlign: 'center', marginBottom: isStory ? 6 : 4 }}>{getBadgeName(badgeId, language)}</Text>

        {/* Description */}
        <Text style={{ fontSize: descSize, fontWeight: '500', color: ct.textSecondary, textAlign: 'center', lineHeight: descSize * 1.4, paddingHorizontal: 6, marginBottom: isStory ? 8 : 10 }} numberOfLines={3}>{getBadgeDescription(badgeId, language)}</Text>

        {/* XP */}
        {(xpReward || badge.xpReward) ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(252,211,77,0.1)', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, marginBottom: isStory ? 16 : 10 }}>
            <MaterialIcons name="bolt" size={isStory ? 18 : 14} color={ct.accent} />
            <Text style={{ fontSize: isStory ? 14 : 14, fontWeight: '800', color: ct.accent }}>+{xpReward || badge.xpReward} XP</Text>
          </View>
        ) : null}

        {/* ELO + Geo + Club */}
        <View style={{ alignItems: 'center', gap: 3, marginBottom: isStory ? 8 : 6 }}>
          {eloRating ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: (eloColor || '#94A3B8') + '20', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 7 }}>
              <MaterialIcons name="diamond" size={10} color={eloColor || '#94A3B8'} />
              <Text style={{ fontSize: 10, fontWeight: '700', color: eloColor || '#94A3B8' }}>ELO {eloRating}{eloRankLabel ? ` ${eloRankLabel}` : ''}</Text>
            </View>
          ) : null}
          <GeoRankBadges geoRank={geoRank} compact={!isStory} />
          {clubName ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MaterialIcons name="home" size={9} color={ct.textSecondary} />
              <Text style={{ fontSize: 9, color: ct.textSecondary }}>{clubName}</Text>
            </View>
          ) : null}
        </View>

        {/* Player + Date */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)', paddingTop: 8 }}>
          {playerName ? <Text style={{ fontSize: 11, fontWeight: '700', color: ct.textPrimary }}>{playerName}</Text> : null}
          {dateStr ? <Text style={{ fontSize: 10, fontWeight: '500', color: ct.textSecondary }}>{dateStr}</Text> : null}
        </View>
        <ShareCardWatermark variant="light" size={isStory ? 'sm' : 'xs'} />
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
});
