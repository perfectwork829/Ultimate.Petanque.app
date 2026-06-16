import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Share,
  ScrollView,
  Switch,
  Dimensions,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/services/haptics';
import * as Clipboard from 'expo-clipboard';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import theme, { blurhash } from '@/constants/theme';
import { createShareLink, ShareItemType, AssociatedItem } from '@/services/shareService';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useAuth } from '@/template';
import { router } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { config } from '@/constants/config';
import { getEloRank, ELO_RANKS } from '@/services/eloService';
import { fetchAmbassadors, Ambassador } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import { fetchPlayerGeoRank, PlayerGeoRank } from '@/services/geoLeaderboardService';
import { getCountryFlag, getContinentFlag } from '@/constants/geoData';

const TYPE_CONFIG: Record<ShareItemType, { labelKey: string; icon: string; color: string; gradient: [string, string, string] }> = {
  player: { labelKey: 'playerLabelUpper', icon: 'person', color: '#2563EB', gradient: ['#1D4ED8', '#2563EB', '#3B82F6'] },
  club: { labelKey: 'clubLabelUpper', icon: 'home', color: '#D97706', gradient: ['#B45309', '#D97706', '#F59E0B'] },
  terrain: { labelKey: 'terrainLabelUpper', icon: 'landscape', color: '#059669', gradient: ['#047857', '#059669', '#10B981'] },
  tournament: { labelKey: 'tournamentLabelUpper', icon: 'emoji-events', color: '#CA8A04', gradient: ['#A16207', '#CA8A04', '#EAB308'] },
  match: { labelKey: 'matchLabelUpper', icon: 'sports', color: '#2563EB', gradient: ['#1E40AF', '#2563EB', '#60A5FA'] },
  challenge: { labelKey: 'challengeLabelUpper', icon: 'flag', color: '#EA580C', gradient: ['#C2410C', '#EA580C', '#F97316'] },
};

const TYPE_LOWER_KEY: Record<ShareItemType, string> = {
  player: 'playerLabel', club: 'clubLabel', terrain: 'terrainLabel',
  tournament: 'tournamentLabel', match: 'matchLabel', challenge: 'challengeLabel',
};

type ExpirationOption = 'never' | '1day' | '1week' | '1month';
type ShareStep = 'options' | 'expiration' | 'associated' | 'result';

const EXPIRATION_OPTIONS: { key: ExpirationOption; labelKey: string; icon: string }[] = [
  { key: 'never', labelKey: 'expirationNever', icon: 'all-inclusive' },
  { key: '1day', labelKey: 'expiration1Day', icon: 'schedule' },
  { key: '1week', labelKey: 'expiration1Week', icon: 'date-range' },
  { key: '1month', labelKey: 'expiration1Month', icon: 'calendar-today' },
];

function computeExpiresAt(opt: ExpirationOption): string | null {
  if (opt === 'never') return null;
  const d = new Date();
  if (opt === '1day') d.setDate(d.getDate() + 1);
  else if (opt === '1week') d.setDate(d.getDate() + 7);
  else if (opt === '1month') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  itemType: ShareItemType;
  itemId: string;
  itemName: string;
  forceReadOnly?: boolean;
}

export default function ShareModal({ visible, onClose, itemType, itemId, itemName, forceReadOnly = false }: ShareModalProps) {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { challenges, selfPlayer, players } = useAppData();
  const { getPlayerById, getClubById, getTerrainById, getTournamentById, getMatchById, updatePlayer, updateClub } = useAppActions();
  const { user } = useAuth();
  const fr = language === 'fr';

  const [step, setStep] = useState<ShareStep>('options');
  const [isGenerating, setIsGenerating] = useState(false);
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiration, setExpiration] = useState<ExpirationOption>('never');
  const [expiresAtDate, setExpiresAtDate] = useState<Date | null>(null);
  const [countdownNow, setCountdownNow] = useState(Date.now());

  // Associated items (player sharing)
  const [associatedClub, setAssociatedClub] = useState<{ id: string; name: string } | null>(null);
  const [associatedTerrain, setAssociatedTerrain] = useState<{ id: string; name: string } | null>(null);
  const [includeClub, setIncludeClub] = useState(true);
  const [includeTerrain, setIncludeTerrain] = useState(true);
  const [sharedAssociatedItems, setSharedAssociatedItems] = useState<AssociatedItem[]>([]);

  // Pending share action after code generation
  const [pendingAction, setPendingAction] = useState<'native' | 'code' | 'invitation' | 'qr' | null>(null);

  // Contact visibility (managed internally for player/club)
  const [contactVisible, setContactVisible] = useState(false);
  const hasContact = useMemo(() => {
    if (itemType === 'player') {
      const p = getPlayerById(itemId);
      return !!(p?.phone || p?.email);
    }
    if (itemType === 'club') {
      const c = getClubById(itemId);
      return !!(c?.contactEmail || c?.contactPhone);
    }
    return false;
  }, [itemType, itemId, getPlayerById, getClubById]);
  const showContactToggle = (itemType === 'player' || itemType === 'club') && hasContact;
  // Only show toggle if user owns the item
  const isOwnItem = useMemo(() => {
    if (itemType === 'player') {
      return selfPlayer?.id === itemId;
    }
    if (itemType === 'club') {
      const c = getClubById(itemId);
      return !!(c && user?.id && c.userId === user.id);
    }
    return false;
  }, [itemType, itemId, getClubById, selfPlayer, user]);

  const scrollRef = useRef<ScrollView>(null);

  // Gold sponsor branding
  const [goldSponsor, setGoldSponsor] = useState<Ambassador | null>(null);
  // Geo rank for player shares
  const [playerGeoRank, setPlayerGeoRank] = useState<PlayerGeoRank | null>(null);
  useEffect(() => {
    fetchAmbassadors().then(({ ambassadors }) => {
      const gold = ambassadors.find(a => a.badgeType === 'gold_sponsor');
      if (gold) setGoldSponsor(gold);
    });
  }, []);
  useEffect(() => {
    if (itemType === 'player' && visible && itemId) {
      fetchPlayerGeoRank(itemId).then(({ geoRank }) => setPlayerGeoRank(geoRank)).catch(() => {});
    } else {
      setPlayerGeoRank(null);
    }
  }, [itemType, itemId, visible]);

  const typeConfig = TYPE_CONFIG[itemType];
  const typeLabelLower = t('shareModal', TYPE_LOWER_KEY[itemType]);

  // Countdown timer
  React.useEffect(() => {
    if (!expiresAtDate) return;
    const interval = setInterval(() => setCountdownNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, [expiresAtDate]);

  const expirationCountdown = useMemo(() => {
    if (!expiresAtDate) return null;
    const diff = expiresAtDate.getTime() - countdownNow;
    if (diff <= 0) return { expired: true, days: 0, hours: 0, minutes: 0 };
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return { expired: false, days, hours, minutes };
  }, [expiresAtDate, countdownNow]);

  // Build preview subtitle (short form for messages)
  const previewSubtitle = useMemo(() => {
    if (itemType === 'player') {
      const p = getPlayerById(itemId);
      if (!p) return '';
      const parts = [p.role, p.club, p.country].filter(Boolean);
      if (p.experience) {
        const expLabel = p.experience === 'less_than_1' ? (fr ? '< 1 an' : '< 1 year') : p.experience === '1_to_3' ? (fr ? '1-3 ans' : '1-3 yrs') : p.experience === '3_to_10' ? (fr ? '3-10 ans' : '3-10 yrs') : (fr ? '10+ ans' : '10+ yrs');
        parts.push(expLabel);
      }
      if (p.eloRating) {
        const rank = getEloRank(p.eloRating);
        parts.push(`ELO ${p.eloRating} (${rank.label[fr ? 'fr' : 'en']})`);
      }
      return parts.join(' • ');
    }
    if (itemType === 'club') {
      const c = getClubById(itemId);
      return c ? [c.city, c.country, c.membersCount ? `${c.membersCount} ${fr ? 'membres' : 'members'}` : ''].filter(Boolean).join(' • ') : '';
    }
    if (itemType === 'terrain') {
      const tr = getTerrainById(itemId);
      return tr ? [tr.type, tr.city, tr.clubName].filter(Boolean).join(' • ') : '';
    }
    if (itemType === 'tournament') {
      const to = getTournamentById(itemId);
      if (!to) return '';
      const dateStr = to.date ? new Date(to.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' }) : '';
      return [to.format, to.location?.city, dateStr].filter(Boolean).join(' • ');
    }
    if (itemType === 'match') {
      const m = getMatchById(itemId) as any;
      if (!m) return '';
      const scoreA = m.teamA?.score ?? 0;
      const scoreB = m.teamB?.score ?? 0;
      const dateStr = m.date ? new Date(m.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' }) : '';
      return [`${scoreA}-${scoreB}`, m.format, dateStr].filter(Boolean).join(' • ');
    }
    if (itemType === 'challenge') {
      const ch = challenges.find((c: any) => c.id === itemId) as any;
      if (!ch) return '';
      const typeName = ch.type === '10_tirs' ? '10 Tirs' : ch.type === '10_tirs_sautee' ? '10 Tirs sautee' : 'Precision';
      return [typeName, ch.mode === 'duel' ? 'Duel' : 'Solo'].filter(Boolean).join(' • ');
    }
    return '';
  }, [itemType, itemId, fr, getPlayerById, getClubById, getTerrainById, getTournamentById, getMatchById, challenges]);

  // Rich preview data for detailed card
  const previewDetails = useMemo(() => {
    if (itemType === 'player') {
      const p = getPlayerById(itemId);
      if (!p) return null;
      const clubEntity = p.clubId ? getClubById(p.clubId) : null;
      const terrainEntity = p.terrainId ? getTerrainById(p.terrainId) : null;
      return {
        type: 'player' as const,
        avatar: p.avatar || null,
        initials: p.name?.split(' ').map((n: string) => n[0]).join('') || '?',
        role: p.role,
        experience: p.experience || null,
        eloRating: p.eloRating || null,
        nickname: p.nickname,
        club: clubEntity?.name || p.club || null,
        terrain: terrainEntity?.name || p.terrainName || null,
        city: p.location?.city || null,
        country: p.country || null,
        handedness: p.handedness || null,
        stats: { matches: p.stats?.matchesPlayed || 0, wins: p.stats?.wins || 0, winRate: p.stats?.winRate || 0, losses: p.stats?.losses || 0 },
        hasContact: !!(p.phone || p.email),
        phone: p.phone || null,
        email: p.email || null,
      };
    }
    if (itemType === 'club') {
      const c = getClubById(itemId);
      if (!c) return null;
      return {
        type: 'club' as const,
        logo: c.logo || null,
        city: c.city || null,
        country: c.country || null,
        address: c.address || null,
        membersCount: c.membersCount || 0,
        foundedYear: c.foundedYear || null,
        facilities: c.facilities || [],
        hasContact: !!(c.contactEmail || c.contactPhone),
        showContactPublic: (c as any).showContactPublic ?? false,
        description: c.description || null,
        membershipCost: c.membershipCost || null,
        website: c.website || null,
        contactEmail: c.contactEmail || null,
        contactPhone: c.contactPhone || null,
      };
    }
    if (itemType === 'terrain') {
      const tr = getTerrainById(itemId);
      if (!tr) return null;
      return {
        type: 'terrain' as const,
        terrainType: tr.type || null,
        city: tr.city || null,
        address: tr.address || null,
        clubName: tr.clubName || null,
        courtsCount: tr.courtsCount || 1,
        lighting: tr.lighting || false,
        covered: tr.covered || false,
        environment: (tr as any).environment || null,
        publicAccess: (tr as any).publicAccess !== false,
        photos: tr.photos || [],
      };
    }
    if (itemType === 'tournament') {
      const to = getTournamentById(itemId);
      if (!to) return null;
      return {
        type: 'tournament' as const,
        date: to.date,
        endDate: to.endDate || null,
        format: to.format,
        tournamentType: to.type,
        city: to.location?.city || null,
        clubName: to.clubName || null,
        status: to.status,
        participants: to.participants || 0,
        maxParticipants: to.maxParticipants || 0,
        prize: to.prize || null,
        description: to.description || null,
        terrainName: to.terrainName || null,
      };
    }
    if (itemType === 'match') {
      const m = getMatchById(itemId) as any;
      if (!m) return null;
      return {
        type: 'match' as const,
        teamANames: m.teamA?.playerNames || [],
        teamBNames: m.teamB?.playerNames || [],
        scoreA: m.teamA?.score ?? 0,
        scoreB: m.teamB?.score ?? 0,
        winner: m.winner,
        format: m.format,
        mode: m.mode,
        date: m.date,
        duration: m.duration || 0,
        terrainType: m.terrainType || null,
      };
    }
    if (itemType === 'challenge') {
      const ch = challenges.find((c: any) => c.id === itemId) as any;
      if (!ch) return null;
      return {
        type: 'challenge' as const,
        challengeType: ch.type,
        mode: ch.mode || 'solo',
        successCount: ch.successCount ?? ch.success_count ?? 0,
        totalShots: ch.totalShots ?? ch.total_shots ?? 0,
        successRate: ch.successRate ?? ch.success_rate ?? 0,
        carreauCount: ch.carreauCount ?? ch.carreau_count ?? 0,
        totalPoints: ch.totalPoints ?? ch.total_points ?? 0,
        maxPoints: ch.maxPoints ?? ch.max_points ?? 0,
        date: ch.date,
      };
    }
    return null;
  }, [itemType, itemId, getPlayerById, getClubById, getTerrainById, getTournamentById, getMatchById, challenges]);

  // Build share invitation message
  const buildShareMessage = useCallback(() => {
    let msg = fr
      ? `Je partage avec toi ma fiche ${typeLabelLower} "${itemName}" sur Ultimate Petanque !`
      : `I am sharing my ${typeLabelLower} "${itemName}" on Ultimate Petanque!`;
    if (shareCode) msg += `\n${fr ? 'Code' : 'Code'}: ${shareCode}`;
    if (previewSubtitle) msg += `\n${previewSubtitle}`;
    // Add experience and ELO for player shares
    if (itemType === 'player' && previewDetails && previewDetails.type === 'player') {
      const pd = previewDetails as any;
      if (pd.experience) {
        const expLabel = pd.experience === 'less_than_1' ? (fr ? '< 1 an' : '< 1 year') : pd.experience === '1_to_3' ? (fr ? '1-3 ans' : '1-3 years') : pd.experience === '3_to_10' ? (fr ? '3-10 ans' : '3-10 years') : (fr ? '10+ ans' : '10+ years');
        msg += `\n${fr ? 'Experience' : 'Experience'}: ${expLabel}`;
      }
      if (pd.eloRating) {
        const rank = getEloRank(pd.eloRating);
        msg += `\nELO: ${pd.eloRating} (${rank.label[fr ? 'fr' : 'en']})`;
      }
    }
    if (sharedAssociatedItems.length > 0) {
      sharedAssociatedItems.forEach(ai => {
        const name = ai.type === 'club' ? associatedClub?.name : associatedTerrain?.name;
        if (name) msg += `\n+ ${ai.type === 'club' ? 'Club' : 'Terrain'}: ${name}`;
      });
    }
    msg += `\n\n${fr ? 'Telecharge l\'app' : 'Download the app'}: ${config.appDownloadUrl}`;
    return msg;
  }, [fr, typeLabelLower, itemName, shareCode, previewSubtitle, sharedAssociatedItems, associatedClub, associatedTerrain]);

  // Reset on open
  React.useEffect(() => {
    if (visible) {
      setStep('options');
      setShareCode(null);
      setError(null);
      setCopied(false);
      setIsGenerating(false);
      setExpiration('never');
      setExpiresAtDate(null);
      setAssociatedClub(null);
      setAssociatedTerrain(null);
      setIncludeClub(true);
      setIncludeTerrain(true);
      setSharedAssociatedItems([]);
      setPendingAction(null);
      // Init contact visibility from item data
      if (itemType === 'player') {
        const p = getPlayerById(itemId);
        setContactVisible(p?.showContactPublic === true);
      } else if (itemType === 'club') {
        const c = getClubById(itemId);
        setContactVisible((c as any)?.showContactPublic === true);
      }
    }
  }, [visible, itemId, itemType]);

  // Detect associated items for player
  const detectAssociatedItems = useCallback(() => {
    if (itemType !== 'player') return { club: null, terrain: null };
    const player = getPlayerById(itemId);
    if (!player) return { club: null, terrain: null };
    let club: { id: string; name: string } | null = null;
    let terrain: { id: string; name: string } | null = null;
    if (player.clubId) { const c = getClubById(player.clubId); if (c) club = { id: c.id, name: c.name }; }
    if (player.terrainId) { const tr = getTerrainById(player.terrainId); if (tr) terrain = { id: tr.id, name: tr.name }; }
    return { club, terrain };
  }, [itemType, itemId, getPlayerById, getClubById, getTerrainById]);

  // Core generate function
  const doGenerateShareCode = useCallback(async (associatedItems: AssociatedItem[], expiresAtISO?: string | null) => {
    setIsGenerating(true);
    setError(null);
    try {
      const result = await createShareLink(itemType, itemId, 'read', associatedItems.length > 0 ? associatedItems : undefined, expiresAtISO);
      if (result.error) { setError(result.error); setIsGenerating(false); return; }
      setShareCode(result.shareCode);
      setSharedAssociatedItems(associatedItems);
      if (expiresAtISO) setExpiresAtDate(new Date(expiresAtISO));
      else setExpiresAtDate(null);
      setStep('result');
      scrollToTop();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      setError(e?.message || t('shareModal', 'errorCreating'));
    } finally {
      setIsGenerating(false);
    }
  }, [itemType, itemId, t]);

  // Scroll to top helper
  const scrollToTop = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 50);
  }, []);

  // Initiate share flow: check for associated items, then generate
  const initiateGenerate = useCallback(async (action: 'native' | 'code' | 'invitation' | 'qr') => {
    setPendingAction(action);
    // For player, check associated items
    if (itemType === 'player') {
      const { club, terrain } = detectAssociatedItems();
      if (club || terrain) {
        setAssociatedClub(club);
        setAssociatedTerrain(terrain);
        setIncludeClub(!!club);
        setIncludeTerrain(!!terrain);
        setStep('associated');
        scrollToTop();
        return;
      }
    }
    // Show expiration step
    setStep('expiration');
    scrollToTop();
  }, [itemType, detectAssociatedItems, scrollToTop]);

  const handleConfirmAssociated = useCallback(() => {
    setStep('expiration');
    scrollToTop();
  }, [scrollToTop]);

  const handleSkipAssociated = useCallback(() => {
    setIncludeClub(false);
    setIncludeTerrain(false);
    setStep('expiration');
    scrollToTop();
  }, [scrollToTop]);

  const handleConfirmExpiration = useCallback(async () => {
    const items: AssociatedItem[] = [];
    if (includeClub && associatedClub) items.push({ type: 'club', id: associatedClub.id });
    if (includeTerrain && associatedTerrain) items.push({ type: 'terrain', id: associatedTerrain.id });
    await doGenerateShareCode(items, computeExpiresAt(expiration));
  }, [includeClub, includeTerrain, associatedClub, associatedTerrain, expiration, doGenerateShareCode]);

  // Execute the pending share action after code is generated
  React.useEffect(() => {
    if (step === 'result' && shareCode && pendingAction) {
      const timer = setTimeout(() => {
        if (pendingAction === 'native') handleNativeShare();
        else if (pendingAction === 'code') handleCopyCode();
        else if (pendingAction === 'invitation') handleCopyInvitation();
        // qr: just show the result with QR
        setPendingAction(null);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [step, shareCode, pendingAction]);

  const handleCopyCode = useCallback(async () => {
    if (!shareCode) return;
    await Clipboard.setStringAsync(shareCode);
    setCopied(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => setCopied(false), 2000);
  }, [shareCode]);

  const handleNativeShare = useCallback(async () => {
    if (!shareCode) return;
    try { await Share.share({ message: buildShareMessage(), title: `${fr ? 'Partage' : 'Share'} - ${itemName}` }); } catch {}
  }, [shareCode, buildShareMessage, fr, itemName]);

  const handleCopyInvitation = useCallback(async () => {
    if (!shareCode) return;
    await Clipboard.setStringAsync(buildShareMessage());
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [shareCode, buildShareMessage]);

  const handleClose = useCallback(() => {
    setShareCode(null);
    setError(null);
    setCopied(false);
    setSharedAssociatedItems([]);
    setExpiresAtDate(null);
    setPendingAction(null);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={s.safeArea}>
        {/* Header */}
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={handleClose}>
            <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
          </Pressable>
          <Text style={s.headerTitle}>{t('shareModal', 'shareTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView ref={scrollRef} style={s.scrollView} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* ===== PREVIEW CARD (always visible) ===== */}
            <LinearGradient colors={typeConfig.gradient} style={s.previewGradient}>
              <View style={s.previewHeaderRow}>
                <View style={s.previewTypeBadge}>
                  <MaterialIcons name={typeConfig.icon as any} size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={s.previewTypeText}>{t('shareModal', TYPE_LOWER_KEY[itemType])}</Text>
                </View>
                {shareCode ? (
                  <View style={s.previewCodeBadge}>
                    <Text style={s.previewCodeText}>{shareCode}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.previewTitle}>{itemName}</Text>
            </LinearGradient>

            {/* ===== DETAILED PREVIEW (rich item info) ===== */}
            {previewDetails ? (
              <View style={s.detailCard}>
                {/* PLAYER */}
                {previewDetails.type === 'player' ? (() => {
                  const d = previewDetails as any;
                  return (
                    <View>
                      <View style={s.detailIdentity}>
                        <View style={[s.detailAvatar, { backgroundColor: typeConfig.color }]}>
                          {d.avatar ? <Image source={{ uri: d.avatar }} style={s.detailAvatarImg} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} /> : <Text style={s.detailAvatarText}>{d.initials}</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          {d.nickname ? <Text style={s.detailNickname}>"{d.nickname}"</Text> : null}
                          <View style={s.detailPillsRow}>
                            <View style={[s.detailPill, { backgroundColor: typeConfig.color + '12' }]}><MaterialIcons name="sports" size={11} color={typeConfig.color} /><Text style={[s.detailPillText, { color: typeConfig.color }]}>{d.role}</Text></View>
                            {d.handedness ? <View style={[s.detailPill, { backgroundColor: '#6366F112' }]}><MaterialIcons name={d.handedness === 'left' ? 'front-hand' : 'back-hand'} size={11} color="#6366F1" /><Text style={[s.detailPillText, { color: '#6366F1' }]}>{d.handedness === 'right' ? (fr ? 'Droitier' : 'Right') : d.handedness === 'left' ? (fr ? 'Gaucher' : 'Left') : (fr ? 'Ambidextre' : 'Ambidextrous')}</Text></View> : null}
                            {d.experience ? <View style={[s.detailPill, { backgroundColor: '#9333EA12' }]}><MaterialIcons name="timeline" size={11} color="#9333EA" /><Text style={[s.detailPillText, { color: '#9333EA' }]}>{d.experience === 'less_than_1' ? (fr ? '< 1 an' : '< 1 year') : d.experience === '1_to_3' ? (fr ? '1-3 ans' : '1-3 years') : d.experience === '3_to_10' ? (fr ? '3-10 ans' : '3-10 years') : (fr ? '10+ ans' : '10+ years')}</Text></View> : null}
                            {d.eloRating ? (() => { const eloR = getEloRank(d.eloRating); return <View style={[s.detailPill, { backgroundColor: eloR.color + '12' }]}><MaterialIcons name={eloR.icon as any} size={11} color={eloR.color} /><Text style={[s.detailPillText, { color: eloR.color }]}>{d.eloRating} {eloR.label[fr ? 'fr' : 'en']}</Text></View>; })() : null}
                          </View>
                        </View>
                      </View>
                      {(d.club || d.terrain) ? (
                        <View style={s.detailInfoRow}>
                          {d.club ? <View style={s.detailInfoPill}><MaterialIcons name="location-city" size={12} color="#D97706" /><Text style={[s.detailInfoPillText, { color: '#D97706' }]}>{d.club}</Text></View> : null}
                          {d.terrain ? <View style={s.detailInfoPill}><MaterialIcons name="sports-soccer" size={12} color="#10B981" /><Text style={[s.detailInfoPillText, { color: '#10B981' }]}>{d.terrain}</Text></View> : null}
                        </View>
                      ) : null}
                      {(d.city || d.country) ? <View style={s.detailLocationRow}><MaterialIcons name="place" size={12} color="#94A3B8" /><Text style={s.detailLocationText}>{[d.city, d.country].filter(Boolean).join(', ')}</Text></View> : null}
                      {/* Geo rank badges */}
                      {playerGeoRank && (playerGeoRank.city || playerGeoRank.country || playerGeoRank.continent) ? (
                        <View style={s.geoRankShareRow}>
                          <MaterialIcons name="public" size={11} color="#3B82F6" />
                          {playerGeoRank.continent ? (
                            <View style={s.geoRankSharePill}>
                              <Text style={{ fontSize: 10 }}>{getContinentFlag(playerGeoRank.continent.name)}</Text>
                              <Text style={[s.geoRankShareNum, { color: playerGeoRank.continent.rank <= 3 ? '#F59E0B' : '#64748B' }]}>#{playerGeoRank.continent.rank}</Text>
                            </View>
                          ) : null}
                          {playerGeoRank.country ? (
                            <View style={s.geoRankSharePill}>
                              <Text style={{ fontSize: 10 }}>{getCountryFlag(playerGeoRank.country.name)}</Text>
                              <Text style={[s.geoRankShareNum, { color: playerGeoRank.country.rank <= 3 ? '#F59E0B' : '#10B981' }]}>#{playerGeoRank.country.rank}</Text>
                            </View>
                          ) : null}
                          {playerGeoRank.city ? (
                            <View style={s.geoRankSharePill}>
                              <MaterialIcons name="location-city" size={10} color="#3B82F6" />
                              <Text style={[s.geoRankShareNum, { color: playerGeoRank.city.rank <= 3 ? '#F59E0B' : '#3B82F6' }]}>#{playerGeoRank.city.rank}</Text>
                            </View>
                          ) : null}
                        </View>
                      ) : null}
                      <View style={s.detailStatsBar}>
                        <View style={s.detailStatItem}><Text style={s.detailStatValue}>{d.stats.matches}</Text><Text style={s.detailStatLabel}>{fr ? 'Matchs' : 'Matches'}</Text></View>
                        <View style={s.detailStatDivider} />
                        <View style={s.detailStatItem}><Text style={[s.detailStatValue, { color: '#10B981' }]}>{d.stats.wins}</Text><Text style={s.detailStatLabel}>{fr ? 'Victoires' : 'Wins'}</Text></View>
                        <View style={s.detailStatDivider} />
                        <View style={s.detailStatItem}><Text style={[s.detailStatValue, { color: typeConfig.color }]}>{d.stats.winRate}%</Text><Text style={s.detailStatLabel}>{fr ? 'Victoires' : 'Win rate'}</Text></View>
                      </View>
                      {d.hasContact ? (
                        <View style={s.contactPreviewBlock}>
                          <View style={s.contactPreviewHeader}>
                            <MaterialIcons name={contactVisible ? 'contact-phone' : 'phone-disabled'} size={12} color={contactVisible ? '#10B981' : '#94A3B8'} />
                            <Text style={[s.contactPreviewHeaderText, { color: contactVisible ? '#10B981' : '#94A3B8' }]}>{contactVisible ? (fr ? 'Contacts visibles' : 'Contacts visible') : (fr ? 'Contacts masques' : 'Contacts hidden')}</Text>
                          </View>
                          {contactVisible ? (
                            <View style={s.contactPreviewItems}>
                              {d.email ? <View style={s.contactPreviewItem}><MaterialIcons name="email" size={11} color="#3B82F6" /><Text style={s.contactPreviewItemText}>{d.email}</Text></View> : null}
                              {d.phone ? <View style={s.contactPreviewItem}><MaterialIcons name="phone" size={11} color="#10B981" /><Text style={s.contactPreviewItemText}>{d.phone}</Text></View> : null}
                            </View>
                          ) : (
                            <View style={s.contactPreviewItems}>
                              {d.email ? <View style={s.contactPreviewItem}><MaterialIcons name="email" size={11} color="#CBD5E1" /><Text style={s.contactPreviewItemMasked}>{"•".repeat(Math.min(d.email.indexOf("@"), 6)) + d.email.slice(d.email.indexOf("@"))}</Text></View> : null}
                              {d.phone ? <View style={s.contactPreviewItem}><MaterialIcons name="phone" size={11} color="#CBD5E1" /><Text style={s.contactPreviewItemMasked}>{d.phone.slice(0, 3) + "•".repeat(Math.max(0, d.phone.length - 5)) + d.phone.slice(-2)}</Text></View> : null}
                            </View>
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })() : null}

                {/* CLUB */}
                {previewDetails.type === 'club' ? (() => {
                  const d = previewDetails as any;
                  return (
                    <View>
                      <View style={s.detailIdentity}>
                        <View style={[s.detailAvatar, { backgroundColor: '#D97706' }]}>
                          {d.logo ? <Image source={{ uri: d.logo }} style={s.detailAvatarImg} contentFit="cover" transition={200} /> : <MaterialIcons name="home" size={24} color="#FFF" />}
                        </View>
                        <View style={{ flex: 1 }}>
                          {d.address ? <View style={s.detailLocationRow}><MaterialIcons name="place" size={12} color="#94A3B8" /><Text style={s.detailLocationText}>{d.address}, {d.city}</Text></View> : d.city ? <View style={s.detailLocationRow}><MaterialIcons name="place" size={12} color="#94A3B8" /><Text style={s.detailLocationText}>{[d.city, d.country].filter(Boolean).join(', ')}</Text></View> : null}
                          {d.description ? <Text style={s.detailDescText} numberOfLines={2}>{d.description}</Text> : null}
                        </View>
                      </View>
                      <View style={s.detailStatsBar}>
                        <View style={s.detailStatItem}><Text style={s.detailStatValue}>{d.membersCount}</Text><Text style={s.detailStatLabel}>{fr ? 'Membres' : 'Members'}</Text></View>
                        <View style={s.detailStatDivider} />
                        <View style={s.detailStatItem}><Text style={s.detailStatValue}>{d.foundedYear || '-'}</Text><Text style={s.detailStatLabel}>{fr ? 'Fonde' : 'Founded'}</Text></View>
                        <View style={s.detailStatDivider} />
                        <View style={s.detailStatItem}><Text style={s.detailStatValue}>{d.membershipCost ? `${d.membershipCost}\u20AC` : '-'}</Text><Text style={s.detailStatLabel}>{fr ? 'Cotisation' : 'Fee'}</Text></View>
                      </View>
                      {d.facilities.length > 0 ? <View style={s.detailInfoRow}>{d.facilities.slice(0, 4).map((f: string, i: number) => <View key={i} style={s.detailInfoPill}><MaterialIcons name="check-circle" size={10} color="#10B981" /><Text style={[s.detailInfoPillText, { color: '#10B981' }]}>{f}</Text></View>)}</View> : null}
                      {d.website ? <View style={s.detailLocationRow}><MaterialIcons name="language" size={12} color={typeConfig.color} /><Text style={[s.detailLocationText, { color: typeConfig.color }]}>{d.website}</Text></View> : null}
                      {d.hasContact ? (
                        <View style={s.contactPreviewBlock}>
                          <View style={s.contactPreviewHeader}>
                            <MaterialIcons name={contactVisible ? 'contact-phone' : 'phone-disabled'} size={12} color={contactVisible ? '#10B981' : '#94A3B8'} />
                            <Text style={[s.contactPreviewHeaderText, { color: contactVisible ? '#10B981' : '#94A3B8' }]}>{contactVisible ? (fr ? 'Contacts visibles' : 'Contacts visible') : (fr ? 'Contacts masques' : 'Contacts hidden')}</Text>
                          </View>
                          {contactVisible ? (
                            <View style={s.contactPreviewItems}>
                              {d.contactEmail ? <View style={s.contactPreviewItem}><MaterialIcons name="email" size={11} color="#3B82F6" /><Text style={s.contactPreviewItemText}>{d.contactEmail}</Text></View> : null}
                              {d.contactPhone ? <View style={s.contactPreviewItem}><MaterialIcons name="phone" size={11} color="#10B981" /><Text style={s.contactPreviewItemText}>{d.contactPhone}</Text></View> : null}
                            </View>
                          ) : (
                            <View style={s.contactPreviewItems}>
                              {d.contactEmail ? <View style={s.contactPreviewItem}><MaterialIcons name="email" size={11} color="#CBD5E1" /><Text style={s.contactPreviewItemMasked}>{"•".repeat(Math.min(d.contactEmail.indexOf("@"), 6)) + d.contactEmail.slice(d.contactEmail.indexOf("@"))}</Text></View> : null}
                              {d.contactPhone ? <View style={s.contactPreviewItem}><MaterialIcons name="phone" size={11} color="#CBD5E1" /><Text style={s.contactPreviewItemMasked}>{d.contactPhone.slice(0, 3) + "•".repeat(Math.max(0, d.contactPhone.length - 5)) + d.contactPhone.slice(-2)}</Text></View> : null}
                            </View>
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })() : null}

                {/* TERRAIN */}
                {previewDetails.type === 'terrain' ? (() => {
                  const d = previewDetails as any;
                  return (
                    <View>
                      {(d.address || d.city) ? <View style={s.detailLocationRow}><MaterialIcons name="place" size={12} color="#94A3B8" /><Text style={s.detailLocationText}>{d.address ? `${d.address}, ${d.city}` : d.city}</Text></View> : null}
                      <View style={s.detailPillsRow}>
                        {d.terrainType ? <View style={[s.detailPill, { backgroundColor: '#10B98112' }]}><MaterialIcons name="landscape" size={11} color="#10B981" /><Text style={[s.detailPillText, { color: '#10B981' }]}>{d.terrainType}</Text></View> : null}
                        {d.environment ? <View style={[s.detailPill, { backgroundColor: '#3B82F612' }]}><MaterialIcons name={d.environment === 'indoor' ? 'home' : 'wb-sunny'} size={11} color="#3B82F6" /><Text style={[s.detailPillText, { color: '#3B82F6' }]}>{d.environment === 'indoor' ? (fr ? 'Interieur' : 'Indoor') : (fr ? 'Exterieur' : 'Outdoor')}</Text></View> : null}
                        {d.publicAccess ? <View style={[s.detailPill, { backgroundColor: '#22C55E12' }]}><MaterialIcons name="lock-open" size={11} color="#22C55E" /><Text style={[s.detailPillText, { color: '#22C55E' }]}>{fr ? 'Acces libre' : 'Public'}</Text></View> : null}
                      </View>
                      <View style={s.detailStatsBar}>
                        <View style={s.detailStatItem}><Text style={s.detailStatValue}>{d.courtsCount}</Text><Text style={s.detailStatLabel}>{fr ? 'Pistes' : 'Courts'}</Text></View>
                        <View style={s.detailStatDivider} />
                        <View style={s.detailStatItem}><MaterialIcons name={d.lighting ? 'lightbulb' : 'lightbulb-outline'} size={18} color={d.lighting ? '#F59E0B' : '#CBD5E1'} /><Text style={s.detailStatLabel}>{fr ? 'Eclairage' : 'Lighting'}</Text></View>
                        <View style={s.detailStatDivider} />
                        <View style={s.detailStatItem}><MaterialIcons name={d.covered ? 'roofing' : 'wb-sunny'} size={18} color={d.covered ? '#3B82F6' : '#CBD5E1'} /><Text style={s.detailStatLabel}>{fr ? 'Couvert' : 'Covered'}</Text></View>
                      </View>
                      {d.clubName ? <View style={s.detailInfoRow}><View style={s.detailInfoPill}><MaterialIcons name="location-city" size={12} color="#D97706" /><Text style={[s.detailInfoPillText, { color: '#D97706' }]}>{d.clubName}</Text></View></View> : null}
                    </View>
                  );
                })() : null}

                {/* TOURNAMENT */}
                {previewDetails.type === 'tournament' ? (() => {
                  const d = previewDetails as any;
                  const tDate = d.date ? new Date(d.date) : null;
                  const statusColor = d.status === 'A venir' || d.status === 'À venir' ? '#2563EB' : d.status === 'En cours' ? '#10B981' : '#94A3B8';
                  return (
                    <View>
                      {tDate ? <View style={s.detailLocationRow}><MaterialIcons name="event" size={12} color="#94A3B8" /><Text style={s.detailLocationText}>{tDate.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{d.endDate ? ` - ${new Date(d.endDate).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long' })}` : ''}</Text></View> : null}
                      <View style={s.detailPillsRow}>
                        <View style={[s.detailPill, { backgroundColor: '#EAB30812' }]}><MaterialIcons name="emoji-events" size={11} color="#CA8A04" /><Text style={[s.detailPillText, { color: '#CA8A04' }]}>{d.format}</Text></View>
                        <View style={[s.detailPill, { backgroundColor: '#6366F112' }]}><MaterialIcons name="category" size={11} color="#6366F1" /><Text style={[s.detailPillText, { color: '#6366F1' }]}>{d.tournamentType}</Text></View>
                        <View style={[s.detailPill, { backgroundColor: statusColor + '12' }]}><View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: statusColor }} /><Text style={[s.detailPillText, { color: statusColor }]}>{d.status}</Text></View>
                      </View>
                      {d.city ? <View style={s.detailLocationRow}><MaterialIcons name="place" size={12} color="#94A3B8" /><Text style={s.detailLocationText}>{d.city}{d.terrainName ? ` • ${d.terrainName}` : ''}{d.clubName ? ` • ${d.clubName}` : ''}</Text></View> : null}
                      <View style={s.detailStatsBar}>
                        <View style={s.detailStatItem}><Text style={s.detailStatValue}>{d.participants}/{d.maxParticipants}</Text><Text style={s.detailStatLabel}>{fr ? 'Inscrits' : 'Registered'}</Text></View>
                        {d.prize ? <><View style={s.detailStatDivider} /><View style={s.detailStatItem}><Text style={[s.detailStatValue, { color: '#CA8A04' }]}>{d.prize}</Text><Text style={s.detailStatLabel}>{fr ? 'Dotation' : 'Prize'}</Text></View></> : null}
                      </View>
                      {d.description ? <Text style={s.detailDescText} numberOfLines={3}>{d.description}</Text> : null}
                    </View>
                  );
                })() : null}

                {/* MATCH */}
                {previewDetails.type === 'match' ? (() => {
                  const d = previewDetails as any;
                  const mDate = d.date ? new Date(d.date) : null;
                  const winA = d.winner === 'A';
                  return (
                    <View>
                      <View style={s.matchPreviewBlock}>
                        <View style={s.matchTeamCol}>
                          <Text style={[s.matchTeamName, winA && { color: '#10B981' }]} numberOfLines={2}>{d.teamANames.join(', ') || 'Team A'}</Text>
                          {winA ? <MaterialIcons name="emoji-events" size={12} color="#10B981" /> : null}
                        </View>
                        <View style={s.matchScoreBlock}>
                          <Text style={[s.matchScoreNum, winA && { color: '#10B981' }]}>{d.scoreA}</Text>
                          <Text style={s.matchScoreSep}>-</Text>
                          <Text style={[s.matchScoreNum, !winA && { color: '#EF4444' }]}>{d.scoreB}</Text>
                        </View>
                        <View style={[s.matchTeamCol, { alignItems: 'flex-end' }]}>
                          <Text style={[s.matchTeamName, !winA && { color: '#10B981' }]} numberOfLines={2}>{d.teamBNames.join(', ') || 'Team B'}</Text>
                          {!winA ? <MaterialIcons name="emoji-events" size={12} color="#10B981" /> : null}
                        </View>
                      </View>
                      <View style={s.detailPillsRow}>
                        <View style={[s.detailPill, { backgroundColor: '#3B82F612' }]}><MaterialIcons name="sports" size={11} color="#3B82F6" /><Text style={[s.detailPillText, { color: '#3B82F6' }]}>{d.format}</Text></View>
                        <View style={[s.detailPill, { backgroundColor: '#6366F112' }]}><MaterialIcons name="category" size={11} color="#6366F1" /><Text style={[s.detailPillText, { color: '#6366F1' }]}>{d.mode}</Text></View>
                        {d.duration > 0 ? <View style={[s.detailPill, { backgroundColor: '#94A3B812' }]}><MaterialIcons name="timer" size={11} color="#64748B" /><Text style={[s.detailPillText, { color: '#64748B' }]}>{d.duration} min</Text></View> : null}
                      </View>
                      {mDate ? <View style={s.detailLocationRow}><MaterialIcons name="event" size={12} color="#94A3B8" /><Text style={s.detailLocationText}>{mDate.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</Text></View> : null}
                      {d.terrainType ? <View style={s.detailLocationRow}><MaterialIcons name="landscape" size={12} color="#94A3B8" /><Text style={s.detailLocationText}>{d.terrainType}</Text></View> : null}
                    </View>
                  );
                })() : null}

                {/* CHALLENGE */}
                {previewDetails.type === 'challenge' ? (() => {
                  const d = previewDetails as any;
                  const cDate = d.date ? new Date(d.date) : null;
                  const typeName = d.challengeType === '10_tirs' ? '10 Tirs' : d.challengeType === '10_tirs_sautee' ? '10 Tirs Sautee' : d.challengeType === 'precision' ? 'Precision' : d.challengeType;
                  return (
                    <View>
                      <View style={s.detailPillsRow}>
                        <View style={[s.detailPill, { backgroundColor: '#F9731612' }]}><MaterialIcons name="flag" size={11} color="#EA580C" /><Text style={[s.detailPillText, { color: '#EA580C' }]}>{typeName}</Text></View>
                        <View style={[s.detailPill, { backgroundColor: d.mode === 'duel' ? '#EF444412' : '#3B82F612' }]}><MaterialIcons name={d.mode === 'duel' ? 'people' : 'person'} size={11} color={d.mode === 'duel' ? '#EF4444' : '#3B82F6'} /><Text style={[s.detailPillText, { color: d.mode === 'duel' ? '#EF4444' : '#3B82F6' }]}>{d.mode === 'duel' ? 'Duel' : 'Solo'}</Text></View>
                      </View>
                      <View style={s.detailStatsBar}>
                        <View style={s.detailStatItem}><Text style={s.detailStatValue}>{d.successCount}/{d.totalShots}</Text><Text style={s.detailStatLabel}>{fr ? 'Reussis' : 'Success'}</Text></View>
                        <View style={s.detailStatDivider} />
                        <View style={s.detailStatItem}><Text style={[s.detailStatValue, { color: '#10B981' }]}>{d.successRate}%</Text><Text style={s.detailStatLabel}>{fr ? 'Taux' : 'Rate'}</Text></View>
                        {d.carreauCount > 0 ? <><View style={s.detailStatDivider} /><View style={s.detailStatItem}><Text style={[s.detailStatValue, { color: '#F59E0B' }]}>{d.carreauCount}</Text><Text style={s.detailStatLabel}>Carreaux</Text></View></> : null}
                        {d.totalPoints > 0 ? <><View style={s.detailStatDivider} /><View style={s.detailStatItem}><Text style={[s.detailStatValue, { color: '#2563EB' }]}>{d.totalPoints}</Text><Text style={s.detailStatLabel}>Points</Text></View></> : null}
                      </View>
                      {cDate ? <View style={s.detailLocationRow}><MaterialIcons name="event" size={12} color="#94A3B8" /><Text style={s.detailLocationText}>{cDate.toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}</Text></View> : null}
                    </View>
                  );
                })() : null}

                {/* Read-only badge */}
                <View style={s.detailReadOnlyRow}>
                  <MaterialIcons name="lock" size={12} color="#64748B" />
                  <Text style={s.detailReadOnlyText}>{fr ? 'Lecture seule - le destinataire ne pourra pas modifier' : 'Read-only - the recipient cannot edit'}</Text>
                </View>
              </View>
            ) : null}

            {/* ===== STEP: OPTIONS (share mode selection) ===== */}
            {step === 'options' ? (
              <View>
                {/* Contact visibility toggle (auto-detected for player/club) */}
                {showContactToggle && isOwnItem ? (
                  <Pressable
                    style={s.contactToggleCard}
                    onPress={async () => {
                      Haptics.selectionAsync();
                      const newVal = !contactVisible;
                      setContactVisible(newVal);
                      try {
                        if (itemType === 'player') await updatePlayer(itemId, { showContactPublic: newVal });
                        else if (itemType === 'club') await updateClub(itemId, { showContactPublic: newVal } as any);
                      } catch (e) {
                        console.log('[ShareModal] Error updating contact visibility:', e);
                        setContactVisible(!newVal); // revert on error
                      }
                    }}
                  >
                    <View style={[s.contactToggleIcon, { backgroundColor: (contactVisible ? '#10B981' : '#94A3B8') + '15' }]}>
                      <MaterialIcons name={contactVisible ? 'contact-phone' : 'phone-disabled'} size={18} color={contactVisible ? '#10B981' : '#94A3B8'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.contactToggleLabel}>{fr ? 'Contacts visibles' : 'Contacts visible'}</Text>
                      <Text style={s.contactToggleDesc}>{contactVisible ? (fr ? 'Email et telephone visibles pour le destinataire' : 'Email and phone visible to recipient') : (fr ? 'Contacts masques pour le destinataire' : 'Contacts hidden from recipient')}</Text>
                    </View>
                    <View style={[s.customToggleTrack, contactVisible && s.customToggleTrackActive]}>
                      <View style={[s.customToggleThumb, contactVisible && s.customToggleThumbActive]} />
                    </View>
                  </Pressable>
                ) : null}

                {/* Share options */}
                <Animated.View entering={FadeInDown.duration(250).delay(50)} style={s.optionsList}>
                  <Pressable style={({ pressed }) => [s.optionCard, pressed && s.optionCardPressed]} onPress={() => initiateGenerate('native')}>
                    <View style={[s.optionIcon, { backgroundColor: typeConfig.color + '12' }]}>
                      <MaterialIcons name="share" size={22} color={typeConfig.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionTitle}>{fr ? 'Partager via...' : 'Share via...'}</Text>
                      <Text style={s.optionDesc}>{fr ? 'WhatsApp, SMS, e-mail, etc.' : 'WhatsApp, SMS, email, etc.'}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color="#CBD5E1" />
                  </Pressable>

                  <Pressable style={({ pressed }) => [s.optionCard, pressed && s.optionCardPressed]} onPress={() => initiateGenerate('code')}>
                    <View style={[s.optionIcon, { backgroundColor: '#F59E0B12' }]}>
                      <MaterialIcons name="content-copy" size={22} color="#F59E0B" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionTitle}>{fr ? 'Copier le code' : 'Copy code'}</Text>
                      <Text style={s.optionDesc}>{fr ? 'Generer et copier le code de partage' : 'Generate and copy the share code'}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color="#CBD5E1" />
                  </Pressable>

                  <Pressable style={({ pressed }) => [s.optionCard, pressed && s.optionCardPressed]} onPress={() => initiateGenerate('invitation')}>
                    <View style={[s.optionIcon, { backgroundColor: '#3B82F612' }]}>
                      <MaterialIcons name="description" size={22} color="#3B82F6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionTitle}>{fr ? 'Copier l\'invitation' : 'Copy invitation'}</Text>
                      <Text style={s.optionDesc}>{fr ? 'Message complet avec details' : 'Full message with details'}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color="#CBD5E1" />
                  </Pressable>

                  <Pressable style={({ pressed }) => [s.optionCard, pressed && s.optionCardPressed]} onPress={() => initiateGenerate('qr')}>
                    <View style={[s.optionIcon, { backgroundColor: '#22C55E12' }]}>
                      <MaterialIcons name="qr-code-2" size={22} color="#22C55E" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionTitle}>{fr ? 'QR Code de partage' : 'Share QR Code'}</Text>
                      <Text style={s.optionDesc}>{fr ? 'Generer un QR code scannable' : 'Generate a scannable QR code'}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color="#CBD5E1" />
                  </Pressable>
                {/* Social media share — same style as other options */}
                {(itemType === 'match' || itemType === 'challenge' || itemType === 'tournament' || itemType === 'club' || (itemType === 'player' && (() => { const p = getPlayerById(itemId); return p && (p as any)?.userId; })())) ? (
                  <Pressable
                    style={({ pressed }) => [s.optionCard, pressed && s.optionCardPressed]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      handleClose();
                      setTimeout(() => {
                        const shareType = itemType === 'player' ? 'stats' : itemType;
                        const shareParams: any = { type: shareType, id: itemId };
                        if (itemType === 'club') shareParams.clubId = itemId;
                        router.push({ pathname: '/share-card', params: shareParams } as any);
                      }, 300);
                    }}
                  >
                    <View style={[s.optionIcon, { backgroundColor: '#8B5CF612' }]}>
                      <MaterialIcons name="camera-alt" size={22} color="#8B5CF6" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.optionTitle}>{fr ? 'Partage reseaux sociaux' : 'Social Media Share'}</Text>
                      <Text style={s.optionDesc}>{fr ? 'Image pour Instagram, TikTok, Facebook...' : 'Image for Instagram, TikTok, Facebook...'}</Text>
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color="#CBD5E1" />
                  </Pressable>
                ) : null}
                </Animated.View>

                {/* Read-only info */}
                <View style={s.infoRow}>
                  <MaterialIcons name="visibility" size={14} color={typeConfig.color} />
                  <Text style={s.infoText}>{t('shareModal', 'autoSaveDesc')}</Text>
                </View>
              </View>
            ) : null}

            {/* ===== STEP: ASSOCIATED ITEMS (player only) ===== */}
            {step === 'associated' ? (
              <Animated.View entering={FadeInDown.duration(300)}>
                <View style={s.stepCard}>
                  <View style={s.stepHeader}>
                    <MaterialIcons name="link" size={20} color={typeConfig.color} />
                    <Text style={s.stepTitle}>{t('shareModal', 'alsoShareAssociated')}</Text>
                  </View>
                  <Text style={s.stepDesc}>{t('shareModal', 'alsoShareAssociatedDesc')}</Text>

                  {associatedClub ? (
                    <Pressable style={[s.assocItem, includeClub && s.assocItemActive]} onPress={() => { Haptics.selectionAsync(); setIncludeClub(!includeClub); }}>
                      <View style={[s.assocItemIcon, { backgroundColor: '#D9770615' }]}><MaterialIcons name="home" size={20} color="#D97706" /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.assocItemLabel}>{t('shareModal', 'associatedClub')}</Text>
                        <Text style={s.assocItemName} numberOfLines={1}>{associatedClub.name}</Text>
                      </View>
                      <View style={[s.checkbox, includeClub && s.checkboxActive]}>{includeClub ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}</View>
                    </Pressable>
                  ) : null}

                  {associatedTerrain ? (
                    <Pressable style={[s.assocItem, includeTerrain && s.assocItemActive]} onPress={() => { Haptics.selectionAsync(); setIncludeTerrain(!includeTerrain); }}>
                      <View style={[s.assocItemIcon, { backgroundColor: '#10B98115' }]}><MaterialIcons name="sports-soccer" size={20} color="#10B981" /></View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.assocItemLabel}>{t('shareModal', 'associatedTerrain')}</Text>
                        <Text style={s.assocItemName} numberOfLines={1}>{associatedTerrain.name}</Text>
                      </View>
                      <View style={[s.checkbox, includeTerrain && s.checkboxActive]}>{includeTerrain ? <MaterialIcons name="check" size={14} color="#FFF" /> : null}</View>
                    </Pressable>
                  ) : null}

                  <View style={s.stepActions}>
                    <Pressable style={s.stepSecondaryBtn} onPress={handleSkipAssociated}>
                      <Text style={s.stepSecondaryBtnText}>{t('shareModal', 'sharePlayerOnly')}</Text>
                    </Pressable>
                    <Pressable style={[s.stepPrimaryBtn, { backgroundColor: typeConfig.color }]} onPress={handleConfirmAssociated}>
                      <MaterialIcons name="arrow-forward" size={18} color="#FFF" />
                      <Text style={s.stepPrimaryBtnText}>{fr ? 'Continuer' : 'Continue'}</Text>
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {/* ===== STEP: EXPIRATION ===== */}
            {step === 'expiration' ? (
              <Animated.View entering={FadeInDown.duration(300)}>
                <View style={s.stepCard}>
                  <View style={s.stepHeader}>
                    <MaterialIcons name="timer" size={20} color={typeConfig.color} />
                    <Text style={s.stepTitle}>{t('shareModal', 'expirationLabel')}</Text>
                  </View>
                  <Text style={s.stepDesc}>{fr ? 'Choisissez la duree de validite du code de partage' : 'Choose how long the share code should be valid'}</Text>

                  <View style={s.expirationGrid}>
                    {EXPIRATION_OPTIONS.map((opt) => {
                      const isActive = expiration === opt.key;
                      return (
                        <Pressable key={opt.key} style={[s.expirationChip, isActive && { backgroundColor: typeConfig.color, borderColor: typeConfig.color }]} onPress={() => { Haptics.selectionAsync(); setExpiration(opt.key); }}>
                          <MaterialIcons name={opt.icon as any} size={16} color={isActive ? '#FFF' : '#64748B'} />
                          <Text style={[s.expirationChipText, isActive && { color: '#FFF' }]}>{t('shareModal', opt.labelKey)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {error ? (
                    <View style={s.errorBox}>
                      <MaterialIcons name="error" size={16} color="#EF4444" />
                      <Text style={s.errorText}>{error}</Text>
                    </View>
                  ) : null}

                  <View style={s.stepActions}>
                    <Pressable style={s.stepSecondaryBtn} onPress={() => setStep(itemType === 'player' && (associatedClub || associatedTerrain) ? 'associated' : 'options')}>
                      <MaterialIcons name="arrow-back" size={16} color="#64748B" />
                      <Text style={s.stepSecondaryBtnText}>{fr ? 'Retour' : 'Back'}</Text>
                    </Pressable>
                    <Pressable style={[s.stepPrimaryBtn, { backgroundColor: typeConfig.color }, isGenerating && { opacity: 0.6 }]} onPress={handleConfirmExpiration} disabled={isGenerating}>
                      {isGenerating ? <ActivityIndicator size="small" color="#FFF" /> : <><MaterialIcons name="link" size={18} color="#FFF" /><Text style={s.stepPrimaryBtnText}>{t('shareModal', 'generateCode')}</Text></>}
                    </Pressable>
                  </View>
                </View>
              </Animated.View>
            ) : null}

            {/* ===== STEP: RESULT ===== */}
            {step === 'result' && shareCode ? (
              <View>
                {/* Code display */}
                <Animated.View entering={FadeInDown.duration(300)} style={s.codeCard}>
                  <View style={s.codeCardRow}>
                    <View style={[s.codeSuccessIcon, { backgroundColor: '#10B98115' }]}>
                      <MaterialIcons name="check-circle" size={24} color="#10B981" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.codeCardTitle}>{t('shareModal', 'codeCreated')}</Text>
                      <Text style={s.codeCardSub}>{t('shareModal', 'shareCodeAutoSaveDesc')}</Text>
                    </View>
                  </View>
                  <View style={s.codeDisplay}>
                    <Text style={[s.codeText, { color: typeConfig.color }]}>{shareCode}</Text>
                    <Pressable style={[s.codeCopyBtn, { backgroundColor: typeConfig.color + '12' }]} onPress={handleCopyCode}>
                      <MaterialIcons name={copied ? 'check' : 'content-copy'} size={18} color={copied ? '#10B981' : typeConfig.color} />
                      <Text style={[s.codeCopyBtnText, { color: copied ? '#10B981' : typeConfig.color }]}>{copied ? t('shareModal', 'copied') : t('shareModal', 'copy')}</Text>
                    </Pressable>
                  </View>

                  {/* Included items */}
                  {sharedAssociatedItems.length > 0 ? (
                    <View style={s.includedList}>
                      {sharedAssociatedItems.map(ai => {
                        const conf = ai.type === 'club' ? { icon: 'home' as const, color: '#D97706', name: associatedClub?.name } : { icon: 'sports-soccer' as const, color: '#10B981', name: associatedTerrain?.name };
                        return (
                          <View key={ai.type} style={s.includedRow}>
                            <MaterialIcons name={conf.icon} size={14} color={conf.color} />
                            <Text style={s.includedRowText}>{conf.name}</Text>
                            <View style={[s.includedBadge, { backgroundColor: conf.color + '12' }]}><Text style={[s.includedBadgeText, { color: conf.color }]}>{ai.type === 'club' ? 'Club' : 'Terrain'}</Text></View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}

                  {/* Expiration indicator */}
                  {expiresAtDate ? (
                    <View style={[s.expirationIndicator, { backgroundColor: typeConfig.color + '08', borderColor: typeConfig.color + '18' }]}>
                      <MaterialIcons name="timer" size={14} color={typeConfig.color} />
                      {expirationCountdown && !expirationCountdown.expired ? (
                        <Text style={[s.expirationIndicatorText, { color: typeConfig.color }]}>
                          {t('shareModal', 'expiresIn')} {expirationCountdown.days > 0 ? `${expirationCountdown.days}${t('shareModal', 'daysShort')} ` : ''}{expirationCountdown.hours}{t('shareModal', 'hoursShort')}{expirationCountdown.days === 0 ? ` ${expirationCountdown.minutes}${t('shareModal', 'minutesShort')}` : ''}
                        </Text>
                      ) : (
                        <Text style={[s.expirationIndicatorText, { color: '#EF4444' }]}>{t('shareModal', 'expired')}</Text>
                      )}
                    </View>
                  ) : (
                    <View style={[s.expirationIndicator, { backgroundColor: '#10B98108', borderColor: '#10B98118' }]}>
                      <MaterialIcons name="all-inclusive" size={14} color="#10B981" />
                      <Text style={[s.expirationIndicatorText, { color: '#10B981' }]}>{t('shareModal', 'noExpiration')}</Text>
                    </View>
                  )}
                </Animated.View>

                {/* QR Code */}
                <Animated.View entering={FadeInDown.duration(300).delay(100)} style={s.qrSection}>
                  <View style={s.qrHeader}>
                    <MaterialIcons name="qr-code-2" size={16} color={typeConfig.color} />
                    <Text style={s.qrTitle}>{fr ? 'QR Code de partage' : 'Share QR Code'}</Text>
                  </View>
                  <View style={s.qrBody}>
                    <View style={[s.qrWrapper, { borderColor: typeConfig.color + '20' }]}>
                      <QRCode value={`${config.appDownloadUrl}?share=${shareCode}`} size={130} color={typeConfig.color} backgroundColor="#FFFFFF" />
                    </View>
                    <Text style={s.qrHint}>{fr ? 'Scannez pour acceder a la fiche' : 'Scan to access the card'}</Text>
                  </View>
                </Animated.View>

                {/* Share action buttons */}
                <Animated.View entering={FadeIn.duration(200).delay(200)} style={s.resultActions}>
                  <Pressable style={({ pressed }) => [s.resultActionBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={handleNativeShare}>
                    <View style={[s.resultActionIcon, { backgroundColor: typeConfig.color + '12' }]}><MaterialIcons name="share" size={20} color={typeConfig.color} /></View>
                    <Text style={s.resultActionText}>{fr ? 'Partager' : 'Share'}</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [s.resultActionBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={handleCopyCode}>
                    <View style={[s.resultActionIcon, { backgroundColor: '#F59E0B12' }]}><MaterialIcons name="content-copy" size={20} color="#F59E0B" /></View>
                    <Text style={s.resultActionText}>{t('shareModal', 'copyCode')}</Text>
                  </Pressable>
                  <Pressable style={({ pressed }) => [s.resultActionBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]} onPress={handleCopyInvitation}>
                    <View style={[s.resultActionIcon, { backgroundColor: '#3B82F612' }]}><MaterialIcons name="description" size={20} color="#3B82F6" /></View>
                    <Text style={s.resultActionText}>{fr ? 'Invitation' : 'Invitation'}</Text>
                  </Pressable>
                </Animated.View>

                {/* Gold sponsor branding on share result */}
                {goldSponsor ? (
                  <Pressable
                    style={({ pressed }) => [s.sponsorShareBanner, pressed && { opacity: 0.9 }]}
                    onPress={() => {
                      trackAmbassadorEvent(goldSponsor.id, 'profile_view', undefined, { sourcePage: 'share_modal' });
                      router.push('/partners');
                    }}
                  >
                    <LinearGradient colors={['#FFFBEB', '#FEF3C7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sponsorShareGradient}>
                      <View style={s.sponsorShareAccent} />
                      <View style={s.sponsorShareContent}>
                        {goldSponsor.photo ? (
                          <Image source={{ uri: goldSponsor.photo }} style={s.sponsorShareLogo} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                        ) : (
                          <LinearGradient colors={['#B45309', '#F59E0B']} style={s.sponsorShareLogoFallback}>
                            <MaterialIcons name="workspace-premium" size={14} color="#FFF" />
                          </LinearGradient>
                        )}
                        <View style={{ flex: 1 }}>
                          <View style={s.sponsorShareLabelRow}>
                            <LinearGradient colors={['#B45309', '#D97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={s.sponsorShareLabel}>
                              <MaterialIcons name="star" size={6} color="#FFF" />
                              <Text style={s.sponsorShareLabelText}>{fr ? 'PARTENAIRE OR' : 'GOLD PARTNER'}</Text>
                            </LinearGradient>
                          </View>
                          <Text style={s.sponsorShareName} numberOfLines={1}>{goldSponsor.displayName}</Text>
                        </View>
                        <MaterialIcons name="open-in-new" size={12} color="#B45309" />
                      </View>
                    </LinearGradient>
                  </Pressable>
                ) : null}

                {/* Tip */}
                <View style={s.tipRow}>
                  <MaterialIcons name="lightbulb" size={14} color="#F59E0B" />
                  <Text style={s.tipText}>{t('shareModal', 'infoTextAutoSave')}</Text>
                </View>
              </View>
            ) : null}

        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', backgroundColor: '#FFF' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { paddingBottom: 48 },

  // Preview gradient
  previewGradient: { padding: 16, marginHorizontal: 16, marginTop: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  previewHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  previewTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 },
  previewCodeBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  previewCodeText: { fontSize: 12, fontWeight: '900', color: '#FFF', letterSpacing: 1.5 },
  previewTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, alignSelf: 'flex-start' },
  previewTypeText: { fontSize: 10, fontWeight: '700', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Detail card (rich preview)
  detailCard: { marginHorizontal: 16, backgroundColor: '#FFF', borderBottomLeftRadius: 16, borderBottomRightRadius: 16, padding: 16, borderWidth: 1, borderTopWidth: 0, borderColor: '#F1F5F9' },
  detailIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  detailAvatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  detailAvatarImg: { width: 48, height: 48, borderRadius: 24 },
  detailAvatarText: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  detailNickname: { fontSize: 12, fontStyle: 'italic', color: '#64748B', marginBottom: 4 },
  detailPillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8 },
  detailPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  detailPillText: { fontSize: 11, fontWeight: '600' },
  detailInfoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  detailInfoPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#F8FAFC', borderRadius: 10 },
  detailInfoPillText: { fontSize: 11, fontWeight: '600' },
  detailLocationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  detailLocationText: { fontSize: 12, color: '#64748B', flex: 1 },
  detailDescText: { fontSize: 12, color: '#64748B', lineHeight: 17, marginBottom: 8 },
  detailStatsBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 8, marginVertical: 8 },
  detailStatItem: { alignItems: 'center', flex: 1 },
  detailStatValue: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  detailStatLabel: { fontSize: 9, color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' },
  detailStatDivider: { width: 1, height: 22, backgroundColor: '#E2E8F0', marginHorizontal: 4 },
  detailNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  detailNoteText: { fontSize: 10, color: '#94A3B8', flex: 1, fontStyle: 'italic' },
  contactPreviewBlock: { marginTop: 8, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#F1F5F9' },
  contactPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  contactPreviewHeaderText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  contactPreviewItems: { gap: 4 },
  contactPreviewItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactPreviewItemText: { fontSize: 12, color: '#0F172A', fontWeight: '500' },
  contactPreviewItemMasked: { fontSize: 12, color: '#CBD5E1', fontWeight: '500', letterSpacing: 0.5 },
  detailReadOnlyRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  detailReadOnlyText: { fontSize: 11, color: '#64748B', flex: 1 },
  // Geo rank in share card
  geoRankShareRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 6, flexWrap: 'wrap' as const },
  geoRankSharePill: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, backgroundColor: '#F8FAFC', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0' },
  geoRankShareNum: { fontSize: 12, fontWeight: '800' as const },
  // Match preview
  matchPreviewBlock: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, marginBottom: 8 },
  matchTeamCol: { flex: 1, gap: 4 },
  matchTeamName: { fontSize: 13, fontWeight: '600', color: '#0F172A', lineHeight: 17 },
  matchScoreBlock: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 12, backgroundColor: '#F8FAFC', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
  matchScoreNum: { fontSize: 22, fontWeight: '800', color: '#0F172A' },
  matchScoreSep: { fontSize: 14, color: '#CBD5E1', fontWeight: '600' },

  // Contact toggle
  contactToggleCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 16, backgroundColor: '#FFF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  contactToggleIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  contactToggleLabel: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  contactToggleDesc: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  customToggleTrack: { width: 48, height: 28, borderRadius: 14, backgroundColor: '#E2E8F0', justifyContent: 'center', paddingHorizontal: 3 },
  customToggleTrackActive: { backgroundColor: '#10B98160' },
  customToggleThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#94A3B8' },
  customToggleThumbActive: { backgroundColor: '#10B981', alignSelf: 'flex-end' as const },

  // Options list
  optionsList: { paddingHorizontal: 16, paddingTop: 16, gap: 8 },
  optionCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  optionCardPressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  optionIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  optionTitle: { fontSize: 15, fontWeight: '600', color: '#0F172A' },
  optionDesc: { fontSize: 12, color: '#94A3B8', marginTop: 1 },

  // Social media card button
  socialCardBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 12, backgroundColor: '#8B5CF608', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: '#8B5CF625' },
  socialCardBtnIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#8B5CF612', alignItems: 'center', justifyContent: 'center' },
  socialCardBtnTitle: { fontSize: 15, fontWeight: '700', color: '#8B5CF6' },
  socialCardBtnDesc: { fontSize: 11, color: '#94A3B8', marginTop: 1, lineHeight: 15 },

  // Info row
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 16, marginTop: 16, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  infoText: { flex: 1, fontSize: 11, color: '#94A3B8', lineHeight: 16 },

  // Step card (associated + expiration)
  stepCard: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#FFF', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#F1F5F9' },
  stepHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  stepTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', flex: 1 },
  stepDesc: { fontSize: 13, color: '#64748B', lineHeight: 19, marginBottom: 16 },
  stepActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  stepSecondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14, borderRadius: 12, backgroundColor: '#F1F5F9' },
  stepSecondaryBtnText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  stepPrimaryBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12 },
  stepPrimaryBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },

  // Associated items
  assocItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 2, borderColor: 'transparent' },
  assocItemActive: { borderColor: '#2563EB30', backgroundColor: '#2563EB05' },
  assocItemIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  assocItemLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 0.5 },
  assocItemName: { fontSize: 15, fontWeight: '600', color: '#0F172A', marginTop: 2 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },

  // Expiration
  expirationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expirationChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0' },
  expirationChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },

  // Error
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FEF2F2', padding: 12, borderRadius: 10, marginTop: 12, borderWidth: 1, borderColor: '#FECACA' },
  errorText: { flex: 1, fontSize: 12, color: '#EF4444' },

  // Code card (result)
  codeCard: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  codeCardRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  codeSuccessIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  codeCardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  codeCardSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  codeDisplay: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, gap: 10, borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed' },
  codeText: { flex: 1, fontSize: 22, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  codeCopyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  codeCopyBtnText: { fontSize: 12, fontWeight: '700' },

  // Included
  includedList: { gap: 6, marginTop: 12 },
  includedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F8FAFC', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  includedRowText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0F172A' },
  includedBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  includedBadgeText: { fontSize: 10, fontWeight: '700' },

  // Expiration indicator
  expirationIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  expirationIndicatorText: { fontSize: 12, fontWeight: '600' },

  // QR
  qrSection: { marginHorizontal: 16, marginTop: 12, backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#F1F5F9' },
  qrHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  qrTitle: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  qrBody: { alignItems: 'center' },
  qrWrapper: { padding: 14, backgroundColor: '#FFF', borderRadius: 14, borderWidth: 2 },
  qrHint: { fontSize: 11, color: '#94A3B8', marginTop: 10 },

  // Result actions
  resultActions: { flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 16 },
  resultActionBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFF', paddingVertical: 16, borderRadius: 14, borderWidth: 1, borderColor: '#F1F5F9' },
  resultActionIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  resultActionText: { fontSize: 11, fontWeight: '600', color: '#0F172A' },

  // Tip
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 16, marginTop: 16, padding: 12, backgroundColor: '#FFFBEB', borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' },
  tipText: { flex: 1, fontSize: 11, color: '#92400E', lineHeight: 16 },

  // Gold sponsor branding on share
  sponsorShareBanner: { marginHorizontal: 16, marginTop: 16, borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, borderColor: '#F59E0B' },
  sponsorShareGradient: { borderRadius: 12, position: 'relative' as const },
  sponsorShareAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, backgroundColor: '#F59E0B', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  sponsorShareContent: { flexDirection: 'row' as const, alignItems: 'center' as const, paddingVertical: 10, paddingHorizontal: 12, gap: 10 },
  sponsorShareLogo: { width: 32, height: 32, borderRadius: 10, overflow: 'hidden' as const },
  sponsorShareLogoFallback: { width: 32, height: 32, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  sponsorShareLabelRow: { flexDirection: 'row' as const, marginBottom: 2 },
  sponsorShareLabel: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  sponsorShareLabelText: { fontSize: 7, fontWeight: '900' as const, color: '#FFF', letterSpacing: 0.6 },
  sponsorShareName: { fontSize: 12, fontWeight: '700' as const, color: '#78350F' },
});
