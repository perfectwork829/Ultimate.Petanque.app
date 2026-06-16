/**
 * ShareCardMilestone — Auto-generated card when a player reaches a new ELO milestone
 * (league promotion, first 1200, peak ELO, etc.) with league emblem, date, and delta ELO.
 * Adapts layout to square / story / landscape formats.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';
import { LeagueTier } from '@/services/globalRankingService';

interface Props {
  playerName: string;
  milestoneLabel: string; // e.g. "Gold League Reached!" or "Peak ELO: 1350"
  milestoneIcon: string; // MaterialIcons name
  milestoneColor: string;
  elo: number;
  eloDelta?: number; // e.g. +25
  date: string; // ISO date string
  leagueTier: LeagueTier;
  previousTier?: LeagueTier | null;
  matchContext?: string; // e.g. "13-4 vs Alpha Team"
  clubName?: string;
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

export default function ShareCardMilestone({
  playerName, milestoneLabel, milestoneIcon, milestoneColor,
  elo, eloDelta, date, leagueTier, previousTier,
  matchContext, clubName,
  language = 'fr', colorTheme = 'dark', format = 'square',
}: Props) {
  const fr = language === 'fr';
  const ct = CARD_COLOR_THEMES[colorTheme];
  const isStory = format === 'story';
  const isLandscape = format === 'landscape';
  const tierGrad = leagueTier.gradient;

  const dateStr = new Date(date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  // === LANDSCAPE ===
  if (isLandscape) {
    return (
      <View style={s.card}>
        <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: 10, paddingBottom: 44, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 }}>
            <MaterialIcons name="emoji-events" size={9} color={milestoneColor} />
            <Text style={{ fontSize: 7, fontWeight: '800', letterSpacing: 1, color: milestoneColor }}>
              {fr ? 'JALON ELO' : 'ELO MILESTONE'}
            </Text>
            <Text style={{ fontSize: 6, fontWeight: '600', color: ct.textSecondary, marginLeft: 'auto' }}>{dateStr}</Text>
          </View>
          <View style={{ flexDirection: 'row', flex: 1 }}>
            {/* Left: milestone info */}
            <View style={{ flex: 1, justifyContent: 'center', paddingRight: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <LinearGradient colors={tierGrad} style={{ width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 15 }}>{leagueTier.emblem}</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontWeight: '800', color: ct.textPrimary }} numberOfLines={1}>{playerName}</Text>
                  <Text style={{ fontSize: 8, fontWeight: '600', color: ct.textSecondary }}>{clubName || ''}</Text>
                </View>
              </View>
              <Text style={{ fontSize: 10, fontWeight: '800', color: milestoneColor }} numberOfLines={1}>{milestoneLabel}</Text>
              {matchContext ? (
                <Text style={{ fontSize: 8, fontWeight: '600', color: ct.textSecondary, marginTop: 2 }} numberOfLines={1}>{matchContext}</Text>
              ) : null}
            </View>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginHorizontal: 6 }} />
            {/* Right: ELO + tier transition */}
            <View style={{ flex: 0.7, justifyContent: 'center', alignItems: 'center' }}>
              <LinearGradient colors={tierGrad} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, alignItems: 'center', marginBottom: 4 }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFF' }}>{elo}</Text>
                <Text style={{ fontSize: 7, fontWeight: '600', color: 'rgba(255,255,255,0.6)' }}>ELO</Text>
              </LinearGradient>
              {eloDelta ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <MaterialIcons name={eloDelta > 0 ? 'arrow-upward' : 'arrow-downward'} size={10} color={eloDelta > 0 ? '#22C55E' : '#EF4444'} />
                  <Text style={{ fontSize: 11, fontWeight: '800', color: eloDelta > 0 ? '#22C55E' : '#EF4444' }}>{eloDelta > 0 ? '+' : ''}{eloDelta}</Text>
                </View>
              ) : null}
              {previousTier ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Text style={{ fontSize: 10 }}>{previousTier.emblem}</Text>
                  <MaterialIcons name="arrow-forward" size={10} color={ct.textSecondary} />
                  <Text style={{ fontSize: 10 }}>{leagueTier.emblem}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <ShareCardWatermark variant="light" size="sm" />
        </LinearGradient>
      </View>
    );
  }

  // === STORY / SQUARE ===
  const pad = isStory ? 28 : 18;
  const emblemSize = isStory ? 72 : 56;

  return (
    <View style={s.card}>
      <LinearGradient colors={ct.gradients} style={{ flex: 1, padding: pad, paddingBottom: isStory ? 56 : 48, justifyContent: isStory ? 'center' : 'flex-start' }}>
        {/* Header badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: isStory ? 12 : 8 }}>
          <MaterialIcons name="emoji-events" size={isStory ? 14 : 12} color={milestoneColor} />
          <Text style={{ fontSize: isStory ? 10 : 8, fontWeight: '800', letterSpacing: 1.5, color: milestoneColor }}>
            {fr ? 'JALON ELO' : 'ELO MILESTONE'}
          </Text>
        </View>

        {/* Date */}
        <Text style={{ fontSize: isStory ? 11 : 9, fontWeight: '600', color: ct.textSecondary, marginBottom: isStory ? 16 : 10 }}>{dateStr}</Text>

        {/* Central emblem */}
        <View style={{ alignItems: 'center', marginBottom: isStory ? 20 : 14 }}>
          <LinearGradient
            colors={tierGrad}
            style={{
              width: emblemSize, height: emblemSize, borderRadius: emblemSize / 3,
              alignItems: 'center', justifyContent: 'center',
              borderWidth: 3, borderColor: 'rgba(255,255,255,0.25)',
            }}
          >
            <Text style={{ fontSize: emblemSize * 0.5 }}>{leagueTier.emblem}</Text>
          </LinearGradient>

          {/* Tier transition */}
          {previousTier ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: isStory ? 12 : 8 }}>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: isStory ? 20 : 16 }}>{previousTier.emblem}</Text>
                <Text style={{ fontSize: isStory ? 9 : 7, fontWeight: '600', color: previousTier.color }}>
                  {fr ? previousTier.name.fr : previousTier.name.en}
                </Text>
              </View>
              <MaterialIcons name="arrow-forward" size={isStory ? 18 : 14} color={ct.textSecondary} />
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: isStory ? 20 : 16 }}>{leagueTier.emblem}</Text>
                <Text style={{ fontSize: isStory ? 9 : 7, fontWeight: '700', color: leagueTier.color }}>
                  {fr ? leagueTier.name.fr : leagueTier.name.en}
                </Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* Milestone label */}
        <View style={{ alignItems: 'center', marginBottom: isStory ? 16 : 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <MaterialIcons name={milestoneIcon as any} size={isStory ? 18 : 14} color={milestoneColor} />
            <Text style={{ fontSize: isStory ? 18 : 14, fontWeight: '900', color: milestoneColor, textAlign: 'center' }}>
              {milestoneLabel}
            </Text>
          </View>
          {matchContext ? (
            <Text style={{ fontSize: isStory ? 11 : 9, fontWeight: '600', color: ct.textSecondary, textAlign: 'center' }}>
              {matchContext}
            </Text>
          ) : null}
        </View>

        {/* Player + ELO */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: isStory ? 12 : 8, marginBottom: isStory ? 14 : 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: isStory ? 16 : 13, fontWeight: '800', color: ct.textPrimary }}>{playerName}</Text>
            {clubName ? <Text style={{ fontSize: isStory ? 10 : 8, fontWeight: '500', color: ct.textSecondary, marginTop: 1 }}>{clubName}</Text> : null}
          </View>
          <LinearGradient colors={tierGrad} style={{ paddingHorizontal: isStory ? 16 : 12, paddingVertical: isStory ? 10 : 7, borderRadius: 14, alignItems: 'center' }}>
            <Text style={{ fontSize: isStory ? 22 : 17, fontWeight: '900', color: '#FFF' }}>{elo}</Text>
            <Text style={{ fontSize: isStory ? 8 : 6, fontWeight: '600', color: 'rgba(255,255,255,0.6)' }}>ELO</Text>
          </LinearGradient>
          {eloDelta ? (
            <View style={{ alignItems: 'center', backgroundColor: eloDelta > 0 ? '#22C55E12' : '#EF444412', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 }}>
              <MaterialIcons name={eloDelta > 0 ? 'arrow-upward' : 'arrow-downward'} size={isStory ? 14 : 11} color={eloDelta > 0 ? '#22C55E' : '#EF4444'} />
              <Text style={{ fontSize: isStory ? 13 : 10, fontWeight: '900', color: eloDelta > 0 ? '#22C55E' : '#EF4444' }}>{eloDelta > 0 ? '+' : ''}{eloDelta}</Text>
            </View>
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
