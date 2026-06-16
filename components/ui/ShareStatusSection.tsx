/**
 * ShareStatusSection - Shows list of players an item is shared with,
 * their status (pending/accepted/declined), permission level,
 * and ability to revoke a share.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { getShareRequestsForItem, revokeShareRequest, MatchShareRequest } from '@/services/matchShareService';
import { getSupabaseClient } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';

interface ShareStatusSectionProps {
  itemType: 'match' | 'challenge';
  itemId: string | null;
  isOwner?: boolean;
}

const STATUS_CONFIG: Record<string, { icon: keyof typeof MaterialIcons.glyphMap; color: string; key: string }> = {
  pending: { icon: 'hourglass-empty', color: '#F59E0B', key: 'statusPending' },
  accepted: { icon: 'check-circle', color: '#10B981', key: 'statusAccepted' },
  declined: { icon: 'cancel', color: '#EF4444', key: 'statusDeclined' },
};

export default function ShareStatusSection({ itemType, itemId, isOwner = true }: ShareStatusSectionProps) {
  const { t, language } = useLanguage();
  const [requests, setRequests] = useState<MatchShareRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const [recipientNames, setRecipientNames] = useState<Record<string, string>>({});

  const loadRequests = useCallback(async () => {
    if (!itemId) { setLoading(false); return; }
    setLoading(true);
    const { requests: data } = await getShareRequestsForItem(itemType, itemId);
    setRequests(data);
    // Fetch recipient names from user_profiles
    if (data.length > 0) {
      const recipientIds = [...new Set(data.map(r => r.recipientUserId))];
      try {
        const supabase = getSupabaseClient();
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('id, username, email')
          .in('id', recipientIds);
        if (profiles) {
          const names: Record<string, string> = {};
          profiles.forEach((p: any) => { names[p.id] = p.username || p.email || ''; });
          setRecipientNames(names);
        }
      } catch { /* silent */ }
    }
    setLoading(false);
  }, [itemId, itemType]);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const handleRevoke = useCallback((req: MatchShareRequest) => {
    Alert.alert(
      t('matchSharing', 'revokeShare'),
      t('matchSharing', 'revokeShareConfirm'),
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('matchSharing', 'revokeShare'),
          style: 'destructive',
          onPress: async () => {
            setRevokingId(req.id);
            await revokeShareRequest(req.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setRequests(prev => prev.filter(r => r.id !== req.id));
            setRevokingId(null);
          },
        },
      ]
    );
  }, [t]);

  if (loading) {
    return (
      <View style={s.container}>
        <View style={s.headerRow}>
          <MaterialIcons name="group" size={16} color={theme.primary} />
          <Text style={s.headerTitle}>{t('matchSharing', 'shareStatusTitle')}</Text>
        </View>
        <ActivityIndicator size="small" color={theme.primary} style={{ paddingVertical: 12 }} />
      </View>
    );
  }

  if (requests.length === 0) return null;

  return (
    <View style={s.container}>
      <View style={s.headerRow}>
        <MaterialIcons name="group" size={16} color={theme.primary} />
        <Text style={s.headerTitle}>{t('matchSharing', 'shareStatusTitle')}</Text>
        <View style={s.countBadge}>
          <Text style={s.countText}>{requests.length}</Text>
        </View>
      </View>

      {requests.map((req) => {
        const statusCfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
        const isRevoking = revokingId === req.id;

        return (
          <View key={req.id} style={s.playerRow}>
            <View style={s.playerAvatar}>
              <Text style={s.avatarText}>
                {(recipientNames[req.recipientUserId] || '?').charAt(0).toUpperCase()}
              </Text>
            </View>

            <View style={s.playerInfo}>
              <Text style={s.playerName} numberOfLines={1}>
                {recipientNames[req.recipientUserId] || (language === 'fr' ? 'Joueur' : 'Player')}
              </Text>
              <View style={s.metaRow}>
                <View style={[s.statusBadge, { backgroundColor: statusCfg.color + '15' }]}>
                  <MaterialIcons name={statusCfg.icon} size={10} color={statusCfg.color} />
                  <Text style={[s.statusText, { color: statusCfg.color }]}>
                    {t('matchSharing', statusCfg.key)}
                  </Text>
                </View>
                <View style={[s.permBadge, { backgroundColor: (req.permission === 'write' ? theme.accent : theme.primary) + '15' }]}>
                  <MaterialIcons
                    name={req.permission === 'write' ? 'edit' : 'visibility'}
                    size={10}
                    color={req.permission === 'write' ? theme.accent : theme.primary}
                  />
                  <Text style={[s.permText, { color: req.permission === 'write' ? theme.accent : theme.primary }]}>
                    {t('matchSharing', req.permission === 'write' ? 'permissionWrite' : 'permissionRead')}
                  </Text>
                </View>
              </View>
            </View>

            {isOwner ? (
              <Pressable
                style={[s.revokeBtn, isRevoking && { opacity: 0.5 }]}
                onPress={() => handleRevoke(req)}
                disabled={isRevoking}
                hitSlop={6}
              >
                {isRevoking ? (
                  <ActivityIndicator size="small" color={theme.error} />
                ) : (
                  <MaterialIcons name="close" size={16} color={theme.error} />
                )}
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.primary + '20',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  headerTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: theme.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  countBadge: {
    backgroundColor: theme.primary + '15',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.primary,
  },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: theme.border + '60',
  },
  playerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 3,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  permBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  permText: {
    fontSize: 10,
    fontWeight: '600',
  },
  revokeBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.error + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
