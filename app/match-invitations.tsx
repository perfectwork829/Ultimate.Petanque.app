import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import {
  getReceivedShareRequests,
  acceptShareRequest,
  declineShareRequest,
  markShareRequestsSeen,
  MatchShareRequest,
} from '@/services/matchShareService';

export default function MatchInvitationsScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const fr = language === 'fr';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<MatchShareRequest[]>([]);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const loadRequests = useCallback(async () => {
    const { requests: data } = await getReceivedShareRequests();
    setRequests(data);
    // Mark all loaded requests as seen so we don't re-notify
    if (data.length > 0) {
      markShareRequestsSeen(data.map(r => r.id));
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    loadRequests().finally(() => setLoading(false));
  }, [user?.id, loadRequests]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadRequests();
    setRefreshing(false);
  }, [loadRequests]);

  const handleAccept = useCallback(async (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setProcessingIds(prev => new Set(prev).add(id));
    const { error } = await acceptShareRequest(id);
    if (!error) {
      setRequests(prev => prev.map(r => (r.id === id ? { ...r, status: 'accepted' } : r)));
    }
    setProcessingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const handleDecline = useCallback(async (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setProcessingIds(prev => new Set(prev).add(id));
    const { error } = await declineShareRequest(id);
    if (!error) {
      setRequests(prev => prev.map(r => (r.id === id ? { ...r, status: 'declined' } : r)));
    }
    setProcessingIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const handledRequests = requests.filter(r => r.status !== 'pending');

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(fr ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderRequest = (req: MatchShareRequest, index: number) => {
    const isProcessing = processingIds.has(req.id);
    const isMatch = req.itemType === 'match';
    const isPending = req.status === 'pending';
    const isAccepted = req.status === 'accepted';
    const isDeclined = req.status === 'declined';

    return (
      <Animated.View
        key={req.id}
        entering={FadeInDown.duration(300).delay(index * 60)}
      >
        <View
          style={[
            s.requestCard,
            isAccepted && s.requestCardAccepted,
            isDeclined && s.requestCardDeclined,
          ]}
        >
          {/* Header row */}
          <View style={s.requestHeader}>
            <View
              style={[
                s.requestTypeIcon,
                {
                  backgroundColor: isMatch
                    ? theme.primary + '15'
                    : theme.accent + '15',
                },
              ]}
            >
              <MaterialIcons
                name={isMatch ? 'sports' : 'gps-fixed'}
                size={20}
                color={isMatch ? theme.primary : theme.accent}
              />
            </View>
            <View style={s.requestHeaderInfo}>
              <Text style={s.requestType}>
                {isMatch
                  ? fr
                    ? 'Match partage'
                    : 'Shared match'
                  : fr
                  ? 'Defi partage'
                  : 'Shared challenge'}
              </Text>
              <Text style={s.requestDate}>{formatDate(req.createdAt)}</Text>
            </View>
            <View
              style={[
                s.permBadge,
                {
                  backgroundColor:
                    req.permission === 'write'
                      ? theme.accent + '15'
                      : theme.primary + '15',
                },
              ]}
            >
              <MaterialIcons
                name={req.permission === 'write' ? 'edit' : 'visibility'}
                size={12}
                color={
                  req.permission === 'write' ? theme.accent : theme.primary
                }
              />
              <Text
                style={[
                  s.permText,
                  {
                    color:
                      req.permission === 'write'
                        ? theme.accent
                        : theme.primary,
                  },
                ]}
              >
                {req.permission === 'write'
                  ? fr
                    ? 'Modification'
                    : 'Edit'
                  : fr
                  ? 'Lecture'
                  : 'Read only'}
              </Text>
            </View>
          </View>

          {/* Sender info */}
          <View style={s.senderRow}>
            <View style={s.senderAvatar}>
              <Text style={s.senderAvatarText}>
                {(req.senderName || '?')
                  .split(' ')
                  .map(n => n[0])
                  .join('')}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.senderName}>{req.senderName || (fr ? 'Joueur' : 'Player')}</Text>
              <Text style={s.senderLabel}>
                {fr ? 'vous a envoye une invitation' : 'sent you an invitation'}
              </Text>
            </View>
          </View>

          {/* Match/Challenge summary */}
          {req.itemSummary ? (
            <View style={s.summaryRow}>
              <MaterialIcons name="info-outline" size={14} color={theme.textMuted} />
              <Text style={s.summaryText} numberOfLines={2}>
                {req.itemSummary}
              </Text>
            </View>
          ) : null}

          {/* Status / Actions */}
          {isPending ? (
            <View style={s.actions}>
              <Pressable
                style={s.declineBtn}
                onPress={() => handleDecline(req.id)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color={theme.error} />
                ) : (
                  <>
                    <MaterialIcons name="close" size={18} color={theme.error} />
                    <Text style={s.declineBtnText}>
                      {fr ? 'Refuser' : 'Decline'}
                    </Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={s.acceptBtn}
                onPress={() => handleAccept(req.id)}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="check" size={18} color="#FFF" />
                    <Text style={s.acceptBtnText}>
                      {fr ? 'Accepter' : 'Accept'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={s.statusRow}>
              <MaterialIcons
                name={isAccepted ? 'check-circle' : 'cancel'}
                size={16}
                color={isAccepted ? theme.success : theme.textMuted}
              />
              <Text
                style={[
                  s.statusText,
                  { color: isAccepted ? theme.success : theme.textMuted },
                ]}
              >
                {isAccepted
                  ? fr
                    ? 'Accepte'
                    : 'Accepted'
                  : fr
                  ? 'Refuse'
                  : 'Declined'}
              </Text>
            </View>
          )}
        </View>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle}>
            {fr ? 'Invitations de partage' : 'Share Invitations'}
          </Text>
          {pendingRequests.length > 0 ? (
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeText}>{pendingRequests.length}</Text>
            </View>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          style={s.scrollView}
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
        >
          {requests.length === 0 ? (
            <Animated.View entering={FadeIn.duration(400)} style={s.emptyState}>
              <View style={s.emptyIcon}>
                <MaterialIcons name="mail-outline" size={56} color={theme.textMuted} />
              </View>
              <Text style={s.emptyTitle}>
                {fr ? 'Aucune invitation' : 'No invitations'}
              </Text>
              <Text style={s.emptySub}>
                {fr
                  ? 'Quand un joueur partagera un match ou un defi avec vous, il apparaitra ici.'
                  : 'When a player shares a match or challenge with you, it will appear here.'}
              </Text>
            </Animated.View>
          ) : (
            <>
              {/* Pending section */}
              {pendingRequests.length > 0 ? (
                <>
                  <Text style={s.sectionTitle}>
                    {fr ? 'EN ATTENTE' : 'PENDING'} ({pendingRequests.length})
                  </Text>
                  {pendingRequests.map((req, i) => renderRequest(req, i))}
                </>
              ) : null}

              {/* Handled section */}
              {handledRequests.length > 0 ? (
                <>
                  <Text style={[s.sectionTitle, { marginTop: pendingRequests.length > 0 ? 24 : 0 }]}>
                    {fr ? 'TRAITEES' : 'HANDLED'} ({handledRequests.length})
                  </Text>
                  {handledRequests.map((req, i) =>
                    renderRequest(req, pendingRequests.length + i)
                  )}
                </>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  headerBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  headerBadgeText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textMuted,
    letterSpacing: 1,
    marginBottom: 12,
    paddingLeft: 4,
  },
  // Empty state
  emptyState: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.border + '30',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  emptySub: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  // Request card
  requestCard: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: theme.border,
    ...theme.shadows.card,
  },
  requestCardAccepted: { borderColor: theme.success + '30', backgroundColor: theme.success + '03' },
  requestCardDeclined: { borderColor: theme.textMuted + '20', opacity: 0.7 },
  requestHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  requestTypeIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestHeaderInfo: { flex: 1 },
  requestType: { fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  requestDate: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  permBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  permText: { fontSize: 11, fontWeight: '700' },
  // Sender
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  senderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderAvatarText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  senderName: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  senderLabel: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
  // Summary
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  summaryText: { flex: 1, fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
  // Actions
  actions: { flexDirection: 'row', gap: 10 },
  declineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.error + '10',
    borderWidth: 1.5,
    borderColor: theme.error + '25',
  },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: theme.error },
  acceptBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.success,
  },
  acceptBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  // Status
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  statusText: { fontSize: 13, fontWeight: '600' },
});
