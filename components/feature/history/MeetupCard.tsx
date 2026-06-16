import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '@/constants/theme';
import type { Meetup } from '@/services/meetupService';

export type MeetupWithMeta = Meetup & { _source: 'created' | 'invited'; _acceptedCount?: number };

interface MeetupCardProps {
  meetup: MeetupWithMeta;
  onPress: () => void;
  t: (s: string, k: string) => string;
  language: 'fr' | 'en';
}

export const MeetupCard = React.memo(({ meetup, onPress, t, language }: MeetupCardProps) => {
  const mDate = new Date(meetup.date);
  const isCreator = meetup._source === 'created';
  const isPast = mDate < new Date();
  const daysUntil = Math.max(0, Math.ceil((mDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <Pressable style={styles.meetupCard} onPress={onPress}>
      <View style={[styles.meetupCardIndicator, { backgroundColor: isPast ? theme.textMuted : theme.accent }]} />
      <View style={styles.meetupCardContent}>
        <View style={styles.meetupCardHeader}>
          <View style={[styles.badge, { backgroundColor: isCreator ? theme.primary + '15' : theme.accent + '15' }]}>
            <MaterialIcons name={isCreator ? 'person' : 'mail'} size={12} color={isCreator ? theme.primary : theme.accent} />
            <Text style={[styles.badgeText, { color: isCreator ? theme.primary : theme.accent }]}>
              {isCreator ? t('history', 'meetupCreator') : t('history', 'meetupInvited')}
            </Text>
          </View>
          {!isPast && daysUntil <= 1 ? (
            <View style={[styles.badge, { backgroundColor: theme.warning + '15' }]}>
              <MaterialIcons name="local-fire-department" size={12} color={theme.warning} />
              <Text style={[styles.badgeText, { color: theme.warning }]}>
                {daysUntil === 0 ? t('notifications', 'todayLabel') : t('notifications', 'tomorrowLabel')}
              </Text>
            </View>
          ) : isPast ? (
            <View style={[styles.badge, { backgroundColor: theme.backgroundSecondary }]}>
              <Text style={[styles.badgeText, { color: theme.textMuted }]}>{t('history', 'meetupPast')}</Text>
            </View>
          ) : null}
          <Text style={styles.timeText}>
            {mDate.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        <Text style={styles.meetupCardTitle} numberOfLines={1}>{meetup.title}</Text>
        <View style={styles.meetupCardMeta}>
          {meetup.terrain_name ? (
            <View style={styles.meetupMetaItem}>
              <MaterialIcons name="place" size={12} color={theme.textMuted} />
              <Text style={styles.meetupMetaText} numberOfLines={1}>{meetup.terrain_name}{meetup.terrain_city ? ` - ${meetup.terrain_city}` : ''}</Text>
            </View>
          ) : null}
          <View style={styles.meetupMetaItem}>
            <MaterialIcons name="event" size={12} color={theme.textMuted} />
            <Text style={styles.meetupMetaText}>
              {mDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
            </Text>
          </View>
        </View>
        <View style={styles.meetupCardFooter}>
          <View style={[styles.meetupParticipantsBadge, { backgroundColor: theme.success + '12' }]}>
            <MaterialIcons name="group" size={12} color={theme.success} />
            <Text style={[styles.meetupParticipantsText, { color: theme.success }]}>
              {meetup._acceptedCount || 0}/{meetup.max_participants} {t('history', 'meetupParticipants')}
            </Text>
          </View>
          {meetup.share_code ? (
            <View style={[styles.badge, { backgroundColor: theme.backgroundSecondary }]}>
              <MaterialIcons name="qr-code" size={10} color={theme.textMuted} />
              <Text style={[styles.badgeText, { color: theme.textMuted }]}>{meetup.share_code}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}, (prev, next) => {
  return prev.meetup.id === next.meetup.id &&
    prev.meetup.status === next.meetup.status &&
    prev.meetup._acceptedCount === next.meetup._acceptedCount &&
    prev.meetup._source === next.meetup._source &&
    prev.language === next.language;
});

const styles = StyleSheet.create({
  meetupCard: { flexDirection: 'row', backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, marginBottom: 10, overflow: 'hidden', ...theme.shadows.card },
  meetupCardIndicator: { width: 4 },
  meetupCardContent: { flex: 1, padding: 12 },
  meetupCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 6, flexWrap: 'wrap' },
  meetupCardTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, marginBottom: 6 },
  meetupCardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  meetupMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meetupMetaText: { fontSize: 12, color: theme.textSecondary },
  meetupCardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  meetupParticipantsBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.borderRadius.full },
  meetupParticipantsText: { fontSize: 11, fontWeight: '600' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: theme.borderRadius.full },
  badgeText: { fontSize: 11, fontWeight: '600' },
  timeText: { fontSize: 11, color: theme.textMuted },
});
