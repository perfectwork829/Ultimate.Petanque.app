/**
 * MeetupChat — Mini-chat component for meetup detail page.
 * Displays messages, auto-polls for new ones, typing indicator,
 * read receipts (blue double check), emoji reactions, and allows sending.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/services/haptics';
import Animated, { FadeIn, useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withSpring } from 'react-native-reanimated';
import theme from '@/constants/theme';
import {
  MeetupMessage,
  TypingUser,
  ReadReceipt,
  ReactionGroup,
  fetchMeetupMessages,
  sendMeetupMessage,
  deleteMeetupMessage,
  setTypingStatus,
  clearTypingStatus,
  fetchTypingUsers,
  markMessagesAsRead,
  fetchReadReceipts,
  fetchMessageReactions,
  toggleReaction,
} from '@/services/meetupChatService';

interface MeetupChatProps {
  meetupId: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  isParticipant: boolean;
  language: string;
}

const POLL_INTERVAL = 8000;
const TYPING_POLL_INTERVAL = 3000;
const TYPING_DEBOUNCE_MS = 1000;
const READ_RECEIPT_POLL_INTERVAL = 5000;
const REACTION_POLL_INTERVAL = 8000;

const QUICK_MESSAGES_FR = [
  "J'arrive dans 10 min",
  "Combien de boules ?",
  "On commence a quelle heure ?",
  "Je serai en retard",
];

const QUICK_MESSAGES_EN = [
  "I'll be there in 10 min",
  "How many boules?",
  "What time do we start?",
  "I'll be late",
];

const REACTION_EMOJIS: { type: string; emoji: string }[] = [
  { type: 'thumbs_up', emoji: '\u{1F44D}' },
  { type: 'laugh', emoji: '\u{1F602}' },
  { type: 'fire', emoji: '\u{1F525}' },
];

const AVATAR_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#EC4899', '#06B6D4', '#D97706', '#6366F1', '#14B8A6',
];

function getAvatarColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatDateSeparator(dateStr: string, lang: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  if (isToday) return lang === 'fr' ? "Aujourd'hui" : 'Today';
  if (isYesterday) return lang === 'fr' ? 'Hier' : 'Yesterday';
  return d.toLocaleDateString(lang === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
}

function getEmojiForType(type: string): string {
  return REACTION_EMOJIS.find(r => r.type === type)?.emoji || type;
}

// Animated typing dots component
const TypingDots = React.memo(() => {
  const dot1 = useSharedValue(0);
  const dot2 = useSharedValue(0);
  const dot3 = useSharedValue(0);

  React.useEffect(() => {
    dot1.value = withRepeat(withSequence(withTiming(-3, { duration: 300 }), withTiming(0, { duration: 300 })), -1, true);
    const t2 = setTimeout(() => {
      dot2.value = withRepeat(withSequence(withTiming(-3, { duration: 300 }), withTiming(0, { duration: 300 })), -1, true);
    }, 150);
    const t3 = setTimeout(() => {
      dot3.value = withRepeat(withSequence(withTiming(-3, { duration: 300 }), withTiming(0, { duration: 300 })), -1, true);
    }, 300);
    return () => { clearTimeout(t2); clearTimeout(t3); };
  }, []);

  const s1 = useAnimatedStyle(() => ({ transform: [{ translateY: dot1.value }] }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ translateY: dot2.value }] }));
  const s3 = useAnimatedStyle(() => ({ transform: [{ translateY: dot3.value }] }));

  return (
    <View style={s.typingDotsRow}>
      <Animated.View style={[s.typingDot, s1]} />
      <Animated.View style={[s.typingDot, s2]} />
      <Animated.View style={[s.typingDot, s3]} />
    </View>
  );
});

// Read status icon component
const ReadStatusIcon = React.memo(({ isRead }: { isRead: boolean }) => (
  <View style={s.readStatusWrap}>
    <MaterialIcons name="done-all" size={14} color={isRead ? '#3B82F6' : 'rgba(255,255,255,0.45)'} />
  </View>
));

// Animated reaction pill
const ReactionPill = React.memo(({ emoji, count, isOwn, onPress }: {
  emoji: string; count: number; isOwn: boolean; onPress: () => void;
}) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = useCallback(() => {
    scale.value = withSequence(withSpring(1.35, { damping: 6, stiffness: 400 }), withSpring(1, { damping: 8, stiffness: 300 }));
    onPress();
  }, [onPress]);

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[s.reactionPill, isOwn && s.reactionPillOwn, animStyle]}>
        <Text style={s.reactionEmoji}>{emoji}</Text>
        <Text style={[s.reactionCount, isOwn && s.reactionCountOwn]}>{count}</Text>
      </Animated.View>
    </Pressable>
  );
});

// Reaction picker (3 emojis)
const ReactionPicker = React.memo(({ onSelect, onClose }: {
  onSelect: (type: string) => void; onClose: () => void;
}) => (
  <Animated.View entering={FadeIn.duration(150)} style={s.reactionPicker}>
    {REACTION_EMOJIS.map(r => (
      <Pressable
        key={r.type}
        style={s.reactionPickerBtn}
        onPress={() => { onSelect(r.type); onClose(); }}
      >
        <Text style={s.reactionPickerEmoji}>{r.emoji}</Text>
      </Pressable>
    ))}
  </Animated.View>
));

const MessageBubble = React.memo(({ msg, isOwn, onDelete, language, isRead, reactions, userId, onReact }: {
  msg: MeetupMessage;
  isOwn: boolean;
  onDelete: (id: string) => void;
  language: string;
  isRead: boolean;
  reactions: ReactionGroup[];
  userId: string;
  onReact: (messageId: string, reactionType: string) => void;
}) => {
  const [showDelete, setShowDelete] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const avatarColor = getAvatarColor(msg.user_id);
  const initials = msg.user_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  const hasReactions = reactions.length > 0;

  const handleReact = useCallback((type: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReact(msg.id, type);
  }, [msg.id, onReact]);

  return (
    <View style={s.bubbleWrapper}>
      <Pressable
        style={[s.bubbleRow, isOwn && s.bubbleRowOwn]}
        onLongPress={() => { if (isOwn) { Haptics.selectionAsync(); setShowDelete(prev => !prev); } }}
      >
        {!isOwn ? (
          <View style={[s.bubbleAvatar, { backgroundColor: avatarColor + '20' }]}>
            <Text style={[s.bubbleAvatarText, { color: avatarColor }]}>{initials}</Text>
          </View>
        ) : null}
        <View style={[s.bubble, isOwn ? s.bubbleOwn : s.bubbleOther]}>
          {!isOwn ? (
            <Text style={[s.bubbleName, { color: avatarColor }]}>{msg.user_name}</Text>
          ) : null}
          <Text style={[s.bubbleText, isOwn && s.bubbleTextOwn]}>{msg.message}</Text>
          <View style={s.bubbleFooter}>
            <Text style={[s.bubbleTime, isOwn && s.bubbleTimeOwn]}>{formatTime(msg.created_at)}</Text>
            {isOwn ? <ReadStatusIcon isRead={isRead} /> : null}
          </View>
        </View>
        {showDelete && isOwn ? (
          <Pressable style={s.deleteBtn} onPress={() => { onDelete(msg.id); setShowDelete(false); }}>
            <MaterialIcons name="delete-outline" size={16} color={theme.error} />
          </Pressable>
        ) : null}
      </Pressable>

      {/* Reactions row */}
      <View style={[s.reactionRow, isOwn && s.reactionRowOwn]}>
        {!isOwn ? <View style={{ width: 34 }} /> : null}
        {hasReactions ? reactions.map(r => (
          <ReactionPill
            key={r.type}
            emoji={getEmojiForType(r.type)}
            count={r.count}
            isOwn={r.userIds.includes(userId)}
            onPress={() => handleReact(r.type)}
          />
        )) : null}
        <Pressable
          style={[s.reactionAddBtn, showPicker && s.reactionAddBtnActive]}
          onPress={() => { Haptics.selectionAsync(); setShowPicker(prev => !prev); }}
          hitSlop={6}
        >
          <MaterialIcons name="add-reaction" size={14} color={showPicker ? theme.primary : theme.textMuted} />
        </Pressable>
        {showPicker ? <ReactionPicker onSelect={handleReact} onClose={() => setShowPicker(false)} /> : null}
      </View>
    </View>
  );
});

export default function MeetupChat({ meetupId, userId, userName, userAvatar, isParticipant, language }: MeetupChatProps) {
  const [messages, setMessages] = useState<MeetupMessage[]>([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [readReceipts, setReadReceipts] = useState<ReadReceipt[]>([]);
  const [reactionsMap, setReactionsMap] = useState<Map<string, ReactionGroup[]>>(new Map());
  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const readReceiptPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reactionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCountRef = useRef(0);
  const isTypingRef = useRef(false);
  const lastMarkedReadRef = useRef<string | null>(null);
  const quickMessages = language === 'fr' ? QUICK_MESSAGES_FR : QUICK_MESSAGES_EN;

  // Compute which of my messages have been read by at least one other participant
  const readMessageIds = React.useMemo(() => {
    const otherReceipts = readReceipts.filter(r => r.user_id !== userId);
    if (otherReceipts.length === 0) return new Set<string>();

    const myMessages = messages.filter(m => m.user_id === userId);
    if (myMessages.length === 0) return new Set<string>();

    const msgIndexMap = new Map<string, number>();
    messages.forEach((m, i) => msgIndexMap.set(m.id, i));

    let maxReadIndex = -1;
    otherReceipts.forEach(r => {
      const idx = msgIndexMap.get(r.last_read_message_id);
      if (idx !== undefined && idx > maxReadIndex) maxReadIndex = idx;
    });

    const readIds = new Set<string>();
    if (maxReadIndex >= 0) {
      myMessages.forEach(m => {
        const idx = msgIndexMap.get(m.id);
        if (idx !== undefined && idx <= maxReadIndex) readIds.add(m.id);
      });
    }
    return readIds;
  }, [readReceipts, messages, userId]);

  const loadMessages = useCallback(async () => {
    const { messages: msgs } = await fetchMeetupMessages(meetupId);
    setMessages(msgs);
    if (msgs.length > lastCountRef.current && expanded) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
    lastCountRef.current = msgs.length;
    setLoading(false);

    if (expanded && isParticipant && msgs.length > 0) {
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg.id !== lastMarkedReadRef.current) {
        lastMarkedReadRef.current = lastMsg.id;
        markMessagesAsRead(meetupId, userId, lastMsg.id);
      }
    }
  }, [meetupId, expanded, isParticipant, userId]);

  const loadTypingUsers = useCallback(async () => {
    if (!expanded || !isParticipant) return;
    const users = await fetchTypingUsers(meetupId, userId);
    setTypingUsers(users);
  }, [meetupId, userId, expanded, isParticipant]);

  const loadReadReceipts = useCallback(async () => {
    if (!expanded || !isParticipant) return;
    const receipts = await fetchReadReceipts(meetupId);
    setReadReceipts(receipts);
  }, [meetupId, expanded, isParticipant]);

  const loadReactions = useCallback(async () => {
    if (!expanded) return;
    const map = await fetchMessageReactions(meetupId);
    setReactionsMap(map);
  }, [meetupId, expanded]);

  // Initial load
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Message polling
  useEffect(() => {
    if (!expanded) return;
    pollRef.current = setInterval(loadMessages, POLL_INTERVAL);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [expanded, loadMessages]);

  // Typing indicator polling
  useEffect(() => {
    if (!expanded || !isParticipant) return;
    loadTypingUsers();
    typingPollRef.current = setInterval(loadTypingUsers, TYPING_POLL_INTERVAL);
    return () => { if (typingPollRef.current) clearInterval(typingPollRef.current); };
  }, [expanded, isParticipant, loadTypingUsers]);

  // Read receipt polling
  useEffect(() => {
    if (!expanded || !isParticipant) return;
    loadReadReceipts();
    readReceiptPollRef.current = setInterval(loadReadReceipts, READ_RECEIPT_POLL_INTERVAL);
    return () => { if (readReceiptPollRef.current) clearInterval(readReceiptPollRef.current); };
  }, [expanded, isParticipant, loadReadReceipts]);

  // Reaction polling
  useEffect(() => {
    if (!expanded) return;
    loadReactions();
    reactionPollRef.current = setInterval(loadReactions, REACTION_POLL_INTERVAL);
    return () => { if (reactionPollRef.current) clearInterval(reactionPollRef.current); };
  }, [expanded, loadReactions]);

  // Mark messages as read when chat is expanded and messages change
  useEffect(() => {
    if (!expanded || !isParticipant || messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.id !== lastMarkedReadRef.current) {
      lastMarkedReadRef.current = lastMsg.id;
      markMessagesAsRead(meetupId, userId, lastMsg.id);
    }
  }, [expanded, isParticipant, messages, meetupId, userId]);

  // Clean up typing status on unmount or collapse
  useEffect(() => {
    return () => {
      if (isTypingRef.current) {
        clearTypingStatus(meetupId, userId);
        isTypingRef.current = false;
      }
      if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
    };
  }, [meetupId, userId]);

  const handleTextChange = useCallback((newText: string) => {
    setText(newText);
    if (!isParticipant) return;

    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    if (typingClearRef.current) clearTimeout(typingClearRef.current);

    if (newText.trim().length > 0) {
      typingDebounceRef.current = setTimeout(() => {
        setTypingStatus(meetupId, userId, userName);
        isTypingRef.current = true;
      }, TYPING_DEBOUNCE_MS);

      typingClearRef.current = setTimeout(() => {
        clearTypingStatus(meetupId, userId);
        isTypingRef.current = false;
      }, 5000);
    } else {
      clearTypingStatus(meetupId, userId);
      isTypingRef.current = false;
    }
  }, [meetupId, userId, userName, isParticipant]);

  const handleSend = useCallback(async (msgText?: string) => {
    const finalText = (msgText || text).trim();
    if (!finalText || sending) return;

    if (isTypingRef.current) {
      clearTypingStatus(meetupId, userId);
      isTypingRef.current = false;
    }
    if (typingDebounceRef.current) clearTimeout(typingDebounceRef.current);
    if (typingClearRef.current) clearTimeout(typingClearRef.current);

    setSending(true);
    const { message: newMsg, error } = await sendMeetupMessage(meetupId, userId, userName, userAvatar, finalText);
    setSending(false);
    if (!error && newMsg) {
      setMessages(prev => [...prev, newMsg]);
      setText('');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 50);
      lastMarkedReadRef.current = newMsg.id;
      markMessagesAsRead(meetupId, userId, newMsg.id);
    }
  }, [meetupId, userId, userName, userAvatar, text, sending]);

  const handleDelete = useCallback(async (msgId: string) => {
    Haptics.selectionAsync();
    const { error } = await deleteMeetupMessage(msgId);
    if (!error) {
      setMessages(prev => prev.filter(m => m.id !== msgId));
    }
  }, []);

  const handleToggleReaction = useCallback(async (messageId: string, reactionType: string) => {
    if (!isParticipant) return;
    // Optimistic update
    setReactionsMap(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(messageId) || [];
      const group = existing.find(r => r.type === reactionType);
      if (group) {
        if (group.userIds.includes(userId)) {
          // Remove own reaction
          group.count--;
          group.userIds = group.userIds.filter(id => id !== userId);
          if (group.count <= 0) {
            newMap.set(messageId, existing.filter(r => r.type !== reactionType));
          }
        } else {
          // Add own reaction
          group.count++;
          group.userIds.push(userId);
        }
      } else {
        // New reaction type on this message
        newMap.set(messageId, [...existing, { type: reactionType, count: 1, userIds: [userId] }]);
      }
      return newMap;
    });

    // Server call
    await toggleReaction(meetupId, messageId, userId, reactionType);
    // Refresh from server to ensure consistency
    setTimeout(loadReactions, 500);
  }, [meetupId, userId, isParticipant, loadReactions]);

  const handleToggle = useCallback(() => {
    Haptics.selectionAsync();
    setExpanded(prev => {
      if (prev && isTypingRef.current) {
        clearTypingStatus(meetupId, userId);
        isTypingRef.current = false;
      }
      return !prev;
    });
  }, [meetupId, userId]);

  // Group messages by date for separators
  const messagesWithSeparators = React.useMemo(() => {
    const result: (MeetupMessage | { _type: 'separator'; date: string })[] = [];
    let lastDate = '';
    messages.forEach(msg => {
      const d = new Date(msg.created_at).toDateString();
      if (d !== lastDate) {
        result.push({ _type: 'separator', date: msg.created_at });
        lastDate = d;
      }
      result.push(msg);
    });
    return result;
  }, [messages]);

  // Build typing indicator text
  const typingText = React.useMemo(() => {
    if (typingUsers.length === 0) return null;
    const names = typingUsers.map(u => u.user_name.split(' ')[0]);
    if (names.length === 1) {
      return language === 'fr' ? `${names[0]} ecrit...` : `${names[0]} is typing...`;
    }
    if (names.length === 2) {
      return language === 'fr' ? `${names[0]} et ${names[1]} ecrivent...` : `${names[0]} and ${names[1]} are typing...`;
    }
    return language === 'fr' ? `${names[0]} et ${names.length - 1} autres ecrivent...` : `${names[0]} and ${names.length - 1} others are typing...`;
  }, [typingUsers, language]);

  const unreadCount = messages.length;

  return (
    <Animated.View entering={FadeIn.duration(300)} style={s.container}>
      {/* Header — always visible */}
      <Pressable style={s.header} onPress={handleToggle}>
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <MaterialIcons name="chat-bubble-outline" size={18} color={theme.primary} />
          </View>
          <Text style={s.headerTitle}>{language === 'fr' ? 'Discussion' : 'Chat'}</Text>
          {unreadCount > 0 ? (
            <View style={s.badge}>
              <Text style={s.badgeText}>{unreadCount}</Text>
            </View>
          ) : null}
        </View>
        <View style={s.headerRight}>
          {!expanded && typingUsers.length > 0 ? (
            <View style={s.headerTypingDot} />
          ) : null}
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={theme.textMuted} />
        </View>
      </Pressable>

      {/* Expanded chat body */}
      {expanded ? (
        <View style={s.body}>
          {loading ? (
            <View style={s.loadingWrap}>
              <ActivityIndicator size="small" color={theme.primary} />
            </View>
          ) : messages.length === 0 ? (
            <View style={s.emptyWrap}>
              <MaterialIcons name="chat" size={36} color={theme.textMuted} />
              <Text style={s.emptyText}>
                {language === 'fr' ? 'Aucun message. Lancez la discussion !' : 'No messages yet. Start the conversation!'}
              </Text>
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messagesWithSeparators}
              keyExtractor={(item, idx) => ('_type' in item && item._type === 'separator') ? `sep-${idx}` : (item as MeetupMessage).id}
              style={s.messageList}
              contentContainerStyle={s.messageListContent}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
              renderItem={({ item }) => {
                if ('_type' in item && item._type === 'separator') {
                  return (
                    <View style={s.dateSeparator}>
                      <View style={s.dateSeparatorLine} />
                      <Text style={s.dateSeparatorText}>{formatDateSeparator(item.date, language)}</Text>
                      <View style={s.dateSeparatorLine} />
                    </View>
                  );
                }
                const msg = item as MeetupMessage;
                const isOwn = msg.user_id === userId;
                const msgReactions = reactionsMap.get(msg.id) || [];
                return (
                  <MessageBubble
                    msg={msg}
                    isOwn={isOwn}
                    onDelete={handleDelete}
                    language={language}
                    isRead={isOwn ? readMessageIds.has(msg.id) : false}
                    reactions={msgReactions}
                    userId={userId}
                    onReact={handleToggleReaction}
                  />
                );
              }}
            />
          )}

          {/* Typing indicator */}
          {typingText ? (
            <View style={s.typingBar}>
              <TypingDots />
              <Text style={s.typingText}>{typingText}</Text>
            </View>
          ) : null}

          {/* Quick message chips */}
          {isParticipant ? (
            <View style={s.quickRow}>
              {quickMessages.map((qm, idx) => (
                <Pressable key={idx} style={s.quickChip} onPress={() => handleSend(qm)}>
                  <Text style={s.quickChipText} numberOfLines={1}>{qm}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Input area */}
          {isParticipant ? (
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={s.inputRow}>
                <TextInput
                  style={s.input}
                  value={text}
                  onChangeText={handleTextChange}
                  placeholder={language === 'fr' ? 'Votre message...' : 'Your message...'}
                  placeholderTextColor={theme.textMuted}
                  multiline
                  maxLength={500}
                />
                <Pressable
                  style={[s.sendBtn, (!text.trim() || sending) && s.sendBtnDisabled]}
                  onPress={() => handleSend()}
                  disabled={!text.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <MaterialIcons name="send" size={18} color="#FFF" />
                  )}
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          ) : (
            <View style={s.notParticipant}>
              <MaterialIcons name="lock" size={14} color={theme.textMuted} />
              <Text style={s.notParticipantText}>
                {language === 'fr' ? 'Acceptez le RDV pour envoyer des messages' : 'Accept the meetup to send messages'}
              </Text>
            </View>
          )}
        </View>
      ) : null}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: theme.surface,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden' as const,
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerLeft: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
  },
  headerRight: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: theme.primary + '12',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: theme.textPrimary,
  },
  headerTypingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.success,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#FFF',
  },
  body: {
    borderTopWidth: 1,
    borderTopColor: theme.border,
    maxHeight: 440,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: 'center' as const,
  },
  emptyWrap: {
    paddingVertical: 32,
    alignItems: 'center' as const,
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: theme.textMuted,
    textAlign: 'center' as const,
    paddingHorizontal: 24,
  },
  messageList: {
    maxHeight: 300,
  },
  messageListContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  dateSeparator: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 10,
    paddingVertical: 8,
  },
  dateSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.border,
  },
  dateSeparatorText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: theme.textMuted,
  },
  bubbleWrapper: {
    marginBottom: 2,
  },
  bubbleRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 6,
  },
  bubbleRowOwn: {
    justifyContent: 'flex-end' as const,
  },
  bubbleAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  bubbleAvatarText: {
    fontSize: 10,
    fontWeight: '800' as const,
  },
  bubble: {
    maxWidth: '75%' as any,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOwn: {
    backgroundColor: theme.primary,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: theme.backgroundSecondary,
    borderBottomLeftRadius: 4,
  },
  bubbleName: {
    fontSize: 11,
    fontWeight: '700' as const,
    marginBottom: 3,
  },
  bubbleText: {
    fontSize: 14,
    color: theme.textPrimary,
    lineHeight: 20,
  },
  bubbleTextOwn: {
    color: '#FFF',
  },
  bubbleFooter: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'flex-end' as const,
    gap: 4,
    marginTop: 4,
  },
  bubbleTime: {
    fontSize: 10,
    color: theme.textMuted,
  },
  bubbleTimeOwn: {
    color: 'rgba(255,255,255,0.6)',
  },
  readStatusWrap: {
    marginLeft: 2,
  },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: theme.error + '12',
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginLeft: 4,
  },
  // Reaction row below bubble
  reactionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 4,
    paddingLeft: 6,
    paddingTop: 2,
    paddingBottom: 2,
    minHeight: 24,
  },
  reactionRowOwn: {
    justifyContent: 'flex-end' as const,
    paddingRight: 6,
    paddingLeft: 0,
  },
  reactionPill: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    backgroundColor: theme.backgroundSecondary,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
  },
  reactionPillOwn: {
    backgroundColor: theme.primary + '12',
    borderColor: theme.primary + '30',
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: theme.textSecondary,
  },
  reactionCountOwn: {
    color: theme.primary,
  },
  reactionAddBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 1,
    borderColor: theme.border,
  },
  reactionAddBtnActive: {
    backgroundColor: theme.primary + '12',
    borderColor: theme.primary + '30',
  },
  reactionPicker: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 2,
    backgroundColor: theme.surface,
    borderRadius: 16,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: theme.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 },
      android: { elevation: 4 },
      default: {},
    }),
  },
  reactionPickerBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  reactionPickerEmoji: {
    fontSize: 18,
  },
  // Typing indicator
  typingBar: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: theme.backgroundSecondary + '80',
  },
  typingText: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: theme.textSecondary,
    fontStyle: 'italic' as const,
  },
  typingDotsRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 3,
    height: 16,
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.textMuted,
  },
  quickRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  quickChip: {
    backgroundColor: theme.primary + '10',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.primary + '20',
  },
  quickChipText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: theme.primary,
  },
  inputRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-end' as const,
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  input: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.textPrimary,
    maxHeight: 80,
    borderWidth: 1,
    borderColor: theme.border,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.primary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  sendBtnDisabled: {
    backgroundColor: theme.textMuted,
    opacity: 0.5,
  },
  notParticipant: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  notParticipantText: {
    fontSize: 12,
    color: theme.textMuted,
    fontWeight: '500' as const,
  },
});
