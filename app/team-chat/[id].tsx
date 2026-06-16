/**
 * Team Chat Page — messaging within formed tournament teams.
 * Features: messages, emoji reactions, typing indicators, read receipts, roster share.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, FlatList,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import Animated, { FadeIn, FadeInDown, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Share } from 'react-native';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useAuth } from '@/template';
import { getSupabaseClient } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData } from '@/contexts/AppContext';
import {
  TeamMessage, fetchTeamMessages, sendTeamMessage, deleteTeamMessage,
  TeamMessageReaction, fetchReactionsForTeam, toggleReaction, REACTION_TYPES,
  TypingUser, setTypingStatus, clearTypingStatus, fetchTypingUsers,
  TeamReadReceipt, markTeamMessagesAsRead, fetchTeamReadReceipts,
} from '@/services/teamChatService';
import { TournamentTeam, getTeamSize } from '@/services/teamInvitationService';

const POLL_INTERVAL = 6000;
const TYPING_POLL_INTERVAL = 3000;
const READ_POLL_INTERVAL = 5000;
const TYPING_DEBOUNCE = 1000;
const AVATAR_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDateSep(dateStr: string, lang: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return lang === 'fr' ? "Aujourd'hui" : 'Today';
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return lang === 'fr' ? 'Hier' : 'Yesterday';
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
}

const QUICK_FR = ['On se retrouve ou ?', 'Je suis pret', 'A quelle heure ?', 'Strategie ?'];
const QUICK_EN = ['Where do we meet?', "I'm ready", 'What time?', 'Strategy?'];

// Animated typing dots
const TypingDots = React.memo(() => {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);
  useEffect(() => {
    dot1.value = withRepeat(withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })), -1, false);
    setTimeout(() => { dot2.value = withRepeat(withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })), -1, false); }, 150);
    setTimeout(() => { dot3.value = withRepeat(withSequence(withTiming(-4, { duration: 300 }), withTiming(0, { duration: 300 })), -1, false); }, 300);
  }, []);
  const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
      <Animated.View style={[{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22C55E' }, s1]} />
      <Animated.View style={[{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22C55E' }, s2]} />
      <Animated.View style={[{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#22C55E' }, s3]} />
    </View>
  );
});

export default function TeamChatScreen() {
  const insets = useSafeAreaInsets();
  const { id: teamId } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { selfPlayer } = useAppData();
  const fr = language === 'fr';

  const [team, setTeam] = useState<TournamentTeam | null>(null);
  const [tournamentName, setTournamentName] = useState('');
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const flatListRef = useRef<FlatList>(null);
  const lastCountRef = useRef(0);
  const [reactions, setReactions] = useState<Map<string, TeamMessageReaction[]>>(new Map());
  const [activeReactionPicker, setActiveReactionPicker] = useState<string | null>(null);
  const [tournamentDate, setTournamentDate] = useState<string>('');
  const [tournamentFormat, setTournamentFormat] = useState<string>('');

  // Typing indicator state
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingReport = useRef(0);

  // Read receipts state
  const [readReceipts, setReadReceipts] = useState<TeamReadReceipt[]>([]);

  // Load team info
  useEffect(() => {
    if (!teamId) return;
    const load = async () => {
      const sb = getSupabaseClient();
      const { data: t } = await sb.from('tournament_teams').select('*').eq('id', teamId).single();
      if (t) {
        setTeam({
          id: t.id, tournamentId: t.tournament_id, creatorUserId: t.creator_user_id,
          memberUserIds: t.member_user_ids || [], memberNames: t.member_names || [],
          format: t.format, status: t.status, completedAt: t.completed_at, createdAt: t.created_at,
        });
        const { data: tour } = await sb.from('tournaments').select('name, date, format').eq('id', t.tournament_id).single();
        if (tour) {
          setTournamentName(tour.name);
          setTournamentDate(tour.date || '');
          setTournamentFormat(tour.format || '');
        }
      }
    };
    load();
  }, [teamId]);

  // Load & poll messages
  const loadMessages = useCallback(async () => {
    if (!teamId) return;
    const [{ messages: msgs }, rxMap] = await Promise.all([
      fetchTeamMessages(teamId),
      fetchReactionsForTeam(teamId),
    ]);
    setMessages(msgs);
    setReactions(rxMap);
    if (msgs.length > lastCountRef.current) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
    lastCountRef.current = msgs.length;
    setLoading(false);

    // Mark as read
    if (msgs.length > 0 && user?.id) {
      markTeamMessagesAsRead(teamId, user.id, msgs[msgs.length - 1].id);
    }
  }, [teamId, user?.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => {
    const iv = setInterval(loadMessages, POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [loadMessages]);

  // Poll typing indicators
  useEffect(() => {
    if (!teamId || !user?.id) return;
    const iv = setInterval(async () => {
      const users = await fetchTypingUsers(teamId, user.id);
      setTypingUsers(users);
    }, TYPING_POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [teamId, user?.id]);

  // Poll read receipts
  useEffect(() => {
    if (!teamId) return;
    const poll = async () => {
      const receipts = await fetchTeamReadReceipts(teamId);
      setReadReceipts(receipts);
    };
    poll();
    const iv = setInterval(poll, READ_POLL_INTERVAL);
    return () => clearInterval(iv);
  }, [teamId]);

  // Clear typing on unmount
  useEffect(() => {
    return () => {
      if (teamId && user?.id) clearTypingStatus(teamId, user.id);
    };
  }, [teamId, user?.id]);

  // Handle text change with typing report
  const handleTextChange = useCallback((newText: string) => {
    setText(newText);
    if (!teamId || !user?.id) return;
    const now = Date.now();
    if (now - lastTypingReport.current > TYPING_DEBOUNCE) {
      lastTypingReport.current = now;
      const userName = selfPlayer?.name || user?.username || user?.email?.split('@')[0] || 'Player';
      setTypingStatus(teamId, user.id, userName);
    }
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    typingDebounceRef.current = setTimeout(() => {
      if (teamId && user?.id) clearTypingStatus(teamId, user.id);
    }, 4000);
  }, [teamId, user?.id, selfPlayer]);

  // Compute read status for a message
  const isMessageRead = useCallback((messageId: string, messageIndex: number): boolean => {
    if (!user?.id) return false;
    // Check if any other user has read up to or past this message
    const msgOrder = messages.map(m => m.id);
    const msgIdx = msgOrder.indexOf(messageId);
    if (msgIdx < 0) return false;
    return readReceipts.some(rr => {
      if (rr.user_id === user.id) return false;
      const rrIdx = msgOrder.indexOf(rr.last_read_message_id);
      return rrIdx >= msgIdx;
    });
  }, [messages, readReceipts, user?.id]);

  const handleSend = useCallback(async (msgText?: string) => {
    const final = (msgText || text).trim();
    if (!final || sending || !teamId || !user?.id) return;
    setSending(true);
    // Clear typing on send
    clearTypingStatus(teamId, user.id);
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);

    const userName = selfPlayer?.name || user?.username || user?.email?.split('@')[0] || 'Player';
    const { message: newMsg } = await sendTeamMessage(teamId, user.id, userName, selfPlayer?.avatar || null, final);
    setSending(false);
    if (newMsg) {
      setMessages(prev => [...prev, newMsg]);
      setText('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
      // Mark own message as read
      markTeamMessagesAsRead(teamId, user.id, newMsg.id);
    }
  }, [teamId, user, selfPlayer, text, sending]);

  const handleDelete = useCallback(async (msgId: string) => {
    Haptics.selectionAsync();
    const { error } = await deleteTeamMessage(msgId);
    if (!error) setMessages(prev => prev.filter(m => m.id !== msgId));
  }, []);

  const handleToggleReaction = useCallback(async (messageId: string, reactionType: string) => {
    if (!teamId || !user?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveReactionPicker(null);

    // Optimistic update
    setReactions(prev => {
      const newMap = new Map(prev);
      const msgReactions = [...(newMap.get(messageId) || [])];
      const existingIdx = msgReactions.findIndex(r => r.user_id === user.id && r.reaction_type === reactionType);
      if (existingIdx >= 0) {
        msgReactions.splice(existingIdx, 1);
      } else {
        msgReactions.push({ id: 'temp', message_id: messageId, user_id: user.id, reaction_type: reactionType });
      }
      newMap.set(messageId, msgReactions);
      return newMap;
    });

    await toggleReaction(teamId, messageId, user.id, reactionType);
    const rxMap = await fetchReactionsForTeam(teamId);
    setReactions(rxMap);
  }, [teamId, user?.id]);

  const handleLongPress = useCallback((msgId: string, isOwn: boolean) => {
    Haptics.selectionAsync();
    if (activeReactionPicker === msgId) {
      setActiveReactionPicker(null);
    } else {
      setActiveReactionPicker(msgId);
    }
  }, [activeReactionPicker]);

  // Messages with date separators
  const messagesWithSeps = useMemo(() => {
    const result: (TeamMessage | { _type: 'sep'; date: string })[] = [];
    let lastDate = '';
    messages.forEach(msg => {
      const d = new Date(msg.created_at).toDateString();
      if (d !== lastDate) { result.push({ _type: 'sep', date: msg.created_at }); lastDate = d; }
      result.push(msg);
    });
    return result;
  }, [messages]);

  const quickMessages = fr ? QUICK_FR : QUICK_EN;
  const teamSize = team ? getTeamSize(team.format) : 2;

  // Typing text
  const typingText = useMemo(() => {
    if (typingUsers.length === 0) return '';
    if (typingUsers.length === 1) return `${typingUsers[0].user_name.split(' ')[0]} ${fr ? 'ecrit' : 'is typing'}`;
    if (typingUsers.length === 2) return `${typingUsers[0].user_name.split(' ')[0]} ${fr ? 'et' : 'and'} ${typingUsers[1].user_name.split(' ')[0]} ${fr ? 'ecrivent' : 'are typing'}`;
    return `${typingUsers[0].user_name.split(' ')[0]} ${fr ? 'et' : 'and'} ${typingUsers.length - 1} ${fr ? 'autres ecrivent' : 'others are typing'}`;
  }, [typingUsers, fr]);

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color="#0F172A" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{fr ? 'Chat equipe' : 'Team Chat'}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={s.headerSub} numberOfLines={1}>
              {tournamentName || ''} {team ? `\u2022 ${team.format}` : ''}
            </Text>
            {/* Typing indicator in header */}
            {typingUsers.length > 0 ? (
              <View style={s.headerTypingDot} />
            ) : null}
          </View>
        </View>
        {/* Share Roster */}
        <Pressable
          style={s.shareRosterBtn}
          onPress={async () => {
            if (!team) return;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            const dateStr = tournamentDate ? new Date(tournamentDate).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
            const rosterText = [
              `\u{1F3AF} ${fr ? 'Equipe formee !' : 'Team formed!'}`,
              '',
              `\u{1F3C6} ${tournamentName}`,
              tournamentFormat ? `\u{1F91D} ${tournamentFormat}` : '',
              dateStr ? `\u{1F4C5} ${dateStr}` : '',
              '',
              `\u{1F465} ${fr ? 'Joueurs' : 'Players'}:`,
              ...team.memberNames.map((n, i) => `  ${i === 0 ? '\u{2B50}' : '\u{1F3BD}'} ${n}${i === 0 ? (fr ? ' (Capitaine)' : ' (Captain)') : ''}`),
              '',
              fr ? 'Pret pour la competition !' : 'Ready to compete!',
            ].filter(Boolean).join('\n');
            try {
              await Share.share({ message: rosterText, title: fr ? 'Mon equipe' : 'My team' });
            } catch { /* user cancelled */ }
          }}
          hitSlop={8}
        >
          <MaterialIcons name="share" size={18} color="#2563EB" />
        </Pressable>
        {/* Member avatars */}
        <View style={s.memberAvatars}>
          {(team?.memberNames || []).slice(0, 3).map((name, i) => (
            <View key={i} style={[s.memberDot, { backgroundColor: AVATAR_COLORS[i % 6], marginLeft: i > 0 ? -8 : 0, zIndex: 10 - i }]}>
              <Text style={s.memberInitial}>{name.charAt(0)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Team status bar */}
      {team ? (
        <View style={s.statusBar}>
          <MaterialIcons name={team.status === 'complete' ? 'check-circle' : 'groups'} size={14} color={team.status === 'complete' ? '#22C55E' : '#F59E0B'} />
          <Text style={[s.statusText, { color: team.status === 'complete' ? '#16A34A' : '#D97706' }]}>
            {team.status === 'complete' ? (fr ? 'Equipe complete' : 'Team complete') : `${team.memberUserIds.length}/${teamSize} ${fr ? 'joueurs' : 'players'}`}
          </Text>
          <View style={{ flex: 1 }} />
          <Pressable
            style={s.viewTourneyBtn}
            onPress={() => router.push(`/tournament/${team.tournamentId}` as any)}
          >
            <MaterialIcons name="emoji-events" size={12} color="#2563EB" />
            <Text style={s.viewTourneyText}>{fr ? 'Tournoi' : 'Tournament'}</Text>
          </Pressable>
        </View>
      ) : null}

      {/* Messages */}
      {loading ? (
        <View style={s.loadingWrap}><ActivityIndicator size="large" color={theme.primary} /></View>
      ) : messages.length === 0 ? (
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}><MaterialIcons name="chat" size={40} color="#CBD5E1" /></View>
          <Text style={s.emptyTitle}>{fr ? 'Lancez la discussion !' : 'Start the conversation!'}</Text>
          <Text style={s.emptyDesc}>{fr ? 'Coordonnez votre strategie et logistique avec vos coequipiers.' : 'Coordinate strategy and logistics with your teammates.'}</Text>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={messagesWithSeps}
          keyExtractor={(item, idx) => ('_type' in item ? `sep-${idx}` : (item as TeamMessage).id)}
          style={s.messageList}
          contentContainerStyle={[s.messageListContent, { paddingBottom: insets.bottom + 16 }]}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          renderItem={({ item, index }) => {
            if ('_type' in item) {
              return (
                <View style={s.dateSep}>
                  <View style={s.dateSepLine} />
                  <Text style={s.dateSepText}>{formatDateSep(item.date, language)}</Text>
                  <View style={s.dateSepLine} />
                </View>
              );
            }
            const msg = item as TeamMessage;
            const isOwn = msg.user_id === user?.id;
            const avatarColor = getAvatarColor(msg.user_id);
            const initials = msg.user_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
            const msgIndex = messages.findIndex(m => m.id === msg.id);
            const read = isOwn ? isMessageRead(msg.id, msgIndex) : false;
            return (
              <Animated.View entering={index < 20 ? FadeInDown.duration(150).delay(Math.min(index * 20, 200)) : undefined}>
                <View>
                  {/* Reaction picker */}
                  {activeReactionPicker === msg.id ? (
                    <View style={[s.reactionPicker, isOwn && s.reactionPickerOwn]}>
                      {REACTION_TYPES.map(rt => {
                        const msgRx = reactions.get(msg.id) || [];
                        const hasMyReaction = msgRx.some(r => r.user_id === user?.id && r.reaction_type === rt.type);
                        return (
                          <Pressable
                            key={rt.type}
                            style={[s.reactionPickerItem, hasMyReaction && s.reactionPickerItemActive]}
                            onPress={() => handleToggleReaction(msg.id, rt.type)}
                          >
                            <Text style={s.reactionEmoji}>{rt.emoji}</Text>
                          </Pressable>
                        );
                      })}
                      {isOwn ? (
                        <Pressable style={s.reactionDeleteBtn} onPress={() => { setActiveReactionPicker(null); handleDelete(msg.id); }}>
                          <MaterialIcons name="delete-outline" size={16} color="#EF4444" />
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  <Pressable
                    style={[s.bubbleRow, isOwn && s.bubbleRowOwn]}
                    onLongPress={() => handleLongPress(msg.id, isOwn)}
                  >
                    {!isOwn ? (
                      <View style={[s.bubbleAvatar, { backgroundColor: avatarColor + '20' }]}>
                        <Text style={[s.bubbleAvatarText, { color: avatarColor }]}>{initials}</Text>
                      </View>
                    ) : null}
                    <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
                      {!isOwn ? <Text style={[s.bubbleName, { color: avatarColor }]}>{msg.user_name}</Text> : null}
                      <Text style={[s.bubbleText, isOwn && s.bubbleTextOwn]}>{msg.message}</Text>
                      <View style={s.bubbleFooter}>
                        <Text style={[s.bubbleTime, isOwn && s.bubbleTimeOwn]}>{formatTime(msg.created_at)}</Text>
                        {isOwn ? (
                          <MaterialIcons
                            name="done-all"
                            size={14}
                            color={read ? '#3B82F6' : 'rgba(255,255,255,0.35)'}
                            style={{ marginLeft: 4 }}
                          />
                        ) : null}
                      </View>
                    </View>
                  </Pressable>
                  {/* Reaction counts */}
                  {(() => {
                    const msgRx = reactions.get(msg.id) || [];
                    if (msgRx.length === 0) return null;
                    const grouped = new Map<string, number>();
                    const myReactions = new Set<string>();
                    msgRx.forEach(r => {
                      grouped.set(r.reaction_type, (grouped.get(r.reaction_type) || 0) + 1);
                      if (r.user_id === user?.id) myReactions.add(r.reaction_type);
                    });
                    return (
                      <View style={[s.reactionRow, isOwn && s.reactionRowOwn]}>
                        {[...grouped.entries()].map(([type, count]) => {
                          const rt = REACTION_TYPES.find(r => r.type === type);
                          const isMine = myReactions.has(type);
                          return (
                            <Pressable
                              key={type}
                              style={[s.reactionChip, isMine && s.reactionChipMine]}
                              onPress={() => handleToggleReaction(msg.id, type)}
                            >
                              <Text style={s.reactionChipEmoji}>{rt?.emoji || type}</Text>
                              <Text style={[s.reactionChipCount, isMine && s.reactionChipCountMine]}>{count}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    );
                  })()}
                </View>
              </Animated.View>
            );
          }}
        />
      )}

      {/* Typing indicator bar */}
      {typingUsers.length > 0 ? (
        <Animated.View entering={FadeIn.duration(200)} style={s.typingBar}>
          <TypingDots />
          <Text style={s.typingText}>{typingText}...</Text>
        </Animated.View>
      ) : null}

      {/* Quick messages */}
      <View style={s.quickRow}>
        {quickMessages.map((qm, idx) => (
          <Pressable key={idx} style={s.quickChip} onPress={() => handleSend(qm)}>
            <Text style={s.quickChipText} numberOfLines={1}>{qm}</Text>
          </Pressable>
        ))}
      </View>

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.inputRow, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TextInput
            style={s.input}
            value={text}
            onChangeText={handleTextChange}
            placeholder={fr ? 'Votre message...' : 'Your message...'}
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={500}
          />
          <Pressable
            style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={!text.trim() || sending}
          >
            {sending ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="send" size={18} color="#FFF" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#0F172A' },
  headerSub: { fontSize: 12, color: '#64748B', marginTop: 1 },
  headerTypingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  memberAvatars: { flexDirection: 'row', alignItems: 'center' },
  shareRosterBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  memberDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF' },
  memberInitial: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  statusBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  statusText: { fontSize: 12, fontWeight: '600' },
  viewTourneyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  viewTourneyText: { fontSize: 11, fontWeight: '600', color: '#2563EB' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 19 },
  messageList: { flex: 1 },
  messageListContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  dateSep: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  dateSepLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dateSepText: { fontSize: 11, fontWeight: '600', color: '#94A3B8' },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: 4 },
  bubbleRowOwn: { justifyContent: 'flex-end' },
  bubbleAvatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  bubbleAvatarText: { fontSize: 10, fontWeight: '800' },
  bubble: { maxWidth: '75%' as any, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleOwn: { backgroundColor: '#0F172A', borderBottomRightRadius: 4 },
  bubbleOther: { backgroundColor: '#FFF', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#E2E8F0' },
  bubbleName: { fontSize: 11, fontWeight: '700', marginBottom: 3 },
  bubbleText: { fontSize: 14, color: '#0F172A', lineHeight: 20 },
  bubbleTextOwn: { color: '#FFF' },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  bubbleTime: { fontSize: 10, color: '#94A3B8' },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.5)' },
  // Typing indicator
  typingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6, backgroundColor: '#F0FDF4', borderTopWidth: 1, borderTopColor: '#BBF7D0' },
  typingText: { fontSize: 12, fontWeight: '600', color: '#16A34A' },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  quickChip: { backgroundColor: '#22C55E10', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14, borderWidth: 1, borderColor: '#22C55E20' },
  quickChipText: { fontSize: 12, fontWeight: '600', color: '#22C55E' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E2E8F0', backgroundColor: '#FFF' },
  input: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 18, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: '#0F172A', maxHeight: 80, borderWidth: 1, borderColor: '#E2E8F0' },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#22C55E', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#94A3B8', opacity: 0.5 },
  // Reactions
  reactionPicker: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 6, marginBottom: 4, marginLeft: 34, alignSelf: 'flex-start' as any, borderWidth: 1, borderColor: '#E2E8F0', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 }, android: { elevation: 4 }, default: {} }) },
  reactionPickerOwn: { alignSelf: 'flex-end' as any, marginLeft: 0, marginRight: 0 },
  reactionPickerItem: { width: 36, height: 36, borderRadius: 18, alignItems: 'center' as any, justifyContent: 'center' as any, backgroundColor: '#F8FAFC' },
  reactionPickerItemActive: { backgroundColor: '#22C55E18', borderWidth: 1.5, borderColor: '#22C55E40' },
  reactionEmoji: { fontSize: 18 },
  reactionDeleteBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center' as any, justifyContent: 'center' as any, backgroundColor: '#FEF2F2', marginLeft: 2 },
  reactionRow: { flexDirection: 'row' as any, gap: 4, marginLeft: 40, marginTop: 2, marginBottom: 2 },
  reactionRowOwn: { justifyContent: 'flex-end' as any, marginLeft: 0, marginRight: 6 },
  reactionChip: { flexDirection: 'row' as any, alignItems: 'center' as any, gap: 3, backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  reactionChipMine: { backgroundColor: '#22C55E12', borderColor: '#22C55E30' },
  reactionChipEmoji: { fontSize: 13 },
  reactionChipCount: { fontSize: 11, fontWeight: '700' as any, color: '#64748B' },
  reactionChipCountMine: { color: '#22C55E' },
});
