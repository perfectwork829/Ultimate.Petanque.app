import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';

import * as Haptics from '@/services/haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useAuth, getSupabaseClient } from '@/template';
import { useAlert } from '@/template';
import ShareModal from '@/components/ui/ShareModal';
import SharedBadge from '@/components/ui/SharedBadge';
import { fetchAmbassadors, Ambassador } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import { Challenge, ChallengeType, PrecisionAtelier, PrecisionDistance } from '@/types/petanque';
import { PRECISION_ATELIERS } from '@/constants/challengeConfig';
import { checkEditConflict, computeChallengeDiffs, fetchUpdatedAt, DiffEntry } from '@/services/collaborativeEditService';
import { logModification } from '@/services/modificationLogService';
import EditConflictModal from '@/components/ui/EditConflictModal';
import AttestationSection from '@/components/feature/AttestationSection';
import { getShareRequestsForItem, detectLinkedPlayers, createShareRequests, MatchShareRequest } from '@/services/matchShareService';

const CHALLENGE_LABELS: Record<string, Record<ChallengeType, string>> = {
  fr: { '10_tirs': '10 Tirs', '10_tirs_sautee': '10 Tirs Sautee', precision: 'Precision' },
  en: { '10_tirs': '10 Shots', '10_tirs_sautee': '10 Lob Shots', precision: 'Precision' },
};

const CHALLENGE_ICONS: Record<ChallengeType, { icon: string; color: string }> = {
  '10_tirs': { icon: 'track-changes', color: '#2563EB' },
  '10_tirs_sautee': { icon: 'flight-takeoff', color: '#D97706' },
  precision: { icon: 'stars', color: '#7C3AED' },
};

const POINT_COLORS: Record<number, string> = { 0: '#EF4444', 1: '#F59E0B', 3: '#10B981', 5: '#7C3AED' };

export default function ChallengeDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { challenges, loading: appLoading } = useAppData();
  const { getSharedPermission, isSharedItem, refreshData, updateChallenge, deleteChallenge } = useAppActions();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { t, language } = useLanguage();
  const fr = language === 'fr';

  const [refreshing, setRefreshing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [goldSponsor, setGoldSponsor] = useState<Ambassador | null>(null);
  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);

  // Quick share state
  const [quickShareState, setQuickShareState] = useState<'idle' | 'loading' | 'sent' | 'no_accounts' | 'already_shared'>('idle');
  const [quickShareCount, setQuickShareCount] = useState(0);
  const [shareRequests, setShareRequests] = useState<MatchShareRequest[]>([]);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editSuccessCount, setEditSuccessCount] = useState('');
  const [editCarreauCount, setEditCarreauCount] = useState('');
  const [editTotalPoints, setEditTotalPoints] = useState('');

  // Collaborative conflict state
  const [serverUpdatedAt, setServerUpdatedAt] = useState<string | null>(null);
  const [showConflict, setShowConflict] = useState(false);
  const [conflictDiffs, setConflictDiffs] = useState<DiffEntry[]>([]);
  const [pendingSave, setPendingSave] = useState<Partial<Challenge> | null>(null);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);

  useEffect(() => {
    fetchAmbassadors().then(({ ambassadors }) => {
      const gold = ambassadors.find(a => a.badgeType === 'gold_sponsor');
      if (gold) setGoldSponsor(gold);
    });
  }, []);

  // Load existing share requests for this challenge
  useEffect(() => {
    if (!id) return;
    getShareRequestsForItem('challenge', id).then(({ requests }) => setShareRequests(requests)).catch(() => {});
  }, [id]);

  // Quick share with opponent handler (1v1 challenges)
  const handleQuickShareWithOpponent = useCallback(async () => {
    if (!challenge || !user?.id || !id || !challenge.opponentId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setQuickShareState('loading');
    try {
      const playerIds = [challenge.opponentId].filter(Boolean) as string[];
      const { linkedPlayers } = await detectLinkedPlayers(playerIds, user.id);
      if (linkedPlayers.length === 0) {
        setQuickShareState('no_accounts');
        setTimeout(() => setQuickShareState('idle'), 2500);
        return;
      }
      const alreadySharedIds = new Set(shareRequests.map(r => r.recipientUserId));
      const newRecipients = linkedPlayers.filter(p => !alreadySharedIds.has(p.userId));
      if (newRecipients.length === 0) {
        setQuickShareState('already_shared');
        setTimeout(() => setQuickShareState('idle'), 2500);
        return;
      }
      const summary = `${typeLabel} - ${challenge.playerName || ''} vs ${challenge.opponentName || ''}`;
      const senderName = user.username || user.email?.split('@')[0] || 'Joueur';
      const { requests: newReqs, error } = await createShareRequests({
        itemType: 'challenge',
        itemId: id,
        senderUserId: user.id,
        senderName,
        recipients: newRecipients.map(p => ({ userId: p.userId, permission: 'read' as const })),
        itemSummary: summary,
      });
      if (error) {
        showAlert(fr ? 'Erreur' : 'Error', error);
        setQuickShareState('idle');
        return;
      }
      setQuickShareCount(newReqs.length);
      setShareRequests(prev => [...newReqs, ...prev]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setQuickShareState('sent');
      setTimeout(() => setQuickShareState('idle'), 3000);
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
      setQuickShareState('idle');
    }
  }, [challenge, user, id, shareRequests, fr, showAlert]);

  const challenge: Challenge | undefined = useMemo(() => {
    return challenges.find(c => c.id === id);
  }, [challenges, id]);

  const sharedPermission = id ? getSharedPermission(id) : null;
  const isShared = id ? isSharedItem(id) : false;
  const isReadOnly = isShared && sharedPermission === 'read';

  // Fetch updated_at for conflict detection when entering edit mode
  useEffect(() => {
    if (!isEditing || !challenge || !isShared || sharedPermission !== 'write') {
      setServerUpdatedAt(null);
      return;
    }
    fetchUpdatedAt('challenges', challenge.id).then(ts => {
      if (ts) setServerUpdatedAt(ts);
    });
  }, [isEditing, challenge?.id, isShared, sharedPermission]);

  // Initialize edit fields when entering edit mode
  const enterEditMode = useCallback(() => {
    if (!challenge || isReadOnly) return;
    Haptics.selectionAsync();
    setEditNotes(challenge.notes || '');
    setEditDuration(challenge.duration ? String(challenge.duration) : '');
    setEditSuccessCount(challenge.successCount != null ? String(challenge.successCount) : '');
    setEditCarreauCount(challenge.carreauCount != null ? String(challenge.carreauCount) : '');
    setEditTotalPoints(challenge.totalPoints != null ? String(challenge.totalPoints) : '');
    setIsEditing(true);
  }, [challenge, isReadOnly]);

  const cancelEdit = useCallback(() => {
    setIsEditing(false);
    setPendingSave(null);
    setConflictDiffs([]);
    setShowConflict(false);
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshData();
    setRefreshing(false);
  }, [refreshData]);

  // Build update payload
  const buildUpdates = useCallback((): Partial<Challenge> => {
    if (!challenge) return {};
    const updates: Partial<Challenge> = { notes: editNotes.trim() || undefined };
    const dur = parseInt(editDuration, 10);
    if (!isNaN(dur) && dur >= 0) updates.duration = dur;

    if (challenge.type !== 'precision') {
      const sc = parseInt(editSuccessCount, 10);
      const cc = parseInt(editCarreauCount, 10);
      const total = challenge.totalShots || 10;
      if (!isNaN(sc) && sc >= 0 && sc <= total) {
        updates.successCount = sc;
        updates.successRate = Math.round((sc / total) * 1000) / 10;
      }
      if (!isNaN(cc) && cc >= 0) updates.carreauCount = cc;
    } else {
      const tp = parseInt(editTotalPoints, 10);
      if (!isNaN(tp) && tp >= 0) updates.totalPoints = tp;
    }
    return updates;
  }, [challenge, editNotes, editDuration, editSuccessCount, editCarreauCount, editTotalPoints]);

  // Perform save (shared or direct)
  const performSave = useCallback(async (updates: Partial<Challenge>) => {
    if (!challenge) return;

    // Log modification for shared writable challenges
    if (isShared && sharedPermission === 'write') {
      const changes: { field: string; oldValue?: any; newValue?: any }[] = [];
      if (updates.successCount !== undefined && updates.successCount !== challenge.successCount) changes.push({ field: 'successCount', oldValue: challenge.successCount, newValue: updates.successCount });
      if (updates.successRate !== undefined && updates.successRate !== challenge.successRate) changes.push({ field: 'successRate', oldValue: `${challenge.successRate}%`, newValue: `${updates.successRate}%` });
      if (updates.carreauCount !== undefined && updates.carreauCount !== challenge.carreauCount) changes.push({ field: 'carreauCount', oldValue: challenge.carreauCount, newValue: updates.carreauCount });
      if (updates.totalPoints !== undefined && updates.totalPoints !== challenge.totalPoints) changes.push({ field: 'totalPoints', oldValue: challenge.totalPoints, newValue: updates.totalPoints });
      if (updates.duration !== undefined && updates.duration !== challenge.duration) changes.push({ field: 'duration', oldValue: challenge.duration, newValue: updates.duration });
      if (updates.notes !== undefined && updates.notes !== (challenge.notes || undefined)) changes.push({ field: 'notes', oldValue: challenge.notes || '', newValue: updates.notes || '' });
      if (changes.length > 0) {
        try {
          const sb = getSupabaseClient();
          const { data: row } = await sb.from('challenges').select('user_id').eq('id', challenge.id).single();
          if (row?.user_id) await logModification({ itemType: 'challenge', itemId: challenge.id, ownerId: row.user_id, changes });
        } catch { /* silent */ }
      }
    }

    await updateChallenge(challenge.id, updates);
    setIsEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [challenge, updateChallenge, isShared, sharedPermission]);

  // Save with conflict check
  const handleSave = useCallback(async () => {
    if (!challenge) return;
    setSaving(true);
    try {
      const updates = buildUpdates();

      // Conflict detection for shared writable
      if (isShared && sharedPermission === 'write' && serverUpdatedAt) {
        try {
          const conflict = await checkEditConflict('challenges', challenge.id, serverUpdatedAt);
          if (conflict.hasConflict && conflict.serverRecord) {
            const diffs = computeChallengeDiffs(updates as Record<string, any>, conflict.serverRecord, language);
            if (diffs.length > 0) {
              setConflictDiffs(diffs);
              setPendingSave(updates);
              setShowConflict(true);
              setSaving(false);
              return;
            }
          }
        } catch { /* save anyway */ }
      }

      await performSave(updates);
    } catch (e) {
      console.log('Error saving challenge:', e);
    } finally {
      setSaving(false);
    }
  }, [challenge, buildUpdates, performSave, isShared, sharedPermission, serverUpdatedAt, language]);

  const handleConflictKeepMine = useCallback(async () => {
    setShowConflict(false);
    if (pendingSave) {
      setSaving(true);
      try { await performSave(pendingSave); } finally { setSaving(false); setPendingSave(null); }
    }
  }, [pendingSave, performSave]);

  const handleConflictKeepTheirs = useCallback(async () => {
    setShowConflict(false);
    setPendingSave(null);
    await refreshData();
    setIsEditing(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [refreshData]);

  const handleConflictCancel = useCallback(() => {
    setShowConflict(false);
    setPendingSave(null);
    setConflictDiffs([]);
  }, []);

  // Toggle shot success
  const handleToggleShot = useCallback(async (shotIndex: number) => {
    if (!challenge || !challenge.shots) return;
    const updatedShots = challenge.shots.map((s, i) => {
      if (i !== shotIndex) return s;
      return { ...s, success: !s.success, carreau: !s.success ? s.carreau : false };
    });
    const successCount = updatedShots.filter(s => s.success).length;
    const carreauCount = updatedShots.filter(s => s.carreau).length;
    const totalShots = updatedShots.length;
    const successRate = Math.round((successCount / totalShots) * 1000) / 10;
    await updateChallenge(challenge.id, { shots: updatedShots, successCount, carreauCount, successRate });
    setEditSuccessCount(String(successCount));
    setEditCarreauCount(String(carreauCount));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [challenge, updateChallenge]);

  // Toggle carreau
  const handleToggleCarreau = useCallback(async (shotIndex: number) => {
    if (!challenge || !challenge.shots) return;
    const shot = challenge.shots[shotIndex];
    if (!shot.success) return;
    const updatedShots = challenge.shots.map((s, i) => i !== shotIndex ? s : { ...s, carreau: !s.carreau });
    const carreauCount = updatedShots.filter(s => s.carreau).length;
    await updateChallenge(challenge.id, { shots: updatedShots, carreauCount });
    setEditCarreauCount(String(carreauCount));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [challenge, updateChallenge]);

  // Update precision shot points
  const handlePrecisionPoints = useCallback(async (shotIndex: number, points: 0 | 1 | 3 | 5) => {
    if (!challenge || !challenge.precisionShots) return;
    const updated = [...challenge.precisionShots];
    updated[shotIndex] = { ...updated[shotIndex], points };
    const tp = updated.reduce((sum, s) => sum + s.points, 0);
    const newAtelierScores: Record<string, number> = {};
    updated.forEach(s => {
      if (!newAtelierScores[s.atelier]) newAtelierScores[s.atelier] = 0;
      newAtelierScores[s.atelier] += s.points;
    });
    await updateChallenge(challenge.id, { precisionShots: updated, totalPoints: tp, atelierScores: newAtelierScores });
    setEditTotalPoints(String(tp));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [challenge, updateChallenge]);

  // Delete
  const handleDelete = useCallback(() => {
    if (!challenge) return;
    Alert.alert(
      fr ? 'Supprimer le defi' : 'Delete challenge',
      fr ? 'Cette action est irreversible.' : 'This action cannot be undone.',
      [
        { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
        { text: fr ? 'Supprimer' : 'Delete', style: 'destructive', onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          deleteChallenge(challenge.id);
          router.back();
        }},
      ]
    );
  }, [challenge, deleteChallenge, fr]);

  if (!challenge) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{fr ? 'Detail du defi' : 'Challenge detail'}</Text>
          <View style={{ width: 40 }} />
        </View>
        {appLoading ? (
          <View style={s.center}><ActivityIndicator size="large" color={theme.primary} /></View>
        ) : (
          <View style={s.center}>
            <MaterialIcons name="error-outline" size={64} color={theme.textMuted} />
            <Text style={s.emptyText}>{fr ? 'Defi introuvable' : 'Challenge not found'}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  const cfg = CHALLENGE_ICONS[challenge.type] || CHALLENGE_ICONS['10_tirs'];
  const typeLabel = CHALLENGE_LABELS[fr ? 'fr' : 'en'][challenge.type] || challenge.type;
  const is1v1 = challenge.mode === '1v1';
  const isPrecision = challenge.type === 'precision';
  const dateStr = new Date(challenge.date).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = new Date(challenge.date).toLocaleTimeString(fr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  const durationMin = challenge.duration ? Math.floor(challenge.duration / 60) : 0;
  const durationSec = challenge.duration ? challenge.duration % 60 : 0;

  const winnerLabel = is1v1
    ? challenge.winner === 'player' ? (fr ? 'Victoire' : 'Victory') : challenge.winner === 'opponent' ? (fr ? 'Defaite' : 'Defeat') : (fr ? 'Egalite' : 'Draw')
    : null;
  const winnerColor = challenge.winner === 'player' ? theme.success : challenge.winner === 'opponent' ? theme.error : '#F59E0B';

  const scrollContent = (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[s.scroll, { paddingBottom: insets.bottom + 32 }]}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={!isEditing ? <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} /> : undefined}
    >
      {/* Hero Card */}
      <View style={s.heroCard}>
        <View style={[s.heroAccent, { backgroundColor: cfg.color }]} />
        <View style={s.heroContent}>
          <View style={s.heroTopRow}>
            <View style={[s.heroIconCircle, { backgroundColor: cfg.color + '15', borderColor: cfg.color + '35' }]}>
              <MaterialIcons name={cfg.icon as any} size={32} color={cfg.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.heroTitle}>{typeLabel}</Text>
              <View style={s.heroTagsRow}>
                <View style={[s.heroTag, { backgroundColor: is1v1 ? '#EF444415' : '#10B98115' }]}>
                  <MaterialIcons name={is1v1 ? 'people' : 'person'} size={12} color={is1v1 ? '#EF4444' : '#10B981'} />
                  <Text style={[s.heroTagText, { color: is1v1 ? '#EF4444' : '#10B981' }]}>{is1v1 ? '1 vs 1' : 'Solo'}</Text>
                </View>
                {sharedPermission ? <SharedBadge permission={sharedPermission} size="small" /> : null}
                {isEditing ? (
                  <View style={[s.heroTag, { backgroundColor: theme.primary + '15' }]}>
                    <MaterialIcons name="edit" size={12} color={theme.primary} />
                    <Text style={[s.heroTagText, { color: theme.primary }]}>{fr ? 'Edition' : 'Editing'}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          {/* Date & Duration */}
          <View style={s.metaRow}>
            <View style={s.metaPill}>
              <MaterialIcons name="event" size={13} color={theme.primary} />
              <Text style={s.metaPillText}>{dateStr}</Text>
            </View>
            <View style={s.metaPill}>
              <MaterialIcons name="schedule" size={13} color={theme.accent} />
              <Text style={s.metaPillText}>{timeStr}</Text>
            </View>
            {isEditing ? (
              <View style={s.editDurationPill}>
                <MaterialIcons name="timer" size={13} color={theme.warning} />
                <TextInput
                  style={s.editDurationInput}
                  value={editDuration}
                  onChangeText={setEditDuration}
                  keyboardType="number-pad"
                  placeholder="sec"
                  placeholderTextColor={theme.textMuted}
                />
                <Text style={s.editDurationUnit}>sec</Text>
              </View>
            ) : challenge.duration ? (
              <View style={s.metaPill}>
                <MaterialIcons name="timer" size={13} color={theme.warning} />
                <Text style={s.metaPillText}>{durationMin}:{durationSec.toString().padStart(2, '0')}</Text>
              </View>
            ) : null}
          </View>

          {/* 1v1 Winner Banner */}
          {is1v1 && winnerLabel ? (
            <View style={[s.winnerBanner, { backgroundColor: winnerColor + '12', borderColor: winnerColor + '30' }]}>
              <MaterialIcons name={challenge.winner === 'player' ? 'emoji-events' : challenge.winner === 'draw' ? 'handshake' : 'close'} size={24} color={winnerColor} />
              <Text style={[s.winnerText, { color: winnerColor }]}>{winnerLabel}</Text>
            </View>
          ) : null}

          {/* Sponsor badge (challenge-level) */}
          {challenge.sponsorName ? (
            <View style={s.challengeSponsorRow}>
              {challenge.sponsorPhoto ? (
                <Image source={{ uri: challenge.sponsorPhoto }} style={s.challengeSponsorPhoto} contentFit="cover" transition={200} />
              ) : (
                <View style={[s.challengeSponsorPhoto, { backgroundColor: '#7C3AED20', alignItems: 'center', justifyContent: 'center' }]}>
                  <MaterialIcons name="campaign" size={14} color="#7C3AED" />
                </View>
              )}
              <Text style={s.challengeSponsorText}>{fr ? 'Defi par' : 'Challenge by'} <Text style={{ fontWeight: '700' }}>{challenge.sponsorName}</Text></Text>
            </View>
          ) : null}

          {/* Gold Sponsor Badge */}
          {!isEditing && goldSponsor ? (
            <Pressable
              style={({ pressed }) => [s.sponsorBadgeRow, pressed && { opacity: 0.9 }]}
              onPress={() => {
                Haptics.selectionAsync();
                trackAmbassadorEvent(goldSponsor.id, 'profile_view', undefined, { sourcePage: 'challenge_detail' });
                router.push('/partners' as any);
              }}
            >
              <LinearGradient colors={['#FFFBEB', '#FEF3C7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sponsorBadgeGradient}>
                <View style={s.sponsorBadgeAccentLine} />
                <View style={s.sponsorBadgeContent}>
                  {goldSponsor.photo ? (
                    <Image source={{ uri: goldSponsor.photo }} style={s.sponsorBadgeLogo} contentFit="cover" transition={200} cachePolicy="memory-disk" />
                  ) : (
                    <LinearGradient colors={['#B45309', '#F59E0B']} style={s.sponsorBadgeLogoFallback}>
                      <MaterialIcons name="workspace-premium" size={24} color="#FFF" />
                    </LinearGradient>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={s.sponsorBadgeLabel}>{fr ? 'Sponsorise par' : 'Sponsored by'}</Text>
                    <Text style={s.sponsorBadgeName} numberOfLines={1}>{goldSponsor.displayName}</Text>
                  </View>
                  <LinearGradient colors={['#B45309', '#D97706']} style={s.sponsorBadgeTier}>
                    <MaterialIcons name="star" size={10} color="#FFF" />
                  </LinearGradient>
                </View>
              </LinearGradient>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Player Info */}
      <View style={s.card}>
        <Text style={s.cardLabel}>{fr ? 'JOUEUR' : 'PLAYER'}</Text>
        <View style={s.playerRow}>
          <View style={[s.playerDot, { backgroundColor: '#3B82F6' }]} />
          <Text style={s.playerName}>{challenge.playerName || (fr ? 'Moi' : 'Me')}</Text>
        </View>
        {is1v1 && challenge.opponentName ? (
          <>
            <Text style={s.vsText}>VS</Text>
            <View style={s.playerRow}>
              <View style={[s.playerDot, { backgroundColor: '#EF4444' }]} />
              <Text style={s.playerName}>{challenge.opponentName}</Text>
            </View>
          </>
        ) : null}
      </View>

      {/* Quick Share with Opponent (1v1 only) */}
      {!isEditing && is1v1 && challenge.opponentId && !isShared ? (
        <Pressable
          style={[s.quickShareBtn, quickShareState === 'sent' && { borderColor: '#10B98140', backgroundColor: '#F0FDF4' }, quickShareState === 'loading' && { opacity: 0.7 }]}
          onPress={handleQuickShareWithOpponent}
          disabled={quickShareState === 'loading' || quickShareState === 'sent'}
        >
          {quickShareState === 'loading' ? (
            <>
              <ActivityIndicator size="small" color={theme.primary} />
              <Text style={s.quickShareText}>{fr ? 'Detection du compte...' : 'Detecting account...'}</Text>
            </>
          ) : quickShareState === 'sent' ? (
            <>
              <View style={[s.quickShareIconBg, { backgroundColor: '#10B98115' }]}>
                <MaterialIcons name="check-circle" size={20} color="#10B981" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.quickShareTitle, { color: '#10B981' }]}>{fr ? 'Demande envoyee !' : 'Request sent!'}</Text>
                <Text style={s.quickShareSub}>{quickShareCount} {fr ? 'joueur(s) notifie(s)' : 'player(s) notified'}</Text>
              </View>
            </>
          ) : quickShareState === 'no_accounts' ? (
            <>
              <View style={[s.quickShareIconBg, { backgroundColor: '#F59E0B15' }]}>
                <MaterialIcons name="person-off" size={20} color="#F59E0B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.quickShareTitle, { color: '#F59E0B' }]}>{fr ? 'Aucun compte detecte' : 'No account detected'}</Text>
                <Text style={s.quickShareSub}>{fr ? 'L\'adversaire n\'a pas de compte lie' : 'Opponent has no linked account'}</Text>
              </View>
            </>
          ) : quickShareState === 'already_shared' ? (
            <>
              <View style={[s.quickShareIconBg, { backgroundColor: theme.primary + '15' }]}>
                <MaterialIcons name="done-all" size={20} color={theme.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.quickShareTitle, { color: theme.primary }]}>{fr ? 'Deja partage' : 'Already shared'}</Text>
                <Text style={s.quickShareSub}>{fr ? 'L\'adversaire a deja recu une demande' : 'Opponent already received a request'}</Text>
              </View>
            </>
          ) : (
            <>
              <View style={[s.quickShareIconBg, { backgroundColor: '#22C55E15' }]}>
                <MaterialIcons name="group-add" size={20} color="#22C55E" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.quickShareTitle}>{fr ? 'Partager avec l\'adversaire' : 'Share with opponent'}</Text>
                <Text style={s.quickShareSub}>{fr ? 'Envoie automatique si compte detecte' : 'Auto-send if account detected'}</Text>
              </View>
              <View style={s.quickShareArrow}>
                <MaterialIcons name="send" size={16} color="#22C55E" />
              </View>
            </>
          )}
        </Pressable>
      ) : null}

      {/* Witness Attestation Section */}
      {!isEditing ? (
        <AttestationSection
          itemType="challenge"
          itemId={challenge.id}
          snapshotData={{
            type: challenge.type,
            mode: challenge.mode,
            playerName: challenge.playerName,
            opponentName: challenge.opponentName,
            successCount: challenge.successCount,
            totalShots: challenge.totalShots,
            successRate: challenge.successRate,
            totalPoints: challenge.totalPoints,
            winner: challenge.winner,
            date: challenge.date,
          }}
          animDelay={0}
        />
      ) : null}

      {/* Main Stats */}
      <View>
        {isPrecision ? (
          <View style={s.card}>
            <Text style={s.cardLabel}>{fr ? 'RESULTATS PRECISION' : 'PRECISION RESULTS'}</Text>

            {isEditing ? (
              <View style={s.editScoreRow}>
                <TextInput style={s.editScoreBig} value={editTotalPoints} onChangeText={setEditTotalPoints} keyboardType="number-pad" placeholder="0" placeholderTextColor={theme.textMuted} />
                <Text style={s.editScoreSep}>/</Text>
                <Text style={s.editScoreMax}>{challenge.maxPoints || 0} pts</Text>
              </View>
            ) : (
              <View style={s.scoreHero}>
                <Text style={[s.scoreHeroValue, { color: cfg.color }]}>{challenge.totalPoints || 0}</Text>
                <Text style={s.scoreHeroSep}>/</Text>
                <Text style={s.scoreHeroMax}>{challenge.maxPoints || 0}</Text>
                <Text style={s.scoreHeroUnit}>pts</Text>
              </View>
            )}

            {/* Atelier breakdown */}
            {challenge.atelierScores ? (
              <View style={s.atelierList}>
                {Object.entries(challenge.atelierScores).map(([atelierId, score]) => {
                  const atelierCfg = PRECISION_ATELIERS.find(a => a.id === atelierId);
                  if (!atelierCfg) return null;
                  const maxForAtelier = 10;
                  return (
                    <View key={atelierId} style={s.atelierRow}>
                      <View style={[s.atelierIcon, { backgroundColor: cfg.color + '12' }]}>
                        <MaterialIcons name={atelierCfg.icon as any} size={18} color={cfg.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.atelierName}>{atelierCfg.name}</Text>
                        <View style={s.atelierBarTrack}>
                          <View style={[s.atelierBarFill, { width: `${Math.min(100, ((score as number) / maxForAtelier) * 100)}%`, backgroundColor: cfg.color }]} />
                        </View>
                      </View>
                      <Text style={[s.atelierScore, { color: cfg.color }]}>{score}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Precision shots detail — editable in edit mode */}
            {challenge.precisionShots && challenge.precisionShots.length > 0 ? (
              <View style={s.shotsGrid}>
                <Text style={s.shotsGridTitle}>{fr ? 'Detail des tirs' : 'Shot details'}</Text>
                {isEditing ? (
                  <Text style={s.editHintText}>{fr ? 'Appuyez sur un score pour le modifier' : 'Tap a score to change it'}</Text>
                ) : null}
                {challenge.precisionShots.map((shot, i) => {
                  const aCfg = PRECISION_ATELIERS.find(a => a.id === shot.atelier);
                  const pointColor = POINT_COLORS[shot.points] || theme.textMuted;
                  return (
                    <View key={i} style={s.precisionShotRow}>
                      <Text style={s.precisionShotIdx}>{i + 1}</Text>
                      <MaterialIcons name={(aCfg?.icon || 'radio-button-checked') as any} size={14} color={theme.textSecondary} />
                      <Text style={s.precisionShotAtelier} numberOfLines={1}>{aCfg?.name || shot.atelier}</Text>
                      <Text style={s.precisionShotDist}>{shot.distance}m</Text>
                      {isEditing ? (
                        <View style={s.editPointsRow}>
                          {([0, 1, 3, 5] as const).map(p => (
                            <Pressable
                              key={p}
                              style={[s.editPointChip, shot.points === p && { backgroundColor: POINT_COLORS[p], borderColor: POINT_COLORS[p] }]}
                              onPress={() => handlePrecisionPoints(i, p)}
                            >
                              <Text style={[s.editPointChipText, shot.points === p && { color: '#FFF' }]}>{p}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : (
                        <View style={[s.precisionShotPts, { backgroundColor: pointColor + '15' }]}>
                          <Text style={[s.precisionShotPtsText, { color: pointColor }]}>{shot.points}pts</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {/* Opponent precision result */}
            {is1v1 && challenge.opponentResult ? (
              <View style={s.opponentCard}>
                <View style={s.opponentHeader}>
                  <View style={[s.playerDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={s.opponentName}>{challenge.opponentResult.playerName}</Text>
                </View>
                <View style={s.opponentStatsRow}>
                  <View style={s.opponentStat}>
                    <Text style={s.opponentStatValue}>{challenge.opponentResult.totalPoints || 0}</Text>
                    <Text style={s.opponentStatLabel}>pts</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        ) : (
          /* 10 Tirs / 10 Tirs Sautee Stats */
          <View style={s.card}>
            <Text style={s.cardLabel}>{fr ? 'RESULTATS' : 'RESULTS'}</Text>

            {isEditing ? (
              <View style={s.editStatsGrid}>
                <View style={s.editStatCard}>
                  <Text style={s.editStatLabel}>{fr ? 'Reussis' : 'Success'}</Text>
                  <TextInput style={[s.editStatInput, { color: theme.success }]} value={editSuccessCount} onChangeText={setEditSuccessCount} keyboardType="number-pad" placeholder="0" placeholderTextColor={theme.textMuted} />
                  <Text style={s.editStatMax}>/ {challenge.totalShots || 10}</Text>
                </View>
                <View style={s.editStatCard}>
                  <Text style={s.editStatLabel}>Carreaux</Text>
                  <TextInput style={[s.editStatInput, { color: '#F59E0B' }]} value={editCarreauCount} onChangeText={setEditCarreauCount} keyboardType="number-pad" placeholder="0" placeholderTextColor={theme.textMuted} />
                </View>
              </View>
            ) : (
              <>
                <View style={s.statsGrid}>
                  <View style={s.statCard}>
                    <Text style={[s.statValue, { color: theme.success }]}>{challenge.successCount || 0}</Text>
                    <Text style={s.statLabel}>{fr ? 'Reussis' : 'Success'}</Text>
                  </View>
                  <View style={s.statCard}>
                    <Text style={s.statValue}>{challenge.totalShots || 0}</Text>
                    <Text style={s.statLabel}>Total</Text>
                  </View>
                  <View style={s.statCard}>
                    <Text style={[s.statValue, { color: cfg.color }]}>{challenge.successRate != null ? `${Math.round(challenge.successRate)}%` : '-'}</Text>
                    <Text style={s.statLabel}>{fr ? 'Reussite' : 'Rate'}</Text>
                  </View>
                  <View style={s.statCard}>
                    <Text style={[s.statValue, { color: '#F59E0B' }]}>{challenge.carreauCount || 0}</Text>
                    <Text style={s.statLabel}>Carreaux</Text>
                  </View>
                </View>

                {challenge.successRate != null ? (
                  <View style={s.rateBarWrap}>
                    <View style={s.rateBarTrack}>
                      <View style={[s.rateBarFill, { width: `${Math.min(100, challenge.successRate)}%`, backgroundColor: cfg.color }]} />
                    </View>
                    <View style={s.rateBarLabels}>
                      <Text style={[s.rateBarLabel, { color: cfg.color }]}>{challenge.successCount || 0} {fr ? 'reussis' : 'hits'}</Text>
                      <Text style={[s.rateBarLabel, { color: theme.error }]}>{(challenge.totalShots || 0) - (challenge.successCount || 0)} {fr ? 'rates' : 'missed'}</Text>
                    </View>
                  </View>
                ) : null}
              </>
            )}

            {/* Shot-by-shot grid — interactive in edit mode */}
            {challenge.shots && challenge.shots.length > 0 ? (
              <View style={s.shotGrid}>
                <Text style={s.shotsGridTitle}>{fr ? 'Tir par tir' : 'Shot by shot'}</Text>
                {isEditing ? (
                  <Text style={s.editHintText}>{fr ? 'Appuyez pour basculer reussi/rate • Appui long pour carreau' : 'Tap to toggle hit/miss • Long press for carreau'}</Text>
                ) : null}
                <View style={s.shotDotsRow}>
                  {challenge.shots.map((shot, i) => (
                    <Pressable
                      key={i}
                      style={[
                        s.shotDot,
                        shot.success
                          ? shot.carreau ? { backgroundColor: '#F59E0B' } : { backgroundColor: theme.success }
                          : { backgroundColor: theme.error },
                        isEditing && s.shotDotEditable,
                      ]}
                      onPress={isEditing ? () => handleToggleShot(i) : undefined}
                      onLongPress={isEditing ? () => handleToggleCarreau(i) : undefined}
                      disabled={!isEditing}
                    >
                      <Text style={s.shotDotText}>{i + 1}</Text>
                      {shot.carreau ? <MaterialIcons name="star" size={8} color="#FFF" style={s.shotDotStar} /> : null}
                    </Pressable>
                  ))}
                </View>
                <View style={s.shotLegend}>
                  <View style={s.shotLegendItem}>
                    <View style={[s.shotLegendDot, { backgroundColor: theme.success }]} />
                    <Text style={s.shotLegendText}>{fr ? 'Reussi' : 'Hit'}</Text>
                  </View>
                  <View style={s.shotLegendItem}>
                    <View style={[s.shotLegendDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={s.shotLegendText}>Carreau</Text>
                  </View>
                  <View style={s.shotLegendItem}>
                    <View style={[s.shotLegendDot, { backgroundColor: theme.error }]} />
                    <Text style={s.shotLegendText}>{fr ? 'Rate' : 'Missed'}</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* Opponent result (1v1 tirs) */}
            {is1v1 && challenge.opponentResult ? (
              <View style={s.opponentCard}>
                <View style={s.opponentHeader}>
                  <View style={[s.playerDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={s.opponentName}>{challenge.opponentResult.playerName}</Text>
                </View>
                <View style={s.opponentStatsRow}>
                  <View style={s.opponentStat}>
                    <Text style={s.opponentStatValue}>{challenge.opponentResult.successCount || 0}/{challenge.opponentResult.totalShots || 0}</Text>
                    <Text style={s.opponentStatLabel}>{fr ? 'Reussis' : 'Hits'}</Text>
                  </View>
                  <View style={s.opponentStatDivider} />
                  <View style={s.opponentStat}>
                    <Text style={s.opponentStatValue}>{challenge.opponentResult.successRate != null ? `${Math.round(challenge.opponentResult.successRate)}%` : '-'}</Text>
                    <Text style={s.opponentStatLabel}>{fr ? 'Taux' : 'Rate'}</Text>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        )}
      </View>

      {/* Notes */}
      <View style={s.card}>
        <Text style={s.cardLabel}>NOTES</Text>
        {isEditing ? (
          <TextInput
            style={s.editNotesInput}
            value={editNotes}
            onChangeText={setEditNotes}
            placeholder={fr ? 'Ajouter des notes...' : 'Add notes...'}
            placeholderTextColor={theme.textMuted}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        ) : challenge.notes ? (
          <View style={s.notesBox}>
            <MaterialIcons name="notes" size={16} color={theme.textMuted} />
            <Text style={s.notesText}>{challenge.notes}</Text>
          </View>
        ) : (
          <Text style={s.emptyNotes}>{fr ? 'Aucune note' : 'No notes'}</Text>
        )}
      </View>

      {/* Action Buttons */}
      <View>
        {isEditing ? (
          <View style={s.editActionRow}>
            <Pressable style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.85 }]} onPress={cancelEdit}>
              <MaterialIcons name="close" size={18} color={theme.textSecondary} />
              <Text style={s.cancelBtnText}>{fr ? 'Annuler' : 'Cancel'}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [s.saveBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={handleSave} disabled={saving}>
              <MaterialIcons name="check" size={18} color="#FFF" />
              <Text style={s.saveBtnText}>{saving ? '...' : (fr ? 'Enregistrer' : 'Save')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.actionsColumn}>
            {/* Edit button */}
            {!isReadOnly ? (
              <Pressable style={({ pressed }) => [s.editCta, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={enterEditMode}>
                <MaterialIcons name="edit" size={20} color="#FFF" />
                <Text style={s.editCtaText}>{fr ? 'Modifier le defi' : 'Edit challenge'}</Text>
              </Pressable>
            ) : null}

            {/* Share CTA */}
            <Pressable style={({ pressed }) => [s.shareCta, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={() => { Haptics.selectionAsync(); setShowShareModal(true); }}>
              <MaterialIcons name="share" size={20} color="#FFF" />
              <Text style={s.shareCtaText}>{fr ? 'Partager ce defi' : 'Share this challenge'}</Text>
            </Pressable>



            {/* Delete */}
            {!isReadOnly && !isShared ? (
              <Pressable style={({ pressed }) => [s.deleteCta, pressed && { opacity: 0.85 }]} onPress={handleDelete}>
                <MaterialIcons name="delete-outline" size={18} color={theme.error} />
                <Text style={s.deleteCtaText}>{fr ? 'Supprimer' : 'Delete'}</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => { if (isEditing) { cancelEdit(); } else { router.back(); } }}>
          <MaterialIcons name={isEditing ? 'close' : 'arrow-back'} size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{isEditing ? (fr ? 'Modifier' : 'Edit') : (fr ? 'Detail du defi' : 'Challenge detail')}</Text>
        {isEditing ? (
          <Pressable style={s.headerSaveBtn} onPress={handleSave} disabled={saving}>
            <Text style={s.headerSaveBtnText}>{saving ? '...' : (fr ? 'Enregistrer' : 'Save')}</Text>
          </Pressable>
        ) : (
          <Pressable style={s.shareBtn} onPress={() => { Haptics.selectionAsync(); setShowShareModal(true); }}>
            <MaterialIcons name="share" size={20} color={theme.success} />
          </Pressable>
        )}
      </View>

      {isEditing ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          {scrollContent}
        </KeyboardAvoidingView>
      ) : scrollContent}

      <ShareModal
        visible={showShareModal}
        onClose={() => setShowShareModal(false)}
        itemType="challenge"
        itemId={challenge.id}
        itemName={`${typeLabel} - ${challenge.playerName || ''}`}
      />

      <EditConflictModal
        visible={showConflict}
        diffs={conflictDiffs}
        language={language}
        onKeepMine={handleConflictKeepMine}
        onKeepTheirs={handleConflictKeepTheirs}
        onCancel={handleConflictCancel}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  shareBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.primary, borderRadius: 12 },
  headerSaveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 16, color: theme.textMuted, marginTop: 12 },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },

  // Hero
  heroCard: { backgroundColor: theme.surface, borderRadius: 20, marginBottom: 14, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 }, android: { elevation: 4 }, default: {} }) },
  heroAccent: { height: 5, width: '100%' },
  heroContent: { padding: 18 },
  heroTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 14 },
  heroIconCircle: { width: 60, height: 60, borderRadius: 18, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 22, fontWeight: '800', color: theme.textPrimary, letterSpacing: -0.3 },
  heroTagsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  heroTag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  heroTagText: { fontSize: 12, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  metaPillText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },

  // Edit duration pill
  editDurationPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 20, borderWidth: 1.5, borderColor: theme.warning + '40' },
  editDurationInput: { fontSize: 13, fontWeight: '700', color: theme.textPrimary, minWidth: 40, paddingVertical: 4, textAlign: 'center' },
  editDurationUnit: { fontSize: 11, fontWeight: '600', color: theme.textMuted },

  // Winner banner
  winnerBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5, marginBottom: 14 },
  winnerText: { fontSize: 18, fontWeight: '800' },

  // Challenge-level sponsor
  challengeSponsorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#7C3AED08', borderRadius: 12, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: '#7C3AED15' },
  challengeSponsorPhoto: { width: 28, height: 28, borderRadius: 8, overflow: 'hidden' },
  challengeSponsorText: { flex: 1, fontSize: 12, color: theme.textSecondary },

  // Gold Sponsor Badge
  sponsorBadgeRow: { marginBottom: 14, borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, borderColor: '#F59E0B' },
  sponsorBadgeGradient: { borderRadius: 12, position: 'relative' },
  sponsorBadgeAccentLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 2.5, backgroundColor: '#F59E0B', borderTopLeftRadius: 12, borderTopRightRadius: 12 },
  sponsorBadgeContent: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, gap: 10 },
  sponsorBadgeLogo: { width: 64, height: 64, borderRadius: 18, overflow: 'hidden' },
  sponsorBadgeLogoFallback: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  sponsorBadgeLabel: { fontSize: 9, fontWeight: '600', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5 },
  sponsorBadgeName: { fontSize: 14, fontWeight: '700', color: '#78350F', marginTop: 1 },
  sponsorBadgeTier: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },

  // Card
  card: { backgroundColor: theme.surface, borderRadius: 18, padding: 18, marginBottom: 14, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  cardLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 1, marginBottom: 12 },

  // Player
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  playerDot: { width: 10, height: 10, borderRadius: 5 },
  playerName: { fontSize: 16, fontWeight: '600', color: theme.textPrimary },
  vsText: { fontSize: 13, fontWeight: '800', color: theme.textMuted, textAlign: 'center', marginVertical: 6 },

  // Stats grid (10 tirs) — read mode
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  statCard: { flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '900', color: theme.textPrimary },
  statLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted, marginTop: 2, textTransform: 'uppercase' },

  // Edit stats grid
  editStatsGrid: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  editStatCard: { flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1.5, borderColor: theme.border },
  editStatLabel: { fontSize: 10, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', marginBottom: 6 },
  editStatInput: { fontSize: 28, fontWeight: '900', textAlign: 'center', minWidth: 60, paddingVertical: 4 },
  editStatMax: { fontSize: 12, fontWeight: '600', color: theme.textMuted, marginTop: 4 },

  // Edit score row (precision)
  editScoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 18 },
  editScoreBig: { fontSize: 44, fontWeight: '900', color: '#7C3AED', textAlign: 'center', minWidth: 80, paddingVertical: 4, backgroundColor: theme.backgroundSecondary, borderRadius: 14, borderWidth: 1.5, borderColor: '#7C3AED30' },
  editScoreSep: { fontSize: 28, fontWeight: '300', color: theme.textMuted },
  editScoreMax: { fontSize: 20, fontWeight: '600', color: theme.textSecondary },

  // Edit hint
  editHintText: { fontSize: 11, fontWeight: '500', color: theme.textMuted, fontStyle: 'italic', marginBottom: 10 },

  // Edit points row for precision shots
  editPointsRow: { flexDirection: 'row', gap: 4 },
  editPointChip: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.backgroundSecondary, borderWidth: 1.5, borderColor: theme.border },
  editPointChipText: { fontSize: 12, fontWeight: '800', color: theme.textSecondary },

  // Rate bar
  rateBarWrap: { marginBottom: 14 },
  rateBarTrack: { height: 8, backgroundColor: theme.error + '25', borderRadius: 4, overflow: 'hidden' },
  rateBarFill: { height: '100%', borderRadius: 4 },
  rateBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  rateBarLabel: { fontSize: 11, fontWeight: '600' },

  // Shot dots
  shotGrid: { marginBottom: 4 },
  shotsGridTitle: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, marginBottom: 10 },
  shotDotsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  shotDot: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  shotDotEditable: { borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  shotDotText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  shotDotStar: { position: 'absolute', top: -2, right: -2 },
  shotLegend: { flexDirection: 'row', gap: 16, paddingTop: 4 },
  shotLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  shotLegendDot: { width: 10, height: 10, borderRadius: 5 },
  shotLegendText: { fontSize: 11, color: theme.textMuted, fontWeight: '500' },

  // Precision
  scoreHero: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginBottom: 18, gap: 2 },
  scoreHeroValue: { fontSize: 48, fontWeight: '900' },
  scoreHeroSep: { fontSize: 28, fontWeight: '300', color: theme.textMuted },
  scoreHeroMax: { fontSize: 28, fontWeight: '600', color: theme.textSecondary },
  scoreHeroUnit: { fontSize: 14, fontWeight: '600', color: theme.textMuted, marginLeft: 4 },

  atelierList: { gap: 12, marginBottom: 16 },
  atelierRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  atelierIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  atelierName: { fontSize: 13, fontWeight: '600', color: theme.textPrimary, marginBottom: 4 },
  atelierBarTrack: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden' },
  atelierBarFill: { height: '100%', borderRadius: 3 },
  atelierScore: { fontSize: 18, fontWeight: '800', minWidth: 30, textAlign: 'right' },

  shotsGrid: { marginTop: 4 },
  precisionShotRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  precisionShotIdx: { width: 22, fontSize: 12, fontWeight: '700', color: theme.textMuted, textAlign: 'center' },
  precisionShotAtelier: { flex: 1, fontSize: 12, fontWeight: '500', color: theme.textSecondary },
  precisionShotDist: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  precisionShotPts: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  precisionShotPtsText: { fontSize: 12, fontWeight: '800' },

  // Opponent
  opponentCard: { backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 14, marginTop: 14 },
  opponentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  opponentName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  opponentStatsRow: { flexDirection: 'row', alignItems: 'center' },
  opponentStat: { flex: 1, alignItems: 'center' },
  opponentStatValue: { fontSize: 22, fontWeight: '800', color: theme.textPrimary },
  opponentStatLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted, marginTop: 2 },
  opponentStatDivider: { width: 1, height: 24, backgroundColor: theme.border },

  // Notes
  notesBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 14 },
  notesText: { flex: 1, fontSize: 14, color: theme.textSecondary, lineHeight: 20 },
  emptyNotes: { fontSize: 13, color: theme.textMuted, fontStyle: 'italic' },
  editNotesInput: { fontSize: 14, color: theme.textPrimary, backgroundColor: theme.backgroundSecondary, borderRadius: 12, padding: 14, minHeight: 100, borderWidth: 1.5, borderColor: theme.border, lineHeight: 20 },

  // Actions
  actionsColumn: { gap: 10, marginBottom: 8 },
  editCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 18, borderRadius: 18, ...Platform.select({ ios: { shadowColor: theme.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 }, android: { elevation: 4 }, default: {} }) },
  editCtaText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  shareCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.success, paddingVertical: 16, borderRadius: 18, ...Platform.select({ ios: { shadowColor: theme.success, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 }, android: { elevation: 3 }, default: {} }) },
  shareCtaText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  deleteCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 16, backgroundColor: theme.error + '10', borderWidth: 1, borderColor: theme.error + '25' },
  deleteCtaText: { fontSize: 14, fontWeight: '600', color: theme.error },

  // Quick share
  quickShareBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 14, borderWidth: 1.5, borderColor: '#22C55E30', ...Platform.select({ ios: { shadowColor: '#22C55E', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  quickShareIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center' as const, justifyContent: 'center' as const },
  quickShareTitle: { fontSize: 14, fontWeight: '700' as const, color: theme.textPrimary },
  quickShareSub: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  quickShareText: { fontSize: 13, fontWeight: '600' as const, color: theme.textSecondary },
  quickShareArrow: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#22C55E12', alignItems: 'center' as const, justifyContent: 'center' as const },

  // Edit action row
  editActionRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16, backgroundColor: theme.backgroundSecondary, borderRadius: 18, borderWidth: 1.5, borderColor: theme.border },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  saveBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16, backgroundColor: theme.primary, borderRadius: 18, ...Platform.select({ ios: { shadowColor: theme.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 }, android: { elevation: 4 }, default: {} }) },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
