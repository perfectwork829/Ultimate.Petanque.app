/**
 * ShareRequestModal - Post-save popup to send share requests to linked players.
 * Detects which players in a match/challenge have linked user accounts and
 * lets the user choose permission (read/write) before sending share requests.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, ActivityIndicator, Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { detectLinkedPlayers, createShareRequests } from '@/services/matchShareService';
import { useAuth } from '@/template';

interface LinkedPlayer {
  playerId: string;
  playerName: string;
  userId: string;
  email: string;
  permission: 'read' | 'write';
  selected: boolean;
}

interface ShareRequestModalProps {
  visible: boolean;
  onClose: () => void;
  itemType: 'match' | 'challenge';
  itemId: string | null;
  playerIds: string[];
  senderName: string;
  itemSummary?: string;
  language?: string;
  /** Team player IDs for wrong-share detection */
  matchPlayerIds?: string[];
}

export default function ShareRequestModal({
  visible,
  onClose,
  itemType,
  itemId,
  playerIds,
  senderName,
  itemSummary,
  language = 'fr',
  matchPlayerIds,
}: ShareRequestModalProps) {
  const { user } = useAuth();
  const fr = language === 'fr';
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [linkedPlayers, setLinkedPlayers] = useState<LinkedPlayer[]>([]);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!visible || !itemId || playerIds.length === 0) {
      setLinkedPlayers([]);
      setLoading(false);
      setSent(false);
      return;
    }

    setLoading(true);
    setSent(false);
    detectLinkedPlayers(playerIds, user?.id).then(({ linkedPlayers: linked }) => {
      setLinkedPlayers(
        linked.map(p => ({
          ...p,
          permission: 'read' as const,
          selected: true,
        }))
      );
      setLoading(false);
    });
  }, [visible, itemId, playerIds, user?.id]);

  const togglePlayer = useCallback((userId: string) => {
    Haptics.selectionAsync();
    setLinkedPlayers(prev =>
      prev.map(p => (p.userId === userId ? { ...p, selected: !p.selected } : p))
    );
  }, []);

  const togglePermission = useCallback((userId: string) => {
    Haptics.selectionAsync();
    setLinkedPlayers(prev =>
      prev.map(p =>
        p.userId === userId
          ? { ...p, permission: p.permission === 'read' ? 'write' : 'read' }
          : p
      )
    );
  }, []);

  const [showNonParticipantWarning, setShowNonParticipantWarning] = useState(false);
  const [nonParticipantNames, setNonParticipantNames] = useState<string[]>([]);

  const doSend = useCallback(async () => {
    if (!itemId || !user?.id) return;
    const selected = linkedPlayers.filter(p => p.selected);
    if (selected.length === 0) {
      onClose();
      return;
    }

    setSending(true);
    const { error } = await createShareRequests({
      itemType,
      itemId,
      senderUserId: user.id,
      senderName,
      recipients: selected.map(p => ({ userId: p.userId, permission: p.permission })),
      itemSummary,
    });

    setSending(false);
    if (!error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSent(true);
      setTimeout(onClose, 1200);
    } else {
      onClose();
    }
  }, [itemId, user?.id, linkedPlayers, itemType, senderName, itemSummary, onClose]);

  const handleSend = useCallback(async () => {
    if (!itemId || !user?.id) return;
    const selected = linkedPlayers.filter(p => p.selected);
    if (selected.length === 0) {
      onClose();
      return;
    }

    // Check for non-participant recipients
    if (matchPlayerIds && matchPlayerIds.length > 0) {
      const nonParticipants = selected.filter(p => !matchPlayerIds.includes(p.playerId));
      if (nonParticipants.length > 0) {
        setNonParticipantNames(nonParticipants.map(p => p.playerName));
        setShowNonParticipantWarning(true);
        return;
      }
    }

    await doSend();
  }, [itemId, user?.id, linkedPlayers, matchPlayerIds, onClose, doSend]);

  const selectedCount = linkedPlayers.filter(p => p.selected).length;
  const hasLinkedPlayers = linkedPlayers.length > 0;

  // Auto-close if no linked players found
  useEffect(() => {
    if (!loading && !hasLinkedPlayers && visible) {
      onClose();
    }
  }, [loading, hasLinkedPlayers, visible, onClose]);

  if (!visible || (!loading && !hasLinkedPlayers)) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.modal}>
          {/* Header */}
          <View style={s.header}>
            <View style={[s.headerIcon, { backgroundColor: theme.primary + '15' }]}>
              <MaterialIcons name="group-add" size={22} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>
                {fr ? 'Partager avec les joueurs' : 'Share with players'}
              </Text>
              <Text style={s.headerSub}>
                {fr
                  ? 'Des joueurs de cette partie ont un compte. Envoyer une demande de partage ?'
                  : 'Some players in this game have an account. Send a share request?'}
              </Text>
            </View>
            <Pressable style={s.closeBtn} onPress={onClose} hitSlop={8}>
              <MaterialIcons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>

          {/* Content */}
          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={s.loadingText}>
                {fr ? 'Detection des comptes...' : 'Detecting accounts...'}
              </Text>
            </View>
          ) : sent ? (
            <View style={s.sentWrap}>
              <MaterialIcons name="check-circle" size={56} color={theme.success} />
              <Text style={s.sentTitle}>
                {fr ? 'Demandes envoyees !' : 'Requests sent!'}
              </Text>
              <Text style={s.sentSub}>
                {fr
                  ? `${selectedCount} joueur(s) recevront une notification`
                  : `${selectedCount} player(s) will receive a notification`}
              </Text>
            </View>
          ) : (
            <>
              {/* Player List */}
              <View style={s.playerList}>
                {linkedPlayers.map(p => (
                  <View key={p.userId} style={[s.playerRow, !p.selected && s.playerRowDisabled]}>
                    <Pressable style={s.playerCheckbox} onPress={() => togglePlayer(p.userId)}>
                      <MaterialIcons
                        name={p.selected ? 'check-box' : 'check-box-outline-blank'}
                        size={22}
                        color={p.selected ? theme.primary : theme.textMuted}
                      />
                    </Pressable>
                    <View style={s.playerAvatar}>
                      <Text style={s.playerAvatarText}>
                        {p.playerName
                          .split(' ')
                          .map(n => n[0])
                          .join('')}
                      </Text>
                    </View>
                    <View style={s.playerInfo}>
                      <Text style={s.playerName} numberOfLines={1}>
                        {p.playerName}
                      </Text>
                      <Text style={s.playerEmail} numberOfLines={1}>
                        {p.email || (fr ? 'Compte lie' : 'Linked account')}
                      </Text>
                    </View>
                    {p.selected ? (
                      <Pressable
                        style={[
                          s.permBadge,
                          {
                            backgroundColor:
                              p.permission === 'write'
                                ? theme.accent + '15'
                                : theme.primary + '15',
                          },
                        ]}
                        onPress={() => togglePermission(p.userId)}
                      >
                        <MaterialIcons
                          name={p.permission === 'write' ? 'edit' : 'visibility'}
                          size={14}
                          color={
                            p.permission === 'write' ? theme.accent : theme.primary
                          }
                        />
                        <Text
                          style={[
                            s.permText,
                            {
                              color:
                                p.permission === 'write'
                                  ? theme.accent
                                  : theme.primary,
                            },
                          ]}
                        >
                          {p.permission === 'write'
                            ? fr
                              ? 'Modif.'
                              : 'Edit'
                            : fr
                            ? 'Lecture'
                            : 'Read'}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                ))}
              </View>

              {/* Permission Legend */}
              <View style={s.legendRow}>
                <View style={s.legendItem}>
                  <MaterialIcons name="visibility" size={12} color={theme.primary} />
                  <Text style={s.legendText}>
                    {fr ? 'Lecture = voir le match' : 'Read = view the match'}
                  </Text>
                </View>
                <View style={s.legendItem}>
                  <MaterialIcons name="edit" size={12} color={theme.accent} />
                  <Text style={s.legendText}>
                    {fr ? 'Modif. = voir et modifier' : 'Edit = view and modify'}
                  </Text>
                </View>
              </View>

              {/* Non-participant Warning */}
              {showNonParticipantWarning ? (
                <View style={s.warningBanner}>
                  <View style={s.warningIconBg}>
                    <MaterialIcons name="warning" size={18} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.warningTitle}>
                      {fr ? 'Joueur(s) non-participant(s)' : 'Non-participant player(s)'}
                    </Text>
                    <Text style={s.warningText}>
                      {nonParticipantNames.join(', ')}{' '}
                      {fr
                        ? 'ne fait pas partie de ce match. Ses stats et ELO ne seront PAS mis a jour.'
                        : 'is not part of this match. Their stats and ELO will NOT be updated.'}
                    </Text>
                    <View style={s.warningActions}>
                      <Pressable
                        style={s.warningCancelBtn}
                        onPress={() => setShowNonParticipantWarning(false)}
                      >
                        <Text style={s.warningCancelText}>{fr ? 'Modifier' : 'Edit'}</Text>
                      </Pressable>
                      <Pressable
                        style={s.warningConfirmBtn}
                        onPress={() => {
                          setShowNonParticipantWarning(false);
                          doSend();
                        }}
                      >
                        <Text style={s.warningConfirmText}>{fr ? 'Envoyer quand meme' : 'Send anyway'}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Actions */}
              <View style={s.actions}>
                <Pressable style={s.skipBtn} onPress={onClose}>
                  <Text style={s.skipText}>
                    {fr ? 'Ignorer' : 'Skip'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[s.sendBtn, selectedCount === 0 && s.sendBtnDisabled]}
                  onPress={handleSend}
                  disabled={selectedCount === 0 || sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <MaterialIcons name="send" size={18} color="#FFF" />
                      <Text style={s.sendText}>
                        {fr
                          ? `Envoyer (${selectedCount})`
                          : `Send (${selectedCount})`}
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: theme.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  headerSub: {
    fontSize: 13,
    color: theme.textSecondary,
    marginTop: 3,
    lineHeight: 18,
  },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: theme.backgroundSecondary,
  },
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  sentWrap: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  sentTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.success,
  },
  sentSub: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  playerList: {
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 12,
  },
  playerRowDisabled: {
    opacity: 0.5,
  },
  playerCheckbox: {
    padding: 2,
  },
  playerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  playerEmail: {
    fontSize: 12,
    color: theme.textMuted,
    marginTop: 1,
  },
  permBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  permText: {
    fontSize: 12,
    fontWeight: '700',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendText: {
    fontSize: 11,
    color: theme.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    padding: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    marginTop: 14,
  },
  skipBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: theme.backgroundSecondary,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  sendBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: theme.primary,
  },
  sendBtnDisabled: {
    backgroundColor: theme.textMuted,
    opacity: 0.5,
  },
  sendText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 14,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  warningIconBg: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 3,
  },
  warningText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
  },
  warningActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  warningCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D97706',
  },
  warningCancelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D97706',
  },
  warningConfirmBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: '#D97706',
    borderRadius: 10,
  },
  warningConfirmText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
});
