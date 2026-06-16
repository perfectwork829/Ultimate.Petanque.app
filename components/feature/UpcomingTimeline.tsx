import React, { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, TextInput, ActivityIndicator, Modal, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { TimelineSkeleton } from '@/components/ui/SkeletonLoader';
import { findMeetupByCode } from '@/services/meetupService';
import { formatDistance } from '@/services/terrainProximityService';
import { useHomeDistanceFilterLocation } from '@/hooks/useHomeDistanceFilterLocation';
import {
  HOME_DISTANCE_OPTIONS,
  type DistanceFilter,
  type UpcomingItemLike,
  buildCoordsMap,
  filterItemsByDistance,
  resolveUpcomingItemCoords,
} from '@/utils/homeDistanceCoords';
import type { Terrain } from '@/types/petanque';

interface UpcomingItem extends UpcomingItemLike {
  date: Date;
  distanceKm?: number;
}

const DISTANCE_OPTIONS = HOME_DISTANCE_OPTIONS;
const SCROLL_ITEM_LIMIT = 4;
const CARD_HEIGHT = 86;
const CARD_GAP = 8;
const SCROLL_MAX_HEIGHT = SCROLL_ITEM_LIMIT * CARD_HEIGHT + (SCROLL_ITEM_LIMIT - 1) * CARD_GAP;

interface Props {
  tournaments: any[];
  meetups: any[];
  upcomingEvents: any[];
  terrains: Terrain[];
  meetupsLoading: boolean;
  eventsLoading: boolean;
  pendingInviteCount: number;
  language: string;
  t: (ns: string, key: string) => string;
  now: number;
  onShowMeetupList: () => void;
  onJoinSuccess?: (meetupId: string) => void;
}

function UpcomingTimeline({
  tournaments, meetups, upcomingEvents, terrains, meetupsLoading, eventsLoading,
  pendingInviteCount, language, t, now, onShowMeetupList, onJoinSuccess,
}: Props) {
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [distanceFilter, setDistanceFilter] = useState<DistanceFilter>('all');
  const { location: userLocation, loading: gpsLoading, denied: gpsDenied, requestLocation: requestGPS } = useHomeDistanceFilterLocation();
  const [itemCoordsMap, setItemCoordsMap] = useState<Map<string, { lat: number; lng: number }>>(new Map());

  useEffect(() => {
    if (distanceFilter !== 'all' && !userLocation && !gpsLoading) {
      requestGPS();
    }
  }, [distanceFilter, userLocation, gpsLoading, requestGPS]);

  const handleJoinByCode = useCallback(async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setJoinError('');
    try {
      const { meetup: found } = await findMeetupByCode(code);
      if (!found) {
        setJoinError(language === 'fr' ? 'Code invalide ou RDV introuvable' : 'Invalid code or meetup not found');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setJoinCode('');
        if (onJoinSuccess) onJoinSuccess(found.id);
        else router.push(`/meetup/${found.id}` as any);
      }
    } catch {
      setJoinError(language === 'fr' ? 'Erreur de connexion' : 'Connection error');
    } finally {
      setJoining(false);
    }
  }, [joinCode, language, onJoinSuccess]);

  const typeConfig = {
    meetup: { bg: '#E0F2FE', accent: '#0369A1', icon: 'event' as const, label: language === 'fr' ? 'RDV' : 'Meetup' },
    tournament: { bg: '#FEF3C7', accent: '#B45309', icon: 'emoji-events' as const, label: language === 'fr' ? 'Tournoi' : 'Tournament' },
    challenge: { bg: '#EDE9FE', accent: '#7C3AED', icon: 'campaign' as const, label: language === 'fr' ? 'Defi' : 'Challenge' },
  };

  const allItems = useMemo((): UpcomingItem[] => {
    const built: UpcomingItem[] = [];
    tournaments
      .filter((tr: any) => tr.status === 'À venir' || tr.status === 'En cours')
      .forEach((tr: any) => built.push({ id: `t-${tr.id}`, type: 'tournament', date: new Date(tr.date), data: tr }));
    meetups.forEach(m => built.push({ id: `m-${m.id}`, type: 'meetup', date: new Date(m.date), data: m }));
    upcomingEvents.forEach(e => built.push({ id: `e-${e.id}`, type: 'challenge', date: new Date(e.eventDate), data: e }));
    built.sort((a, b) => a.date.getTime() - b.date.getTime());
    return built;
  }, [tournaments, meetups, upcomingEvents]);

  useEffect(() => {
    if (distanceFilter === 'all' || allItems.length === 0) {
      setItemCoordsMap(new Map());
      return;
    }
    let cancelled = false;
    buildCoordsMap(allItems, item => resolveUpcomingItemCoords(item, terrains)).then(map => {
      if (!cancelled) setItemCoordsMap(map);
    });
    return () => { cancelled = true; };
  }, [distanceFilter, allItems, terrains]);

  const items = useMemo(() => {
    if (distanceFilter === 'all') return allItems;
    if (!userLocation) return [];
    const maxKm = Number(distanceFilter);
    const userLoc = { lat: userLocation.lat, lng: userLocation.lng };
    return filterItemsByDistance(allItems, itemCoordsMap, userLoc, maxKm);
  }, [allItems, distanceFilter, userLocation, itemCoordsMap]);

  const distanceLabels: Record<DistanceFilter, string> = {
    all: t('directory', 'distanceAll'),
    '5': '5 km',
    '10': '10 km',
    '25': '25 km',
    '50': '50 km',
    '100': '100 km',
  };

  const renderEventCard = (item: UpcomingItem) => {
    const cfg = typeConfig[item.type];
    const d = item.date;
    const daysUntil = Math.max(0, Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
    const isToday = daysUntil === 0;
    const isTomorrow = daysUntil === 1;

    return (
      <Pressable
        key={item.id}
        style={({ pressed }) => [s.card, { borderLeftColor: cfg.accent, backgroundColor: cfg.bg }, pressed && { opacity: 0.9, transform: [{ scale: 0.985 }] }]}
        onPress={() => {
          if (item.type === 'tournament') router.push(`/tournament/${item.data.id}`);
          else if (item.type === 'meetup') router.push(`/meetup/${item.data.id}` as any);
          else router.push(`/sponsored-event/${item.data.id}` as any);
        }}
      >
        <View style={[s.dateCol, { backgroundColor: cfg.accent + '15' }]}>
          <Text style={[s.dateDay, { color: cfg.accent }]}>{d.getDate()}</Text>
          <Text style={[s.dateMonth, { color: cfg.accent }]}>{d.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}</Text>
        </View>
        <View style={s.content}>
          <View style={s.contentTop}>
            <View style={[s.typeBadge, { backgroundColor: cfg.accent + '18' }]}>
              <MaterialIcons name={cfg.icon} size={10} color={cfg.accent} />
              <Text style={[s.typeBadgeText, { color: cfg.accent }]}>{cfg.label}</Text>
            </View>
            {(isToday || isTomorrow) ? (
              <View style={[s.soonBadge, isToday && { backgroundColor: '#FEE2E2' }]}>
                {isToday ? <MaterialIcons name="local-fire-department" size={10} color="#DC2626" /> : null}
                <Text style={[s.soonText, isToday && { color: '#DC2626' }]}>{isToday ? t('notifications', 'todayLabel') : t('notifications', 'tomorrowLabel')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[s.title, { color: cfg.accent }]} numberOfLines={1}>
            {item.type === 'tournament' ? item.data.name : item.data.title}
          </Text>
          <View style={s.meta}>
            <View style={s.metaItem}>
              <MaterialIcons name="schedule" size={11} color={cfg.accent + '90'} />
              <Text style={[s.metaText, { color: cfg.accent + '90' }]}>
                {item.type === 'challenge'
                  ? new Date(item.data.startTime).toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })
                  : d.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            {(item.type === 'tournament' && item.data.location?.city) ? (
              <View style={s.metaItem}><MaterialIcons name="place" size={11} color={cfg.accent + '90'} /><Text style={[s.metaText, { color: cfg.accent + '90' }]} numberOfLines={1}>{item.data.location.city}</Text></View>
            ) : (item.type === 'challenge' && item.data.city) ? (
              <View style={s.metaItem}><MaterialIcons name="place" size={11} color={cfg.accent + '90' } /><Text style={[s.metaText, { color: cfg.accent + '90' }]} numberOfLines={1}>{item.data.city}</Text></View>
            ) : null}
            {item.type === 'meetup' ? (
              <View style={s.metaItem}><MaterialIcons name="group" size={11} color={cfg.accent + '90'} /><Text style={[s.metaText, { color: cfg.accent + '90' }]}>{item.data._acceptedCount || 0}/{item.data._maxParticipants || 8}</Text></View>
            ) : item.type === 'challenge' && item.data.ambassadorName ? (
              <View style={s.metaItem}><MaterialIcons name="verified" size={11} color="#7C3AED" /><Text style={[s.metaText, { color: '#7C3AED' }]} numberOfLines={1}>{item.data.ambassadorName}</Text></View>
            ) : item.type === 'tournament' ? (
              <View style={s.metaItem}><MaterialIcons name="sports" size={11} color={cfg.accent + '90'} /><Text style={[s.metaText, { color: cfg.accent + '90' }]}>{t('formats', item.data.format)}</Text></View>
            ) : null}
            {item.distanceKm != null ? (
              <View style={s.metaItem}>
                <MaterialIcons name="near-me" size={11} color={cfg.accent + '90'} />
                <Text style={[s.metaText, { color: cfg.accent + '90' }]}>{formatDistance(Math.round(item.distanceKm * 1000), language)}</Text>
              </View>
            ) : null}
          </View>
          {(() => {
            const diffMs = d.getTime() - now;
            if (diffMs <= 0 || isToday || isTomorrow) return null;
            const cDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const cHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const cMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            return (
              <View style={[s.countdown, { backgroundColor: cfg.accent + '10' }]}>
                <MaterialIcons name="timer" size={11} color={cfg.accent} />
                <Text style={[s.countdownText, { color: cfg.accent }]}>
                  {cDays > 0 ? (language === 'fr' ? `dans ${cDays}j ${cHours}h` : `in ${cDays}d ${cHours}h`) : (language === 'fr' ? `dans ${cHours}h ${cMinutes}min` : `in ${cHours}h ${cMinutes}min`)}
                </Text>
              </View>
            );
          })()}
        </View>
        <MaterialIcons name="chevron-right" size={18} color={cfg.accent + '60'} />
      </Pressable>
    );
  };

  const totalBeforeFilter = allItems.length;

  return (
    <View>
      <View style={s.headerRow}>
        <MaterialIcons name="event-note" size={18} color={theme.primary} />
        <Text style={s.headerTitle}>{t('home', 'upcoming')}</Text>
        <View style={{ flex: 1 }} />
        <View style={s.actions}>
          {pendingInviteCount > 0 ? (
            <Pressable style={s.actionBtn} onPress={() => router.push('/meetup/invitations' as any)}>
              <MaterialIcons name="mail" size={14} color={theme.error} />
              <View style={s.actionBadge}><Text style={s.actionBadgeText}>{pendingInviteCount > 9 ? '9+' : pendingInviteCount}</Text></View>
            </Pressable>
          ) : null}
          <Pressable
            style={s.joinHeaderBtn}
            onPress={() => {
              Haptics.selectionAsync();
              setShowJoinModal(true);
            }}
          >
            <MaterialIcons name="qr-code-2" size={14} color="#0369A1" />
            <Text style={s.joinHeaderBtnText}>{language === 'fr' ? 'Rejoindre' : 'Join'}</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.filterSection}>
        <View style={s.filterTitleRow}>
          <MaterialIcons name="near-me" size={14} color={theme.textSecondary} />
          <Text style={s.filterTitle}>{t('directory', 'distanceFilter')}</Text>
          {gpsLoading ? <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: 6 }} /> : null}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filterChips}>
          {DISTANCE_OPTIONS.map(option => {
            const active = distanceFilter === option;
            return (
              <Pressable
                key={option}
                style={[s.filterChip, active && s.filterChipActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setDistanceFilter(option);
                  if (option !== 'all') requestGPS();
                }}
              >
                <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{distanceLabels[option]}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {distanceFilter !== 'all' && gpsDenied ? (
          <Text style={s.filterHint}>{t('directory', 'gpsRequired')}</Text>
        ) : null}
      </View>

      {/* Join Meetup Modal */}
      <Modal visible={showJoinModal} animationType="fade" transparent onRequestClose={() => setShowJoinModal(false)}>
        <Pressable style={s.joinModalOverlay} onPress={() => setShowJoinModal(false)}>
          <Pressable style={s.joinModalContent} onPress={(e) => e.stopPropagation?.()}>
            <View style={s.joinModalHeader}>
              <View style={s.joinCardIconBg}>
                <MaterialIcons name="qr-code-2" size={28} color="#0369A1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.joinCardTitle}>{language === 'fr' ? 'Rejoindre un RDV' : 'Join a Meetup'}</Text>
                <Text style={s.joinCardDesc}>{language === 'fr' ? 'Entrez le code ou scannez le QR' : 'Enter the code or scan the QR'}</Text>
              </View>
              <Pressable style={s.joinModalClose} onPress={() => setShowJoinModal(false)}>
                <MaterialIcons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>
            <View style={s.joinInputRow}>
              <View style={s.joinInputWrap}>
                <MaterialIcons name="tag" size={18} color={joinCode ? '#0369A1' : '#94A3B8'} />
                <TextInput
                  style={s.joinInput}
                  value={joinCode}
                  onChangeText={(text) => { setJoinCode(text.toUpperCase()); if (joinError) setJoinError(''); }}
                  placeholder={language === 'fr' ? 'CODE DU RDV' : 'MEETUP CODE'}
                  placeholderTextColor="#94A3B8"
                  autoCapitalize="characters"
                  maxLength={10}
                  editable={!joining}
                  returnKeyType="go"
                  onSubmitEditing={() => { handleJoinByCode(); setShowJoinModal(false); }}
                  autoFocus
                />
              </View>
              <Pressable
                style={[s.joinSubmitBtn, !joinCode.trim() && s.joinSubmitBtnDisabled]}
                onPress={() => { handleJoinByCode(); setShowJoinModal(false); }}
                disabled={!joinCode.trim() || joining}
              >
                {joining ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="login" size={16} color="#FFF" />
                    <Text style={s.joinSubmitText}>{language === 'fr' ? 'Rejoindre' : 'Join'}</Text>
                  </>
                )}
              </Pressable>
            </View>
            <Pressable style={s.joinScanRow} onPress={() => { setShowJoinModal(false); router.push('/scanner' as any); }}>
              <MaterialIcons name="qr-code-scanner" size={18} color="#0369A1" />
              <Text style={s.joinScanRowText}>{language === 'fr' ? 'Scanner un QR code' : 'Scan a QR code'}</Text>
            </Pressable>
            {joinError ? (
              <View style={s.joinErrorRow}>
                <MaterialIcons name="error-outline" size={13} color="#DC2626" />
                <Text style={s.joinErrorText}>{joinError}</Text>
              </View>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {(meetupsLoading || eventsLoading) ? (
        <TimelineSkeleton items={3} />
      ) : gpsLoading && distanceFilter !== 'all' && !userLocation ? (
        <View style={s.emptyWrap}>
          <View style={s.empty}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={[s.emptyTitle, { marginTop: 12 }]}>
              {language === 'fr' ? 'Localisation en cours...' : 'Getting your location...'}
            </Text>
          </View>
        </View>
      ) : items.length === 0 ? (
        <View style={s.emptyWrap}>
          <View style={s.empty}>
            <View style={s.emptyIcon}><MaterialIcons name="event-available" size={36} color={theme.textMuted} /></View>
            <Text style={s.emptyTitle}>
              {distanceFilter !== 'all' && totalBeforeFilter > 0
                ? (language === 'fr' ? `Aucun evenement dans ${distanceFilter} km` : `No events within ${distanceFilter} km`)
                : (language === 'fr' ? 'Rien de prevu' : 'Nothing planned')}
            </Text>
            <Text style={s.emptyDesc}>
              {distanceFilter !== 'all' && totalBeforeFilter > 0
                ? (language === 'fr' ? 'Essayez une distance plus grande ou reinitialisez le filtre.' : 'Try a larger distance or reset the filter.')
                : (language === 'fr' ? 'Planifie un RDV, un tournoi ou un defi.' : 'Plan a meetup, tournament or challenge.')}
            </Text>
            {distanceFilter !== 'all' && totalBeforeFilter > 0 ? (
              <Pressable style={[s.emptyBtn, { backgroundColor: theme.primary }]} onPress={() => setDistanceFilter('all')}>
                <MaterialIcons name="filter-alt-off" size={16} color="#FFF" />
                <Text style={s.emptyBtnText}>{t('directory', 'distanceAll')}</Text>
              </Pressable>
            ) : (
              <View style={s.emptyActions}>
                <Pressable style={[s.emptyBtn, { backgroundColor: '#0369A1' }]} onPress={() => router.push('/meetup/new' as any)}>
                  <MaterialIcons name="event" size={16} color="#FFF" />
                  <Text style={s.emptyBtnText}>{language === 'fr' ? 'RDV' : 'Meetup'}</Text>
                </Pressable>
                <Pressable style={[s.emptyBtn, { backgroundColor: '#B45309' }]} onPress={() => router.push('/tournament/new' as any)}>
                  <MaterialIcons name="emoji-events" size={16} color="#FFF" />
                  <Text style={s.emptyBtnText}>{language === 'fr' ? 'Tournoi' : 'Tournament'}</Text>
                </Pressable>
                <Pressable style={[s.emptyBtn, { backgroundColor: '#7C3AED' }]} onPress={() => router.push('/sponsored-event/list' as any)}>
                  <MaterialIcons name="campaign" size={16} color="#FFF" />
                  <Text style={s.emptyBtnText}>{language === 'fr' ? 'Defi' : 'Challenge'}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      ) : (
        <>
          {items.length > SCROLL_ITEM_LIMIT ? (
            <ScrollView
              style={[s.scrollList, { maxHeight: SCROLL_MAX_HEIGHT }]}
              contentContainerStyle={s.timeline}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              persistentScrollbar={Platform.OS === 'android'}
            >
              {items.map(renderEventCard)}
            </ScrollView>
          ) : (
            <View style={s.timeline}>
              {items.map(renderEventCard)}
            </View>
          )}

          <View style={s.addRow}>
            <Pressable style={[s.addBtn, { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' }]} onPress={() => router.push('/meetup/new' as any)}>
              <MaterialIcons name="event" size={15} color="#0369A1" />
              <Text style={[s.addBtnText, { color: '#0369A1' }]}>+ {language === 'fr' ? 'RDV' : 'Meetup'}</Text>
            </Pressable>
            <Pressable style={[s.addBtn, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]} onPress={() => router.push('/tournament/new' as any)}>
              <MaterialIcons name="emoji-events" size={15} color="#B45309" />
              <Text style={[s.addBtnText, { color: '#B45309' }]}>+ {language === 'fr' ? 'Tournoi' : 'Tournament'}</Text>
            </Pressable>
            <Pressable style={[s.addBtn, { backgroundColor: '#EDE9FE', borderColor: '#DDD6FE' }]} onPress={() => router.push('/sponsored-event/list' as any)}>
              <MaterialIcons name="campaign" size={15} color="#7C3AED" />
              <Text style={[s.addBtnText, { color: '#7C3AED' }]}>+ {language === 'fr' ? 'Defi' : 'Challenge'}</Text>
            </Pressable>
          </View>

          {items.length > SCROLL_ITEM_LIMIT ? (
            <Text style={s.scrollHint}>
              {language === 'fr'
                ? `${items.length} evenements — faites defiler la liste`
                : `${items.length} events — scroll the list`}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
}

export default memo(UpcomingTimeline, (prev, next) => {
  if (prev.tournaments.length !== next.tournaments.length) return false;
  if (prev.meetups.length !== next.meetups.length) return false;
  if (prev.upcomingEvents.length !== next.upcomingEvents.length) return false;
  if (prev.terrains.length !== next.terrains.length) return false;
  if (prev.meetupsLoading !== next.meetupsLoading) return false;
  if (prev.eventsLoading !== next.eventsLoading) return false;
  if (prev.pendingInviteCount !== next.pendingInviteCount) return false;
  if (prev.language !== next.language) return false;
  if (Math.abs(prev.now - next.now) > 120000) return false;
  if (prev.tournaments.length > 0 && next.tournaments.length > 0 && prev.tournaments[0]?.id !== next.tournaments[0]?.id) return false;
  if (prev.meetups.length > 0 && next.meetups.length > 0 && prev.meetups[0]?.id !== next.meetups[0]?.id) return false;
  if (prev.upcomingEvents.length > 0 && next.upcomingEvents.length > 0 && prev.upcomingEvents[0]?.id !== next.upcomingEvents[0]?.id) return false;
  return true;
});

const s = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtn: { width: 34, height: 34, borderRadius: 11, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', position: 'relative' as const },
  actionBadge: { position: 'absolute' as const, top: -4, right: -4, backgroundColor: theme.error, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3, borderWidth: 2, borderColor: '#F8FAFC' },
  actionBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF' },
  joinHeaderBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, backgroundColor: '#E0F2FE', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#BAE6FD' },
  joinHeaderBtnText: { fontSize: 12, fontWeight: '700' as const, color: '#0369A1' },
  filterSection: { marginBottom: 12 },
  filterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  filterTitle: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  filterChips: { gap: 8, paddingRight: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.borderRadius.full, backgroundColor: theme.backgroundSecondary, borderWidth: 1.5, borderColor: 'transparent' },
  filterChipActive: { borderColor: theme.primary, backgroundColor: theme.primary + '10' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  filterChipTextActive: { color: theme.primary },
  filterHint: { fontSize: 11, color: theme.warning, marginTop: 6 },
  scrollList: { marginBottom: 4 },
  scrollHint: { fontSize: 11, color: theme.textMuted, textAlign: 'center', marginTop: 2, marginBottom: 2 },
  joinModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
  joinModalContent: { backgroundColor: '#FFF', borderRadius: 20, padding: 20, maxWidth: 420, alignSelf: 'center' as const, width: '100%' },
  joinModalHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginBottom: 16 },
  joinModalClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F5F9', alignItems: 'center' as const, justifyContent: 'center' as const },
  joinScanRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, paddingVertical: 12, marginTop: 10, backgroundColor: '#F0F9FF', borderRadius: 12, borderWidth: 1, borderColor: '#BAE6FD' },
  joinScanRowText: { fontSize: 13, fontWeight: '600' as const, color: '#0369A1' },
  timeline: { gap: CARD_GAP },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 12, gap: 12, borderLeftWidth: 4, borderWidth: 1, borderColor: 'transparent', minHeight: CARD_HEIGHT, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 }, android: { elevation: 1 }, default: {} }) },
  dateCol: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dateDay: { fontSize: 18, fontWeight: '900', lineHeight: 20 },
  dateMonth: { fontSize: 8, fontWeight: '700', letterSpacing: 0.3, marginTop: 1 },
  content: { flex: 1, gap: 4 },
  contentTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  soonBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FEF3C7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  soonText: { fontSize: 9, fontWeight: '700', color: '#B45309' },
  title: { fontSize: 14, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontSize: 11, fontWeight: '600' },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8, alignSelf: 'flex-start', marginTop: 2 },
  countdownText: { fontSize: 11, fontWeight: '700' },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  addBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  addBtnText: { fontSize: 11, fontWeight: '700' },
  emptyWrap: { gap: 12 },
  joinCard: { backgroundColor: '#F0F9FF', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#BAE6FD' },
  joinCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  joinCardIconBg: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BAE6FD' },
  joinCardTitle: { fontSize: 13, fontWeight: '700', color: '#0C4A6E' },
  joinCardDesc: { fontSize: 11, color: '#0369A1', marginTop: 1 },
  joinScanBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BAE6FD' },
  joinInputRow: { flexDirection: 'row', gap: 8 },
  joinInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFF', borderRadius: 10, paddingHorizontal: 10, borderWidth: 1, borderColor: '#BAE6FD' },
  joinInput: { flex: 1, fontSize: 13, fontWeight: '700', color: '#0C4A6E', paddingVertical: Platform.select({ ios: 8, android: 6, default: 8 }), letterSpacing: 1.5 },
  joinSubmitBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0369A1', paddingHorizontal: 12, borderRadius: 10, justifyContent: 'center' },
  joinSubmitBtnDisabled: { backgroundColor: '#93C5FD', opacity: 0.6 },
  joinSubmitText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  joinErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, paddingHorizontal: 2 },
  joinErrorText: { fontSize: 11, color: '#DC2626', fontWeight: '500' },
  empty: { backgroundColor: '#FFF', borderRadius: 18, padding: 28, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, marginBottom: 4, textAlign: 'center' },
  emptyDesc: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginBottom: 16, lineHeight: 19 },
  emptyActions: { flexDirection: 'row', gap: 8 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },
  emptyBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
});
