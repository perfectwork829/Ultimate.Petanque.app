/**
 * Activity Feed — Hybrid contextual social feed (Option D).
 *
 * Header: Ambassador/event carousel
 * Body: Auto-aggregated activity from ELO changes, badges, records, events, meetups.
 * Zero moderation — all data is system-generated.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  RefreshControl,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

import theme, { blurhash } from '@/constants/theme';
import AdBanner from '@/components/ui/AdBanner';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData } from '@/contexts/AppContext';
import * as Haptics from '@/services/haptics';
import { getEloRank } from '@/services/eloService';
import { BADGES, getBadgeName, getBadgeDescription } from '@/services/badgeService';
import { toggleReaction, fetchReactionsForItems, FeedItemReactions, ReactionType } from '@/services/feedReactionService';
import {
  fetchActivityFeed,
  fetchFeedCarouselData,
  FeedItem,
  FeedMatchResult,
  FeedBadgeUnlock,
  FeedEloMilestone,
  FeedWeeklyRecord,
  FeedEventCreated,
  FeedMeetupCreated,
  FeedClubInvitation,
  fetchWeeklyDigest,
  WeeklyDigest,
  getFollowedPlayerIds,
} from '@/services/activityFeedService';
import { checkFeedNotifications } from '@/services/feedNotificationService';
import { useAuth } from '@/template';

// ============================================
// i18n
// ============================================
const feedStrings = {
  title: { fr: 'Activite', en: 'Activity' },
  subtitle: { fr: 'La communaute en direct', en: 'Community live' },
  noActivity: { fr: 'Aucune activite recente', en: 'No recent activity' },
  noActivityDesc: { fr: 'Les resultats, badges et evenements de la communaute apparaitront ici.', en: 'Community results, badges and events will appear here.' },
  matchWon: { fr: 'a remporte un match', en: 'won a match' },
  matchLost: { fr: 'a perdu un match', en: 'lost a match' },
  vs: { fr: 'contre', en: 'vs' },
  badgeUnlocked: { fr: 'a debloque le badge', en: 'unlocked badge' },
  eloMilestone: { fr: 'a atteint le rang', en: 'reached rank' },
  weeklyTop: { fr: 'Top', en: 'Top' },
  weeklyThisWeek: { fr: 'cette semaine', en: 'this week' },
  newActivities: { fr: 'nouvelles activites', en: 'new activities' },
  digestTitle: { fr: 'Resume de la semaine', en: 'Weekly Digest' },
  digestTopPlayers: { fr: 'Top joueurs', en: 'Top players' },
  digestTotalMatches: { fr: 'matchs joues', en: 'matches played' },
  digestBadges: { fr: 'badges debloques', en: 'badges unlocked' },
  digestBiggestMove: { fr: 'Plus gros mouvement ELO', en: 'Biggest ELO move' },
  digestMostBadge: { fr: 'Badge le plus debloque', en: 'Most unlocked badge' },
  digestPersonal: { fr: 'Votre semaine', en: 'Your week' },
  digestYourElo: { fr: 'Votre ELO', en: 'Your ELO' },
  digestYourMatches: { fr: 'Vos matchs', en: 'Your matches' },
  digestYourBadges: { fr: 'Badges cette semaine', en: 'Badges this week' },
  digestClubPerf: { fr: 'Performance du club', en: 'Club performance' },
  congratsSent: { fr: 'Felicitations envoyees !', en: 'Congrats sent!' },
  viewProfile: { fr: 'Voir le profil', en: 'View profile' },
  eventCreated: { fr: 'Nouveau defi cree', en: 'New challenge created' },
  eventCompleted: { fr: 'Defi termine', en: 'Challenge completed' },
  meetupCreated: { fr: 'Nouveau meetup', en: 'New meetup' },
  invitationSent: { fr: 'Invitation envoyee', en: 'Invitation sent' },
  invitationAccepted: { fr: 'a rejoint le club', en: 'joined the club' },
  invitationDeclined: { fr: 'a decline l\'invitation', en: 'declined the invitation' },
  invitationExpired: { fr: 'Invitation expiree', en: 'Invitation expired' },
  invitedBy: { fr: 'Invite par', en: 'Invited by' },
  declineReason: { fr: 'Raison', en: 'Reason' },
  participants: { fr: 'participants', en: 'participants' },
  join: { fr: 'Rejoindre', en: 'Join' },
  seeAll: { fr: 'Voir tout', en: 'See all' },
  ambassadors: { fr: 'Ambassadeurs', en: 'Ambassadors' },
  upcomingEvents: { fr: 'Evenements a venir', en: 'Upcoming Events' },
  matches: { fr: 'matchs', en: 'matches' },
  wins: { fr: 'victoires', en: 'wins' },
  justNow: { fr: "A l'instant", en: 'Just now' },
  minutesAgo: { fr: 'min', en: 'min ago' },
  hoursAgo: { fr: 'h', en: 'h ago' },
  daysAgo: { fr: 'j', en: 'd ago' },
};

function ft(key: keyof typeof feedStrings, lang: string): string {
  const entry = feedStrings[key];
  return (entry as any)[lang] || (entry as any).fr || key;
}

// ============================================
// Time ago helper
// ============================================
function timeAgo(timestamp: string, lang: string): string {
  const now = Date.now();
  const diff = now - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return ft('justNow', lang);
  if (mins < 60) return `${mins} ${ft('minutesAgo', lang)}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}${ft('hoursAgo', lang)}`;
  const days = Math.floor(hours / 24);
  return `${days}${ft('daysAgo', lang)}`;
}

// ============================================
// CAROUSEL ITEM COMPONENTS
// ============================================
const AmbassadorCarouselItem = React.memo(({ item, lang }: { item: any; lang: string }) => {
  const tierColors: Record<string, string> = {
    gold_sponsor: '#F59E0B',
    sponsor: '#78909C',
    partner: '#A1887F',
    ambassador: '#7C3AED',
  };
  const color = item.brand_color || tierColors[item.badge_type] || '#7C3AED';
  return (
    <Pressable
      style={cs.ambassadorCard}
      onPress={() => { Haptics.selectionAsync(); router.push('/ambassadors'); }}
    >
      <LinearGradient colors={[color + '20', color + '08']} style={cs.ambassadorGradient}>
        {item.photo ? (
          <Image source={{ uri: item.photo }} style={cs.ambassadorPhoto} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
        ) : (
          <View style={[cs.ambassadorPhotoFallback, { backgroundColor: color + '25' }]}>
            <MaterialIcons name="person" size={22} color={color} />
          </View>
        )}
        <Text style={cs.ambassadorName} numberOfLines={1}>{item.display_name}</Text>
        <View style={[cs.ambassadorBadge, { backgroundColor: color }]}>
          <MaterialIcons name={item.badge_type === 'gold_sponsor' ? 'star' : 'verified'} size={9} color="#FFF" />
        </View>
      </LinearGradient>
    </Pressable>
  );
});

const EventCarouselItem = React.memo(({ item, lang }: { item: any; lang: string }) => {
  const evDate = new Date(item.event_date);
  const typeColor: Record<string, string> = { '10_tirs': '#2563EB', '10_tirs_sautee': '#D97706', precision: '#7C3AED' };
  const color = typeColor[item.challenge_type] || '#7C3AED';
  const isActive = item.status === 'active';
  return (
    <Pressable
      style={cs.eventCard}
      onPress={() => { Haptics.selectionAsync(); router.push(`/sponsored-event/${item.id}` as any); }}
    >
      <LinearGradient colors={[color + '15', color + '05']} style={cs.eventGradient}>
        <View style={cs.eventDateCol}>
          <Text style={[cs.eventDateDay, { color }]}>{evDate.getDate()}</Text>
          <Text style={[cs.eventDateMonth, { color }]}>
            {evDate.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={cs.eventTitle} numberOfLines={1}>{item.title}</Text>
          {item.city ? <Text style={cs.eventCity} numberOfLines={1}>{item.city}</Text> : null}
        </View>
        {isActive ? (
          <View style={[cs.eventLiveBadge, { backgroundColor: '#22C55E' }]}>
            <View style={cs.eventLiveDot} />
            <Text style={cs.eventLiveText}>LIVE</Text>
          </View>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
});

// ============================================
// FEED ITEM COMPONENTS
// ============================================
const FeedMatchResultCard = React.memo(({ data, lang, index, goldPlayerIds }: { data: FeedMatchResult; lang: string; index: number; goldPlayerIds?: Set<string> }) => {
  const isGoldPartner = goldPlayerIds ? goldPlayerIds.has(data.playerId) : false;
  const rank = getEloRank(data.eloAfter);
  const deltaColor = data.eloDelta > 0 ? '#22C55E' : '#EF4444';
  const deltaSign = data.eloDelta > 0 ? '+' : '';
  return (
    <Animated.View entering={index < 15 ? FadeInDown.duration(200).delay(Math.min(index * 30, 200)) : undefined}>
      <Pressable style={[fs.card, { borderLeftWidth: 3, borderLeftColor: data.won ? '#22C55E' : '#EF4444' }, isGoldPartner && fs.goldHighlightCard]} onPress={() => { Haptics.selectionAsync(); router.push(`/player/${data.playerId}` as any); }}>
        {isGoldPartner ? (
          <View style={{ position: 'absolute', top: 6, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#D4A01715', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#D4A01725' }}>
            <MaterialIcons name="star" size={9} color="#D4A017" />
            <Text style={{ fontSize: 8, fontWeight: '800', color: '#D4A017', letterSpacing: 0.3 }}>GOLD</Text>
          </View>
        ) : null}
        <View style={fs.cardHeader}>
          {data.playerAvatar ? (
            <Image source={{ uri: data.playerAvatar }} style={fs.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
          ) : (
            <View style={[fs.avatarFallback, { backgroundColor: rank.color + '20' }]}>
              <Text style={[fs.avatarLetter, { color: rank.color }]}>{data.playerName.charAt(0)}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={fs.cardTitle} numberOfLines={1}>
              <Text style={fs.cardTitleBold}>{data.playerName}</Text>
              {' '}{data.won ? ft('matchWon', lang) : ft('matchLost', lang)}
            </Text>
            {data.opponentName ? (
              <Text style={fs.cardSubtitle} numberOfLines={1}>{ft('vs', lang)} {data.opponentName}</Text>
            ) : null}
          </View>
          <View style={fs.eloChip}>
            <Text style={[fs.eloDelta, { color: deltaColor }]}>{deltaSign}{data.eloDelta}</Text>
            <Text style={[fs.eloValue, { color: rank.color }]}>{data.eloAfter}</Text>
          </View>
        </View>
        {data.playerCity ? (
          <View style={fs.locationRow}>
            <MaterialIcons name="place" size={11} color={theme.textMuted} />
            <Text style={fs.locationText}>{data.playerCity}</Text>
          </View>
        ) : null}
        <View style={fs.tapHint}>
          <MaterialIcons name="person" size={11} color={theme.textMuted} />
          <Text style={fs.tapHintText}>{ft('viewProfile', lang)}</Text>
          <View style={{ flex: 1 }} />
          <Pressable
            style={fs.compareBtn}
            onPress={(e) => { e.stopPropagation?.(); Haptics.selectionAsync(); router.push({ pathname: '/player-compare', params: { playerId: data.playerId } } as any); }}
            hitSlop={6}
          >
            <MaterialIcons name="compare-arrows" size={12} color={theme.primary} />
            <Text style={fs.compareBtnText}>{lang === 'fr' ? 'Comparer' : 'Compare'}</Text>
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
});

const FeedBadgeCard = React.memo(({ data, lang, index }: { data: FeedBadgeUnlock; lang: string; index: number }) => {
  const badge = BADGES.find(b => b.id === data.badgeId);
  const badgeName = getBadgeName(data.badgeId, lang as 'fr' | 'en');
  const badgeDesc = getBadgeDescription(data.badgeId, lang as 'fr' | 'en');
  return (
    <Animated.View entering={index < 15 ? FadeInDown.duration(200).delay(Math.min(index * 30, 200)) : undefined}>
      <View style={[fs.card, { borderLeftWidth: 3, borderLeftColor: '#F59E0B' }]}>
        <View style={fs.cardHeader}>
          {data.avatar ? (
            <Image source={{ uri: data.avatar }} style={fs.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
          ) : (
            <View style={[fs.avatarFallback, { backgroundColor: '#F59E0B20' }]}>
              <MaterialIcons name="emoji-events" size={18} color="#F59E0B" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={fs.cardTitle} numberOfLines={1}>
              <Text style={fs.cardTitleBold}>{data.username}</Text>
              {' '}{ft('badgeUnlocked', lang)}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: (badge?.color || '#F59E0B') + '15', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialIcons name={(badge?.icon || 'emoji-events') as any} size={12} color={badge?.color || '#F59E0B'} />
              </View>
              <Text style={[fs.cardSubtitle, { color: '#F59E0B', marginTop: 0 }]}>{badgeName}</Text>
            </View>
            {badgeDesc ? (
              <Text style={fs.badgeDesc} numberOfLines={2}>{badgeDesc}</Text>
            ) : null}
          </View>
        </View>
      </View>
    </Animated.View>
  );
});

const FeedEloMilestoneCard = React.memo(({ data, lang, index }: { data: FeedEloMilestone; lang: string; index: number }) => {
  return (
    <Animated.View entering={index < 15 ? FadeInDown.duration(200).delay(Math.min(index * 30, 200)) : undefined}>
      <View style={[fs.card, fs.milestoneCard, { borderLeftWidth: 3, borderLeftColor: data.rankColor }]}>
        <View style={fs.cardHeader}>
          {data.playerAvatar ? (
            <Image source={{ uri: data.playerAvatar }} style={fs.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
          ) : (
            <View style={[fs.avatarFallback, { backgroundColor: data.rankColor + '20' }]}>
              <MaterialIcons name={data.rankIcon as any} size={18} color={data.rankColor} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={fs.cardTitle} numberOfLines={1}>
              <Text style={fs.cardTitleBold}>{data.playerName}</Text>
              {' '}{ft('eloMilestone', lang)}
            </Text>
            <View style={[fs.rankBadge, { backgroundColor: data.rankColor + '15' }]}>
              <MaterialIcons name={data.rankIcon as any} size={13} color={data.rankColor} />
              <Text style={[fs.rankBadgeText, { color: data.rankColor }]}>{data.rankName} ({data.eloRating})</Text>
            </View>
          </View>
          <Pressable
            style={[fs.congratsBtn, { backgroundColor: data.rankColor + '15' }]}
            onPress={() => {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }}
          >
            <Text style={{ fontSize: 18 }}>👏</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
});

const FeedWeeklyRecordCard = React.memo(({ data, lang, index }: { data: FeedWeeklyRecord; lang: string; index: number }) => {
  const rankColors = ['#F59E0B', '#94A3B8', '#CD7F32', '#64748B', '#64748B'];
  const color = rankColors[Math.min(data.rank - 1, 4)];
  return (
    <Animated.View entering={index < 15 ? FadeInDown.duration(200).delay(Math.min(index * 30, 200)) : undefined}>
      <View style={[fs.card, { borderLeftWidth: 3, borderLeftColor: color }]}>
        <View style={fs.cardHeader}>
          <View style={[fs.rankCircle, { backgroundColor: color }]}>
            <Text style={fs.rankCircleText}>#{data.rank}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={fs.cardTitle} numberOfLines={1}>
              <Text style={fs.cardTitleBold}>{data.username || '???'}</Text>
              {' '}{ft('weeklyTop', lang)} {data.rank} {ft('weeklyThisWeek', lang)}
            </Text>
            <Text style={fs.cardSubtitle}>
              {data.matchesPlayed} {ft('matches', lang)} · {data.wins} {ft('wins', lang)} · {data.winRate}%
            </Text>
          </View>
          <View style={fs.eloChip}>
            <Text style={[fs.eloValue, { color }]}>{data.eloRating}</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
});

const FeedEventCard = React.memo(({ data, type, lang, index }: { data: FeedEventCreated; type: 'event_created' | 'event_completed'; lang: string; index: number }) => {
  const isCompleted = type === 'event_completed';
  const color = isCompleted ? '#22C55E' : '#7C3AED';
  return (
    <Animated.View entering={index < 15 ? FadeInDown.duration(200).delay(Math.min(index * 30, 200)) : undefined}>
      <Pressable
        style={[fs.card, { borderLeftWidth: 3, borderLeftColor: color }]}
        onPress={() => { Haptics.selectionAsync(); router.push(`/sponsored-event/${data.eventId}` as any); }}
      >
        <View style={fs.cardHeader}>
          <View style={[fs.avatarFallback, { backgroundColor: color + '15' }]}>
            <MaterialIcons name={isCompleted ? 'check-circle' : 'campaign'} size={18} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[fs.cardTitle, { color }]}>
              {isCompleted ? ft('eventCompleted', lang) : ft('eventCreated', lang)}
            </Text>
            <Text style={fs.cardTitleBold} numberOfLines={1}>{data.title}</Text>
            {data.city ? (
              <View style={fs.locationRow}>
                <MaterialIcons name="place" size={11} color={theme.textMuted} />
                <Text style={fs.locationText}>{data.city}</Text>
              </View>
            ) : null}
          </View>
          <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
        </View>
      </Pressable>
    </Animated.View>
  );
});

const FeedMeetupCard = React.memo(({ data, lang, index }: { data: FeedMeetupCreated; lang: string; index: number }) => {
  const meetupDate = new Date(data.date);
  return (
    <Animated.View entering={index < 15 ? FadeInDown.duration(200).delay(Math.min(index * 30, 200)) : undefined}>
      <Pressable
        style={[fs.card, { borderLeftWidth: 3, borderLeftColor: theme.accent }]}
        onPress={() => { Haptics.selectionAsync(); router.push(`/meetup/${data.meetupId}` as any); }}
      >
        <View style={fs.cardHeader}>
          <View style={[fs.avatarFallback, { backgroundColor: theme.accent + '15' }]}>
            <MaterialIcons name="event" size={18} color={theme.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[fs.cardTitle, { color: theme.accent }]}>
              {ft('meetupCreated', lang)}
            </Text>
            <Text style={fs.cardTitleBold} numberOfLines={1}>{data.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <Text style={fs.cardSubtitle}>
                {meetupDate.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
              </Text>
              {data.terrainName ? (
                <View style={fs.locationRow}>
                  <MaterialIcons name="place" size={11} color={theme.textMuted} />
                  <Text style={fs.locationText}>{data.terrainName}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
        </View>
      </Pressable>
    </Animated.View>
  );
});

// ============================================
// CLUB INVITATION CARD
// ============================================
const FeedClubInvitationCard = React.memo(({ data, type, lang, index, userId }: {
  data: FeedClubInvitation;
  type: string;
  lang: string;
  index: number;
  userId?: string;
}) => {
  const isMyInvitation = userId && (data.inviterUserId === userId || data.invitedUserId === userId);
  const statusConfig: Record<string, { color: string; icon: string; labelFr: string; labelEn: string }> = {
    club_invitation_sent: { color: '#7C3AED', icon: 'mail', labelFr: 'Invitation envoyee', labelEn: 'Invitation sent' },
    club_invitation_accepted: { color: '#10B981', icon: 'check-circle', labelFr: 'Invitation acceptee', labelEn: 'Invitation accepted' },
    club_invitation_declined: { color: '#EF4444', icon: 'cancel', labelFr: 'Invitation refusee', labelEn: 'Invitation declined' },
    club_invitation_expired: { color: '#94A3B8', icon: 'timer-off', labelFr: 'Invitation expiree', labelEn: 'Invitation expired' },
  };
  const cfg = statusConfig[type] || statusConfig.club_invitation_sent;

  return (
    <Animated.View entering={index < 15 ? FadeInDown.duration(200).delay(Math.min(index * 30, 200)) : undefined}>
      <Pressable
        style={[fs.card, { borderLeftWidth: 3, borderLeftColor: cfg.color }, isMyInvitation ? { backgroundColor: cfg.color + '06' } : undefined]}
        onPress={() => { Haptics.selectionAsync(); router.push(`/club/${data.clubId}` as any); }}
      >
        {/* Inline notification badge for user's own invitations */}
        {isMyInvitation ? (
          <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: cfg.color + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
            <MaterialIcons name="person" size={9} color={cfg.color} />
            <Text style={{ fontSize: 8, fontWeight: '800', color: cfg.color }}>{lang === 'fr' ? 'Vous' : 'You'}</Text>
          </View>
        ) : null}
        <View style={fs.cardHeader}>
          {data.clubLogo ? (
            <Image source={{ uri: data.clubLogo }} style={fs.avatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
          ) : (
            <View style={[fs.avatarFallback, { backgroundColor: cfg.color + '15' }]}>
              <MaterialIcons name="home" size={18} color={cfg.color} />
            </View>
          )}
          <View style={{ flex: 1, paddingRight: isMyInvitation ? 50 : 0 }}>
            {type === 'club_invitation_accepted' ? (
              <Text style={fs.cardTitle} numberOfLines={2}>
                <Text style={fs.cardTitleBold}>{data.invitedPlayerName}</Text>
                {' '}{ft('invitationAccepted', lang)}{' '}
                <Text style={fs.cardTitleBold}>{data.clubName}</Text>
              </Text>
            ) : type === 'club_invitation_declined' ? (
              <Text style={fs.cardTitle} numberOfLines={2}>
                <Text style={fs.cardTitleBold}>{data.invitedPlayerName}</Text>
                {' '}{ft('invitationDeclined', lang)}{' '}
                <Text style={fs.cardTitleBold}>{data.clubName}</Text>
              </Text>
            ) : type === 'club_invitation_expired' ? (
              <Text style={fs.cardTitle} numberOfLines={2}>
                <Text style={[fs.cardTitleBold, { color: '#94A3B8' }]}>{ft('invitationExpired', lang)}</Text>
                {' — '}{data.invitedPlayerName} → {data.clubName}
              </Text>
            ) : (
              <Text style={fs.cardTitle} numberOfLines={2}>
                <Text style={fs.cardTitleBold}>{data.inviterName}</Text>
                {' '}{lang === 'fr' ? 'a invite' : 'invited'}{' '}
                <Text style={fs.cardTitleBold}>{data.invitedPlayerName}</Text>
                {' '}{lang === 'fr' ? 'a rejoindre' : 'to join'}{' '}
                <Text style={fs.cardTitleBold}>{data.clubName}</Text>
              </Text>
            )}
            {/* Invitation message */}
            {data.message && type === 'club_invitation_sent' ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4, backgroundColor: '#7C3AED08', borderRadius: 8, padding: 6 }}>
                <MaterialIcons name="format-quote" size={10} color="#7C3AED" style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 11, color: '#4C1D95', fontStyle: 'italic', flex: 1 }} numberOfLines={2}>{data.message}</Text>
              </View>
            ) : null}
            {/* Decline reason */}
            {data.declineReason && type === 'club_invitation_declined' ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 4, backgroundColor: '#FEF2F2', borderRadius: 8, padding: 6 }}>
                <MaterialIcons name="info-outline" size={10} color="#EF4444" style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 11, color: '#991B1B', flex: 1 }} numberOfLines={2}>{ft('declineReason', lang)}: {data.declineReason}</Text>
              </View>
            ) : null}
          </View>
          <View style={[{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: cfg.color + '12' }]}>
            <MaterialIcons name={cfg.icon as any} size={16} color={cfg.color} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
});

// ============================================
// REACTION BAR
// ============================================
const REACTION_ICONS: { type: ReactionType; emoji: string }[] = [
  { type: 'applause', emoji: '👏' },
  { type: 'fire', emoji: '🔥' },
  { type: 'medal', emoji: '🏅' },
];

const ReactionBar = React.memo(({ feedItemId, reactions, onReact }: {
  feedItemId: string;
  reactions?: FeedItemReactions;
  onReact: (feedItemId: string, type: ReactionType) => void;
}) => {
  const counts = reactions?.counts || { applause: 0, fire: 0, medal: 0 };
  const userReactions = reactions?.userReactions || { applause: false, fire: false, medal: false };
  const hasAnyCount = counts.applause + counts.fire + counts.medal > 0;
  const hasAnyUserReaction = userReactions.applause || userReactions.fire || userReactions.medal;

  return (
    <View style={fs.reactionBar}>
      {REACTION_ICONS.map(({ type, emoji }) => {
        const isActive = userReactions[type];
        const count = counts[type];
        return (
          <Pressable
            key={type}
            style={[fs.reactionBtn, isActive && fs.reactionBtnActive]}
            onPress={() => onReact(feedItemId, type)}
            hitSlop={4}
          >
            <Text style={fs.reactionEmoji}>{emoji}</Text>
            {count > 0 ? (
              <Text style={[fs.reactionCount, isActive && fs.reactionCountActive]}>{count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
});

// ============================================
// FILTER CHIPS
// ============================================
type FeedFilter = 'all' | 'following' | 'matches' | 'badges' | 'events' | 'records' | 'invitations';

const FEED_FILTERS: { id: FeedFilter; icon: keyof typeof MaterialIcons.glyphMap; labelFr: string; labelEn: string }[] = [
  { id: 'all', icon: 'layers', labelFr: 'Tout', labelEn: 'All' },
  { id: 'following', icon: 'person-add', labelFr: 'Abonnements', labelEn: 'Following' },
  { id: 'matches', icon: 'sports', labelFr: 'Matchs', labelEn: 'Matches' },
  { id: 'badges', icon: 'emoji-events', labelFr: 'Badges', labelEn: 'Badges' },
  { id: 'invitations', icon: 'mail', labelFr: 'Invitations', labelEn: 'Invitations' },
  { id: 'events', icon: 'campaign', labelFr: 'Evenements', labelEn: 'Events' },
  { id: 'records', icon: 'leaderboard', labelFr: 'Records', labelEn: 'Records' },
];

const FILTER_TYPES: Record<FeedFilter, string[]> = {
  all: [],
  following: [], // handled separately via player ID filtering
  matches: ['match_result', 'elo_milestone'],
  badges: ['badge_unlock'],
  invitations: ['club_invitation_sent', 'club_invitation_accepted', 'club_invitation_declined', 'club_invitation_expired'],
  events: ['event_created', 'event_completed', 'meetup_created'],
  records: ['weekly_record'],
};

// ============================================
// MAIN SCREEN
// ============================================
export default function ActivityFeedScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const lang = language;
  const { user } = useAuth();
  const { selfPlayer } = useAppData();

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [carouselAmbassadors, setCarouselAmbassadors] = useState<any[]>([]);
  const [carouselEvents, setCarouselEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FeedFilter>('all');
  const [newItemsAvailable, setNewItemsAvailable] = useState(0);
  const [weeklyDigest, setWeeklyDigest] = useState<WeeklyDigest | null>(null);
  const [congratsShown, setCongratsShown] = useState(false);
  const prevItemCountRef = useRef(0);
  const flatListRef = useRef<FlatList>(null);
  const [reactionsMap, setReactionsMap] = useState<Map<string, FeedItemReactions>>(new Map());
  const [followedPlayerIds, setFollowedPlayerIds] = useState<string[]>([]);

  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);

  const loadFeed = useCallback(async () => {
    const [feedResult, carouselResult, digestResult, followedIds] = await Promise.all([
      fetchActivityFeed(40),
      fetchFeedCarouselData(),
      fetchWeeklyDigest(user?.id),
      user?.id ? getFollowedPlayerIds(user.id) : Promise.resolve([]),
    ]);
    setFollowedPlayerIds(followedIds);
    setFeedItems(feedResult.items);
    prevItemCountRef.current = feedResult.items.length;
    // Batch-load reactions for all feed items
    if (feedResult.items.length > 0) {
      const ids = feedResult.items.map(i => i.id);
      fetchReactionsForItems(ids, user?.id).then(setReactionsMap).catch(() => {});
    }
    setCarouselAmbassadors(carouselResult.ambassadors);
    setCarouselEvents(carouselResult.events);
    setWeeklyDigest(digestResult.digest);
  }, []);

  useEffect(() => {
    loadFeed().finally(() => setLoading(false));
  }, [loadFeed]);

  // Polling — check for new items every 60s + feed notifications
  useEffect(() => {
    if (loading) return;
    const interval = setInterval(async () => {
      try {
        const { items } = await fetchActivityFeed(40);
        if (items.length > 0 && prevItemCountRef.current > 0) {
          const hasNew = items[0]?.id !== feedItems[0]?.id;
          if (hasNew) {
            const diff = items.length - prevItemCountRef.current;
            setNewItemsAvailable(Math.max(diff, 1));
          }
        }
      } catch { /* silent */ }
      // Check feed notifications (local push)
      if (user?.id) {
        checkFeedNotifications({
          userId: user.id,
          selfPlayerId: selfPlayer?.id,
          selfClub: selfPlayer?.club,
          selfCity: selfPlayer?.location?.city,
          language: lang,
        }).catch(() => {});
      }
    }, 60000);
    // Also check on first load
    if (user?.id) {
      checkFeedNotifications({
        userId: user.id,
        selfPlayerId: selfPlayer?.id,
        selfClub: selfPlayer?.club,
        selfCity: selfPlayer?.location?.city,
        language: lang,
      }).catch(() => {});
    }
    return () => clearInterval(interval);
  }, [loading, feedItems, user?.id, selfPlayer?.id, selfPlayer?.club, selfPlayer?.location?.city, lang]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setNewItemsAvailable(0);
    await loadFeed();
    setRefreshing(false);
  }, [loadFeed]);

  // Filtered items
  const filteredItems = useMemo(() => {
    if (activeFilter === 'all') return feedItems;
    if (activeFilter === 'following') {
      if (followedPlayerIds.length === 0) return [];
      return feedItems.filter(item => {
        const data = item.data;
        // Match results & ELO milestones — check playerId
        if (data?.playerId && followedPlayerIds.includes(data.playerId)) return true;
        // Badges — check userId
        if (data?.userId && followedPlayerIds.includes(data.userId)) return true;
        // Weekly records — check userId
        if (item.type === 'weekly_record' && data?.userId && followedPlayerIds.includes(data.userId)) return true;
        return false;
      });
    }
    const types = FILTER_TYPES[activeFilter];
    return feedItems.filter(item => types.includes(item.type));
  }, [feedItems, activeFilter, followedPlayerIds]);

  // Filter counts
  const filterCounts = useMemo(() => {
    const counts: Record<FeedFilter, number> = { all: feedItems.length, following: 0, matches: 0, badges: 0, invitations: 0, events: 0, records: 0 };
    feedItems.forEach(item => {
      if (FILTER_TYPES.matches.includes(item.type)) counts.matches++;
      if (FILTER_TYPES.badges.includes(item.type)) counts.badges++;
      if (FILTER_TYPES.invitations.includes(item.type)) counts.invitations++;
      if (FILTER_TYPES.events.includes(item.type)) counts.events++;
      if (FILTER_TYPES.records.includes(item.type)) counts.records++;
      // Count following
      if (followedPlayerIds.length > 0) {
        const data = item.data;
        if ((data?.playerId && followedPlayerIds.includes(data.playerId)) || (data?.userId && followedPlayerIds.includes(data.userId))) {
          counts.following++;
        }
      }
    });
    return counts;
  }, [feedItems, followedPlayerIds]);

  // Handle reaction toggle
  const handleReaction = useCallback(async (feedItemId: string, reactionType: ReactionType) => {
    if (!user?.id) return;
    Haptics.selectionAsync();
    // Optimistic update
    setReactionsMap(prev => {
      const next = new Map(prev);
      const existing = next.get(feedItemId) || { counts: { applause: 0, fire: 0, medal: 0 }, userReactions: { applause: false, fire: false, medal: false } };
      const wasActive = existing.userReactions[reactionType];
      next.set(feedItemId, {
        counts: { ...existing.counts, [reactionType]: existing.counts[reactionType] + (wasActive ? -1 : 1) },
        userReactions: { ...existing.userReactions, [reactionType]: !wasActive },
      });
      return next;
    });
    const { success, added } = await toggleReaction(feedItemId, reactionType, user.id);
    if (!success) {
      // Revert optimistic update
      setReactionsMap(prev => {
        const next = new Map(prev);
        const existing = next.get(feedItemId);
        if (existing) {
          const wasAdded = existing.userReactions[reactionType];
          next.set(feedItemId, {
            counts: { ...existing.counts, [reactionType]: existing.counts[reactionType] + (wasAdded ? -1 : 1) },
            userReactions: { ...existing.userReactions, [reactionType]: !wasAdded },
          });
        }
        return next;
      });
    }
  }, [user?.id]);

  // Render feed item
  // Compute gold partner player IDs from carousel ambassadors
  const goldPlayerIds = useMemo(() => {
    const ids = new Set<string>();
    carouselAmbassadors.forEach((a: any) => {
      if (a.badge_type === 'gold_sponsor' && a.player_id) ids.add(a.player_id);
    });
    return ids;
  }, [carouselAmbassadors]);

  const renderItem = useCallback(({ item, index }: { item: FeedItem; index: number }) => {
    const timestampLabel = timeAgo(item.timestamp, lang);
    const itemReactions = reactionsMap.get(item.id);

    const wrapper = (content: React.ReactNode) => (
      <View style={fs.itemWrapper}>
        <Text style={fs.timestamp}>{timestampLabel}</Text>
        {content}
        <ReactionBar feedItemId={item.id} reactions={itemReactions} onReact={handleReaction} />
        {/* Inject ad every 8 items */}
        {(index + 1) % 8 === 0 ? <View style={{ marginTop: 8 }}><AdBanner position="inline" /></View> : null}
      </View>
    );

    switch (item.type) {
      case 'match_result':
        return wrapper(<FeedMatchResultCard data={item.data as FeedMatchResult} lang={lang} index={index} goldPlayerIds={goldPlayerIds} />);
      case 'badge_unlock':
        return wrapper(<FeedBadgeCard data={item.data as FeedBadgeUnlock} lang={lang} index={index} />);
      case 'elo_milestone':
        return wrapper(<FeedEloMilestoneCard data={item.data as FeedEloMilestone} lang={lang} index={index} />);
      case 'weekly_record':
        return wrapper(<FeedWeeklyRecordCard data={item.data as FeedWeeklyRecord} lang={lang} index={index} />);
      case 'event_created':
      case 'event_completed':
        return wrapper(<FeedEventCard data={item.data as FeedEventCreated} type={item.type} lang={lang} index={index} />);
      case 'meetup_created':
        return wrapper(<FeedMeetupCard data={item.data as FeedMeetupCreated} lang={lang} index={index} />);
      case 'club_invitation_sent':
      case 'club_invitation_accepted':
      case 'club_invitation_declined':
      case 'club_invitation_expired':
        return wrapper(<FeedClubInvitationCard data={item.data as FeedClubInvitation} type={item.type} lang={lang} index={index} userId={user?.id} />);
      case 'team_complete': {
        const td = item.data as { teamId: string; tournamentId: string; tournamentName: string; memberNames: string[]; memberUserIds?: string[]; format: string };
        return wrapper(
          <Animated.View entering={index < 15 ? FadeInDown.duration(200).delay(Math.min(index * 30, 200)) : undefined}>
            <Pressable
              style={[fs.card, { borderLeftWidth: 3, borderLeftColor: '#22C55E', backgroundColor: '#F0FDF4' }]}
              onPress={() => { Haptics.selectionAsync(); router.push(`/tournament/${td.tournamentId}` as any); }}
            >
              <View style={fs.cardHeader}>
                <View style={[fs.avatarFallback, { backgroundColor: '#22C55E15' }]}>
                  <MaterialIcons name="groups" size={20} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[fs.cardTitle, { color: '#16A34A' }]}>
                    {lang === 'fr' ? 'Equipe complete !' : 'Team complete!'}
                  </Text>
                  <Pressable onPress={() => { Haptics.selectionAsync(); router.push(`/tournament/${td.tournamentId}` as any); }}>
                    <Text style={[fs.cardTitleBold, { color: '#0F172A' }]} numberOfLines={1}>{td.tournamentName}</Text>
                  </Pressable>
                  {/* Player avatars row */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: -6, marginTop: 8, marginBottom: 4 }}>
                    {(td.memberUserIds || []).slice(0, 4).map((uid, i) => (
                      <View key={uid} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: ['#22C55E', '#3B82F6', '#F59E0B', '#7C3AED'][i % 4] + '25', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#F0FDF4', marginLeft: i > 0 ? -6 : 0, zIndex: 10 - i }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: ['#16A34A', '#2563EB', '#D97706', '#6D28D9'][i % 4] }}>{(td.memberNames[i] || '?').charAt(0)}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                    {td.memberNames.map((name, i) => (
                      <View key={i} style={{ backgroundColor: '#22C55E15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#16A34A' }}>{name}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    <View style={{ backgroundColor: '#22C55E10', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                      <Text style={{ fontSize: 10, fontWeight: '700', color: '#16A34A' }}>{td.format}</Text>
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: 'center', gap: 4 }}>
                  <View style={{ backgroundColor: '#22C55E', width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="check" size={18} color="#FFF" />
                  </View>
                  <Text style={{ fontSize: 8, fontWeight: '700', color: '#16A34A' }}>{lang === 'fr' ? 'PRET' : 'READY'}</Text>
                </View>
              </View>
              {/* View Tournament CTA */}
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#BBF7D0' }}
                onPress={() => { Haptics.selectionAsync(); router.push(`/tournament/${td.tournamentId}` as any); }}
              >
                <MaterialIcons name="emoji-events" size={14} color="#16A34A" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#16A34A' }}>{lang === 'fr' ? 'Voir le tournoi' : 'View Tournament'}</Text>
                <MaterialIcons name="chevron-right" size={14} color="#16A34A" />
              </Pressable>
            </Pressable>
          </Animated.View>
        );
      }
      default:
        return null;
    }
  }, [lang, reactionsMap, handleReaction, goldPlayerIds]);

  const keyExtractor = useCallback((item: FeedItem) => item.id, []);

  // Handle new items banner tap
  const handleNewItemsTap = useCallback(() => {
    setNewItemsAvailable(0);
    handleRefresh();
    flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, [handleRefresh]);

  // Header component with carousel + digest
  const ListHeader = useCallback(() => (
    <View>
      {/* Weekly Digest */}
      {weeklyDigest && (weeklyDigest.topPlayers.length > 0 || weeklyDigest.totalMatches > 0) ? (
        <View style={ds.digestCard}>
          <LinearGradient colors={['#1E3A8A', '#2563EB']} style={ds.digestGradient}>
            <View style={ds.digestHeader}>
              <MaterialIcons name="insights" size={18} color="#FFF" />
              <Text style={ds.digestTitle}>{ft('digestTitle', lang)}</Text>
            </View>

            {/* Top 3 Players */}
            {weeklyDigest.topPlayers.length > 0 ? (
              <View style={ds.digestSection}>
                <Text style={ds.digestSectionTitle}>{ft('digestTopPlayers', lang)}</Text>
                <View style={ds.digestPlayersRow}>
                  {weeklyDigest.topPlayers.map((p, i) => {
                    const medals = ['🥇', '🥈', '🥉'];
                    return (
                      <Pressable key={p.userId} style={ds.digestPlayerItem} onPress={() => router.push('/leaderboard' as any)}>
                        <Text style={ds.digestMedal}>{medals[i] || ''}</Text>
                        {p.avatar ? (
                          <Image source={{ uri: p.avatar }} style={ds.digestPlayerAvatar} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                        ) : (
                          <View style={ds.digestPlayerAvatarFallback}>
                            <Text style={ds.digestPlayerAvatarLetter}>{p.username.charAt(0)}</Text>
                          </View>
                        )}
                        <Text style={ds.digestPlayerName} numberOfLines={1}>{p.username}</Text>
                        <Text style={ds.digestPlayerStat}>{p.wins}W · {p.eloRating}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Stats Row */}
            <View style={ds.digestStatsRow}>
              {weeklyDigest.totalMatches > 0 ? (
                <View style={ds.digestStatItem}>
                  <MaterialIcons name="sports" size={14} color="#60A5FA" />
                  <Text style={ds.digestStatValue}>{weeklyDigest.totalMatches}</Text>
                  <Text style={ds.digestStatLabel}>{ft('digestTotalMatches', lang)}</Text>
                </View>
              ) : null}
              {weeklyDigest.totalBadgesUnlocked > 0 ? (
                <View style={ds.digestStatItem}>
                  <MaterialIcons name="emoji-events" size={14} color="#FBBF24" />
                  <Text style={ds.digestStatValue}>{weeklyDigest.totalBadgesUnlocked}</Text>
                  <Text style={ds.digestStatLabel}>{ft('digestBadges', lang)}</Text>
                </View>
              ) : null}
            </View>

            {/* Biggest ELO Move */}
            {weeklyDigest.biggestEloMove ? (
              <Pressable style={ds.digestHighlight} onPress={() => router.push(`/player/${weeklyDigest.biggestEloMove!.playerId}` as any)}>
                <MaterialIcons name="trending-up" size={14} color="#34D399" />
                <Text style={ds.digestHighlightText}>
                  {ft('digestBiggestMove', lang)}: <Text style={{ fontWeight: '800', color: '#34D399' }}>+{weeklyDigest.biggestEloMove.delta}</Text> {weeklyDigest.biggestEloMove.playerName} ({weeklyDigest.biggestEloMove.eloAfter})
                </Text>
              </Pressable>
            ) : null}

            {/* Personal Stats */}
            {weeklyDigest.personal && weeklyDigest.personal.matchesPlayed > 0 ? (
              <View style={{ marginTop: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
                <Text style={ds.digestSectionTitle}>{ft('digestPersonal', lang)}</Text>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: weeklyDigest.personal.eloDelta >= 0 ? '#34D399' : '#F87171' }}>
                      {weeklyDigest.personal.eloDelta >= 0 ? '+' : ''}{weeklyDigest.personal.eloDelta}
                    </Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>ELO</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.7)' }}>{weeklyDigest.personal.eloAfter}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 }}>
                    <Text style={{ fontSize: 18, fontWeight: '900', color: '#60A5FA' }}>{weeklyDigest.personal.matchesPlayed}</Text>
                    <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>{ft('digestYourMatches', lang)}</Text>
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#34D399' }}>{weeklyDigest.personal.wins}W</Text>
                  </View>
                  {weeklyDigest.personal.badgesUnlocked.length > 0 ? (
                    <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 }}>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: '#FBBF24' }}>{weeklyDigest.personal.badgesUnlocked.length}</Text>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>Badges</Text>
                    </View>
                  ) : null}
                  {weeklyDigest.personal.clubMatchesThisWeek > 0 ? (
                    <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 }}>
                      <Text style={{ fontSize: 18, fontWeight: '900', color: '#A78BFA' }}>{weeklyDigest.personal.clubWinRate}%</Text>
                      <Text style={{ fontSize: 9, fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>Club</Text>
                      <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.5)' }}>{weeklyDigest.personal.clubMatchesThisWeek} {ft('matches', lang)}</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Most Unlocked Badge */}
            {weeklyDigest.mostUnlockedBadgeId ? (() => {
              const mb = BADGES.find(b => b.id === weeklyDigest.mostUnlockedBadgeId);
              if (!mb) return null;
              const mbName = lang === 'fr' ? mb.name : (mb.nameEn || mb.name);
              return (
                <View style={ds.digestHighlight}>
                  <Text style={{ fontSize: 14 }}>{mb.icon || '🏅'}</Text>
                  <Text style={ds.digestHighlightText}>
                    {ft('digestMostBadge', lang)}: <Text style={{ fontWeight: '800', color: '#FBBF24' }}>{mbName}</Text> ({weeklyDigest.mostUnlockedBadgeCount}x)
                  </Text>
                </View>
              );
            })() : null}
          </LinearGradient>
        </View>
      ) : null}

      {/* Ambassador Carousel */}
      {carouselAmbassadors.length > 0 ? (
        <View style={hs.carouselSection}>
          <View style={hs.carouselHeader}>
            <MaterialIcons name="verified" size={16} color="#7C3AED" />
            <Text style={hs.carouselTitle}>{ft('ambassadors', lang)}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={hs.carouselScroll}>
            {carouselAmbassadors.map((a: any) => (
              <AmbassadorCarouselItem key={a.id} item={a} lang={lang} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Event Carousel */}
      {carouselEvents.length > 0 ? (
        <View style={hs.carouselSection}>
          <View style={hs.carouselHeader}>
            <MaterialIcons name="campaign" size={16} color="#7C3AED" />
            <Text style={hs.carouselTitle}>{ft('upcomingEvents', lang)}</Text>
            <Pressable style={hs.seeAllBtn} onPress={() => router.push('/sponsored-event/list' as any)}>
              <Text style={hs.seeAllText}>{ft('seeAll', lang)}</Text>
              <MaterialIcons name="chevron-right" size={14} color={theme.primary} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={hs.carouselScroll}>
            {carouselEvents.map((e: any) => (
              <EventCarouselItem key={e.id} item={e} lang={lang} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {/* Filter chips */}
      <View style={hs.filterContainer} key="filters">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={hs.filterScroll}>
          {FEED_FILTERS.map(f => {
            const isActive = activeFilter === f.id;
            const count = filterCounts[f.id];
            return (
              <Pressable
                key={f.id}
                style={[hs.filterChip, isActive && hs.filterChipActive]}
                onPress={() => { Haptics.selectionAsync(); setActiveFilter(f.id); }}
              >
                <MaterialIcons name={f.icon} size={14} color={isActive ? '#FFF' : theme.textSecondary} />
                <Text style={[hs.filterChipText, isActive && hs.filterChipTextActive]}>
                  {lang === 'fr' ? f.labelFr : f.labelEn}
                </Text>
                <View style={[hs.filterCount, isActive && hs.filterCountActive]}>
                  <Text style={[hs.filterCountText, isActive && hs.filterCountTextActive]}>{count}</Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  ), [carouselAmbassadors, carouselEvents, activeFilter, filterCounts, lang, weeklyDigest]);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={ps.container}>
        <View style={ps.header}>
          <Pressable style={ps.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <View>
            <Text style={ps.headerTitle}>{ft('title', lang)}</Text>
            <Text style={ps.headerSubtitle}>{ft('subtitle', lang)}</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={ps.container}>
      {/* Header */}
      <View style={ps.header}>
        <Pressable style={ps.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View>
          <Text style={ps.headerTitle}>{ft('title', lang)}</Text>
          <Text style={ps.headerSubtitle}>{ft('subtitle', lang)}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* New items banner */}
      {newItemsAvailable > 0 ? (
        <Pressable style={ps.newItemsBanner} onPress={handleNewItemsTap}>
          <MaterialIcons name="arrow-upward" size={14} color="#FFF" />
          <Text style={ps.newItemsBannerText}>
            {newItemsAvailable} {ft('newActivities', lang)}
          </Text>
        </Pressable>
      ) : null}

      {/* Feed list */}
      <FlatList
        ref={flatListRef}
        data={filteredItems}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews={true}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} colors={[theme.primary]} />
        }
        ListEmptyComponent={
          <View style={ps.emptyState}>
            <MaterialIcons name="dynamic-feed" size={48} color={theme.textMuted} />
            <Text style={ps.emptyTitle}>{ft('noActivity', lang)}</Text>
            <Text style={ps.emptyText}>{ft('noActivityDesc', lang)}</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// ============================================
// STYLES — Page
// ============================================
const ps = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, textAlign: 'center' },
  headerSubtitle: { fontSize: 11, color: theme.textSecondary, textAlign: 'center', marginTop: 1 },
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginTop: 16, marginBottom: 6 },
  emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  newItemsBanner: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    zIndex: 10,
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 },
      android: { elevation: 8 },
      default: {},
    }),
  },
  newItemsBannerText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
});

// ============================================
// STYLES — Header / Carousel
// ============================================
const hs = StyleSheet.create({
  carouselSection: { paddingTop: 16, paddingBottom: 8 },
  carouselHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  carouselTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, flex: 1 },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 12, fontWeight: '600', color: theme.primary },
  carouselScroll: { paddingHorizontal: 16, gap: 10 },
  filterContainer: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginTop: 4,
  },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: 20,
  },
  filterChipActive: { backgroundColor: theme.primary },
  filterChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  filterChipTextActive: { color: '#FFF' },
  filterCount: { paddingHorizontal: 5, paddingVertical: 1, backgroundColor: '#E2E8F0', borderRadius: 8 },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  filterCountText: { fontSize: 10, fontWeight: '700', color: theme.textSecondary },
  filterCountTextActive: { color: '#FFF' },
});

// ============================================
// STYLES — Carousel items
// ============================================
const cs = StyleSheet.create({
  ambassadorCard: { width: 90, borderRadius: 16, overflow: 'hidden' },
  ambassadorGradient: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 16, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  ambassadorPhoto: { width: 44, height: 44, borderRadius: 14 },
  ambassadorPhotoFallback: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ambassadorName: { fontSize: 10, fontWeight: '700', color: theme.textPrimary, marginTop: 6, textAlign: 'center' },
  ambassadorBadge: { position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  eventCard: { width: 220, borderRadius: 14, overflow: 'hidden' },
  eventGradient: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, gap: 10, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
  eventDateCol: { alignItems: 'center', minWidth: 36 },
  eventDateDay: { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  eventDateMonth: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
  eventTitle: { fontSize: 13, fontWeight: '700', color: theme.textPrimary },
  eventCity: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  eventLiveBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  eventLiveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FFF' },
  eventLiveText: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
});

// ============================================
// STYLES — Feed items
// ============================================
const fs = StyleSheet.create({
  itemWrapper: { paddingHorizontal: 16, marginBottom: 4 },
  timestamp: { fontSize: 10, fontWeight: '600', color: theme.textMuted, marginBottom: 4, marginLeft: 4 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    ...Platform.select({
      ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6 },
      android: { elevation: 1 },
      default: {},
    }),
  },
  milestoneCard: {
    backgroundColor: '#FFFBF0',
  },
  goldHighlightCard: {
    backgroundColor: '#FFFDF5',
    borderColor: '#D4A01730',
    borderWidth: 1.5,
    borderTopWidth: 3,
    borderTopColor: '#D4A01750',
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 12 },
  avatarFallback: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 16, fontWeight: '700' },
  cardTitle: { fontSize: 13, color: theme.textSecondary, lineHeight: 18 },
  cardTitleBold: { fontWeight: '700', color: theme.textPrimary },
  cardSubtitle: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  eloChip: { alignItems: 'flex-end' },
  eloDelta: { fontSize: 13, fontWeight: '800' },
  eloValue: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  locationText: { fontSize: 11, color: theme.textMuted },
  rankBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginTop: 4, alignSelf: 'flex-start' },
  rankBadgeText: { fontSize: 12, fontWeight: '700' },
  rankCircle: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rankCircleText: { fontSize: 14, fontWeight: '900', color: '#FFF' },
  tapHint: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  tapHintText: { fontSize: 10, fontWeight: '600', color: theme.textMuted },
  compareBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary + '12', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: theme.primary + '25' },
  compareBtnText: { fontSize: 10, fontWeight: '700', color: theme.primary },
  badgeDesc: { fontSize: 11, color: theme.textMuted, marginTop: 3, lineHeight: 15, fontStyle: 'italic' },
  congratsBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // Reactions
  reactionBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 6 },
  reactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  reactionBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' },
  reactionEmoji: { fontSize: 14 },
  reactionCount: { fontSize: 11, fontWeight: '700', color: theme.textMuted },
  reactionCountActive: { color: '#3B82F6' },
});

// ============================================
// STYLES — Weekly Digest
// ============================================
const ds = StyleSheet.create({
  digestCard: { marginHorizontal: 16, marginTop: 16, marginBottom: 8, borderRadius: 20, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 }, android: { elevation: 6 }, default: {} }) },
  digestGradient: { padding: 18, borderRadius: 20 },
  digestHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  digestTitle: { fontSize: 16, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 },
  digestSection: { marginBottom: 14 },
  digestSectionTitle: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  digestPlayersRow: { flexDirection: 'row', gap: 10 },
  digestPlayerItem: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6 },
  digestMedal: { fontSize: 18, marginBottom: 4 },
  digestPlayerAvatar: { width: 36, height: 36, borderRadius: 12, marginBottom: 6 },
  digestPlayerAvatarFallback: { width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  digestPlayerAvatarLetter: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  digestPlayerName: { fontSize: 11, fontWeight: '700', color: '#FFF', textAlign: 'center' },
  digestPlayerStat: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 2 },
  digestStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 10 },
  digestStatItem: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  digestStatValue: { fontSize: 16, fontWeight: '800', color: '#FFF' },
  digestStatLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  digestHighlight: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginTop: 4 },
  digestHighlightText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.8)', flex: 1 },
});
