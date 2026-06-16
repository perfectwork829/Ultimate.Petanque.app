/**
 * ShareCardSponsoredEvent — Sponsored event card for social sharing.
 * Shows event title, ambassador, QR code, date/time, location, challenge type,
 * participant count, and share code for easy participation.
 * Adapts layout to square / story / landscape formats.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import ShareCardWatermark from './ShareCardWatermark';
import { CARD_COLOR_THEMES, type CardColorTheme, type ShareCardFormat } from '@/services/shareCardService';

interface Props {
  title: string;
  challengeType: string;
  challengeMode?: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  city?: string;
  country?: string;
  terrainName?: string;
  scope?: string;
  shareCode: string;
  ambassadorName?: string;
  maxParticipants: number;
  acceptedCount: number;
  minWitnesses: number;
  status?: string;
  description?: string;
  qrUrl: string;
  language?: 'fr' | 'en';
  colorTheme?: CardColorTheme;
  format?: ShareCardFormat;
}

function challengeLabel(type: string): string {
  return type === '10_tirs' ? '10 Tirs' : type === '10_tirs_sautee' ? '10 Tirs Sautee' : 'Precision';
}

function ScopeIcon({ scope, size, color }: { scope?: string; size: number; color: string }) {
  const icon = scope === 'terrain' ? 'place' : scope === 'city' ? 'location-city' : scope === 'country' ? 'flag' : 'public';
  return <MaterialIcons name={icon as any} size={size} color={color} />;
}

export default function ShareCardSponsoredEvent({
  title, challengeType, challengeMode, eventDate, startTime, endTime,
  city, country, terrainName, scope, shareCode, ambassadorName,
  maxParticipants, acceptedCount, minWitnesses, status, description, qrUrl,
  language = 'fr', colorTheme = 'purple', format = 'square',
}: Props) {
  const fr = language === 'fr';
  const ct = CARD_COLOR_THEMES[colorTheme];
  const isStory = format === 'story';
  const isLandscape = format === 'landscape';

  const eventDateObj = new Date(startTime);
  const endDateObj = new Date(endTime);
  const dateStr = eventDateObj.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = `${eventDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  const fillPct = maxParticipants > 0 ? Math.min(100, Math.round((acceptedCount / maxParticipants) * 100)) : 0;
  const locationStr = terrainName || city || country || (fr ? 'Mondial' : 'World');

  // === LANDSCAPE ===
  if (isLandscape) {
    return (
      <View style={s.card}>
        <LinearGradient colors={['#7C3AED', '#9333EA']} style={{ flex: 1, padding: 10, paddingBottom: 44, justifyContent: 'space-between' }}>
          {/* Top: badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 2 }}>
            <MaterialIcons name="campaign" size={9} color="rgba(255,255,255,0.7)" />
            <Text style={{ fontSize: 6, fontWeight: '800', letterSpacing: 1, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase' }}>{fr ? 'DEFI SPONSORISE' : 'SPONSORED EVENT'}</Text>
          </View>

          <View style={{ flexDirection: 'row', flex: 1 }}>
            {/* Left: info */}
            <View style={{ flex: 1, justifyContent: 'center', paddingRight: 8 }}>
              <Text style={{ fontSize: 12, fontWeight: '900', color: '#FFF', marginBottom: 3, flexShrink: 1 }} numberOfLines={2}>{title}</Text>
              {ambassadorName ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 }}>
                  <MaterialIcons name="verified" size={9} color="rgba(255,255,255,0.6)" />
                  <Text style={{ fontSize: 8, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>{fr ? 'Par' : 'By'} {ambassadorName}</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 }}>
                  <MaterialIcons name="track-changes" size={8} color="rgba(255,255,255,0.7)" />
                  <Text style={{ fontSize: 7, fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>{challengeLabel(challengeType)}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 }}>
                  <MaterialIcons name="event" size={8} color="rgba(255,255,255,0.7)" />
                  <Text style={{ fontSize: 7, fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>{dateStr}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 }}>
                  <ScopeIcon scope={scope} size={8} color="rgba(255,255,255,0.7)" />
                  <Text style={{ fontSize: 7, fontWeight: '700', color: 'rgba(255,255,255,0.8)' }} numberOfLines={1}>{locationStr}</Text>
                </View>
              </View>

              {/* Participant bar */}
              <View style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <Text style={{ fontSize: 7, fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>{acceptedCount}/{maxParticipants} {fr ? 'inscrits' : 'registered'}</Text>
                  <Text style={{ fontSize: 7, fontWeight: '800', color: 'rgba(255,255,255,0.7)' }}>{fillPct}%</Text>
                </View>
                <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${fillPct}%`, backgroundColor: '#FDE68A', borderRadius: 2 }} />
                </View>
              </View>
            </View>

            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginHorizontal: 6 }} />

            {/* Right: QR + code */}
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingLeft: 6 }}>
              <View style={{ backgroundColor: '#FFF', borderRadius: 10, padding: 6, marginBottom: 4 }}>
                <QRCode value={qrUrl} size={70} color="#7C3AED" backgroundColor="#FFFFFF" />
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                <Text style={{ fontSize: 10, fontWeight: '900', color: '#FFF', letterSpacing: 1.5 }}>{shareCode}</Text>
              </View>
              <Text style={{ fontSize: 6, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{fr ? 'Scannez pour rejoindre' : 'Scan to join'}</Text>
            </View>
          </View>
          <ShareCardWatermark variant="light" size="sm" />
        </LinearGradient>
      </View>
    );
  }

  // === STORY / SQUARE ===
  const pad = isStory ? 28 : 14;
  const titleSize = isStory ? 22 : 16;
  const qrSize = isStory ? 140 : 90;
  const codeFontSize = isStory ? 22 : 16;

  return (
    <View style={s.card}>
      <LinearGradient colors={['#7C3AED', '#9333EA']} style={{ flex: 1, padding: pad, paddingBottom: isStory ? 56 : 48, justifyContent: isStory ? 'center' : 'flex-start' }}>
        {/* Header badge */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: isStory ? 16 : 10 }}>
          <View style={{ width: isStory ? 32 : 26, height: isStory ? 32 : 26, borderRadius: isStory ? 10 : 8, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialIcons name="campaign" size={isStory ? 16 : 13} color="#FDE68A" />
          </View>
          <Text style={{ fontSize: isStory ? 11 : 9, fontWeight: '800', letterSpacing: 1.5, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', flex: 1 }}>
            {fr ? 'DEFI SPONSORISE' : 'SPONSORED EVENT'}
          </Text>
          {status ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: status === 'active' ? '#22C55E' : status === 'upcoming' ? '#F59E0B' : '#94A3B8' }} />
              <Text style={{ fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.8)' }}>
                {status === 'upcoming' ? (fr ? 'A venir' : 'Upcoming') : status === 'active' ? (fr ? 'En cours' : 'Active') : status === 'completed' ? (fr ? 'Termine' : 'Done') : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Title */}
        <Text style={{ fontSize: titleSize, fontWeight: '900', color: '#FFF', marginBottom: isStory ? 8 : 6, lineHeight: titleSize * 1.2, flexShrink: 1 }} numberOfLines={isStory ? 3 : 2}>{title}</Text>

        {/* Ambassador */}
        {ambassadorName ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: isStory ? 14 : 10 }}>
            <MaterialIcons name="verified" size={isStory ? 14 : 12} color="rgba(255,255,255,0.6)" />
            <Text style={{ fontSize: isStory ? 13 : 11, fontWeight: '600', color: 'rgba(255,255,255,0.75)' }} numberOfLines={1}>{fr ? 'Par' : 'By'} {ambassadorName}</Text>
          </View>
        ) : null}

        {/* Info pills */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: isStory ? 8 : 6, marginBottom: isStory ? 18 : 12 }}>
          <View style={s.infoPill}>
            <MaterialIcons name="track-changes" size={isStory ? 12 : 10} color="rgba(255,255,255,0.7)" />
            <Text style={[s.infoPillText, isStory && { fontSize: 11 }]}>{challengeLabel(challengeType)}{challengeMode === '1v1' ? ' 1v1' : ''}</Text>
          </View>
          <View style={s.infoPill}>
            <MaterialIcons name="event" size={isStory ? 12 : 10} color="rgba(255,255,255,0.7)" />
            <Text style={[s.infoPillText, isStory && { fontSize: 11 }]}>{dateStr}</Text>
          </View>
          <View style={s.infoPill}>
            <MaterialIcons name="schedule" size={isStory ? 12 : 10} color="rgba(255,255,255,0.7)" />
            <Text style={[s.infoPillText, isStory && { fontSize: 11 }]}>{timeStr}</Text>
          </View>
          <View style={s.infoPill}>
            <ScopeIcon scope={scope} size={isStory ? 12 : 10} color="rgba(255,255,255,0.7)" />
            <Text style={[s.infoPillText, isStory && { fontSize: 11 }]} numberOfLines={1}>{locationStr}</Text>
          </View>
          <View style={s.infoPill}>
            <MaterialIcons name="visibility" size={isStory ? 12 : 10} color="rgba(255,255,255,0.7)" />
            <Text style={[s.infoPillText, isStory && { fontSize: 11 }]}>{minWitnesses} {fr ? 'temoins' : 'witnesses'}</Text>
          </View>
        </View>

        {/* Participant progress */}
        <View style={{ marginBottom: isStory ? 18 : 12, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: isStory ? 12 : 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MaterialIcons name="group" size={isStory ? 14 : 12} color="rgba(255,255,255,0.6)" />
              <Text style={{ fontSize: isStory ? 12 : 10, fontWeight: '600', color: 'rgba(255,255,255,0.6)' }}>
                {acceptedCount}/{maxParticipants} {fr ? 'inscrits' : 'registered'}
              </Text>
            </View>
            <Text style={{ fontSize: isStory ? 14 : 12, fontWeight: '900', color: '#FDE68A' }}>{fillPct}%</Text>
          </View>
          <View style={{ height: isStory ? 8 : 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ height: '100%', width: `${Math.max(2, fillPct)}%`, backgroundColor: '#FDE68A', borderRadius: 4 }} />
          </View>
          {fillPct >= 80 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <MaterialIcons name="warning" size={10} color="#FDE68A" />
              <Text style={{ fontSize: 9, fontWeight: '700', color: '#FDE68A' }}>{fr ? 'Presque complet !' : 'Almost full!'}</Text>
            </View>
          ) : null}
        </View>

        {/* QR Code section */}
        <View style={{ alignItems: 'center', marginBottom: isStory ? 14 : 8 }}>
          <View style={{ backgroundColor: '#FFF', borderRadius: isStory ? 16 : 14, padding: isStory ? 12 : 10, marginBottom: isStory ? 10 : 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' }}>
            <QRCode value={qrUrl} size={qrSize} color="#7C3AED" backgroundColor="#FFFFFF" />
          </View>
          {/* Share code */}
          <View style={{ backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: isStory ? 20 : 16, paddingVertical: isStory ? 10 : 8, borderRadius: isStory ? 14 : 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 4 }}>
            <Text style={{ fontSize: codeFontSize, fontWeight: '900', color: '#FFF', letterSpacing: 3, textAlign: 'center' }}>{shareCode}</Text>
          </View>
          <Text style={{ fontSize: isStory ? 11 : 9, color: 'rgba(255,255,255,0.45)', textAlign: 'center' }}>
            {fr ? 'Scannez le QR code ou entrez le code pour participer' : 'Scan QR code or enter code to participate'}
          </Text>
        </View>

        {/* Description excerpt */}
        {description && isStory ? (
          <View style={{ backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 10, marginBottom: 10 }}>
            <Text style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 15 }} numberOfLines={3}>{description}</Text>
          </View>
        ) : null}

        <ShareCardWatermark variant="light" size="sm" />
      </LinearGradient>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flex: 1, borderRadius: 20, overflow: 'hidden', position: 'relative' as const },
  infoPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  infoPillText: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.8)', flexShrink: 1 },
});
