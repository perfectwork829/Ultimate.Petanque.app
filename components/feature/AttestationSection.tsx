// ============================================
// Reusable Attestation Section Component
// Used in match-detail and challenge detail pages
// ============================================
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import {
  WitnessItemType,
  WitnessAttestation,
  fetchAttestationsForItem,
  requestWitness,
  checkAndSendOpponentConfirmations,
  buildMatchSnapshot,
  buildChallengeSnapshot,
} from '@/services/witnessService';

interface AttestationSectionProps {
  itemType: WitnessItemType;
  itemId: string;
  /** Snapshot data for the match/challenge */
  snapshotData?: Record<string, any>;
  /** Delay for stagger animation */
  animDelay?: number;
  /** Callback when attestation state changes */
  onAttestationChange?: (attested: boolean, count: number) => void;
}

interface PublicPlayer {
  id: string;
  userId: string;
  name: string;
}

export default function AttestationSection({
  itemType,
  itemId,
  snapshotData,
  animDelay = 0,
  onAttestationChange,
}: AttestationSectionProps) {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const fr = language === 'fr';

  const [attestations, setAttestations] = useState<WitnessAttestation[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [publicPlayers, setPublicPlayers] = useState<PublicPlayer[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [expandedSnapshots, setExpandedSnapshots] = useState<Set<string>>(new Set());

  const loadAttestations = useCallback(async () => {
    const result = await fetchAttestationsForItem(itemType, itemId);
    setAttestations(result);
    setLoading(false);

    const attestedCount = result.filter(a => a.status === 'attested').length;
    onAttestationChange?.(attestedCount > 0, attestedCount);
  }, [itemType, itemId, onAttestationChange]);

  useEffect(() => { loadAttestations(); }, [loadAttestations]);

  // Auto-send opponent confirmations for shared items
  useEffect(() => {
    if (!user || !itemId) return;
    checkAndSendOpponentConfirmations(itemType, itemId, snapshotData)
      .then(() => {
        // Reload attestations in case new opponent confirmations were created
        loadAttestations();
      })
      .catch(() => {});
  }, [itemType, itemId, user?.id]);

  const loadPublicPlayers = useCallback(async () => {
    if (!user) return;
    setLoadingPlayers(true);
    const supabase = getSupabaseClient();
    try {
      // Get players linked to users (not self)
      const { data } = await supabase
        .from('players')
        .select('id, user_id, name')
        .eq('is_public', true)
        .neq('user_id', user.id)
        .limit(50);

      if (data) {
        // Filter to only those with a linked user_id
        setPublicPlayers(
          data
            .filter((p: any) => p.user_id)
            .map((p: any) => ({ id: p.id, userId: p.user_id, name: p.name }))
        );
      }
    } catch { /* silent */ }
    setLoadingPlayers(false);
  }, [user]);

  const handleRequestWitness = useCallback(async (player: PublicPlayer) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setRequesting(true);
    setShowPicker(false);

    const { error } = await requestWitness({
      itemType,
      itemId,
      witnessUserId: player.userId,
      witnessName: player.name,
      snapshot: snapshotData,
    });

    setRequesting(false);

    if (error) {
      showAlert(fr ? 'Erreur' : 'Error', error);
      return;
    }

    showAlert(
      fr ? 'Demande envoyee' : 'Request sent',
      fr ? `${player.name} recevra une notification pour attester.` : `${player.name} will receive a notification to attest.`
    );

    loadAttestations();
  }, [itemType, itemId, snapshotData, fr, showAlert, loadAttestations]);

  const openPicker = useCallback(() => {
    Haptics.selectionAsync();
    setShowPicker(true);
    loadPublicPlayers();
  }, [loadPublicPlayers]);

  const attestedCount = attestations.filter(a => a.status === 'attested').length;
  const pendingCount = attestations.filter(a => a.status === 'pending').length;
  const canRequest = attestations.filter(a => a.status !== 'declined').length < 2;

  const getStatusColor = (status: string) => {
    if (status === 'attested') return '#22C55E';
    if (status === 'declined') return '#EF4444';
    return '#D97706';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'attested') return fr ? 'Atteste' : 'Attested';
    if (status === 'declined') return fr ? 'Refuse' : 'Declined';
    return fr ? 'En attente' : 'Pending';
  };

  const getAttestationTypeLabel = (type: string) => {
    if (type === 'opponent_confirmation') return fr ? 'Adversaire' : 'Opponent';
    if (type === 'confirmed') return fr ? 'Temoin' : 'Witness';
    return fr ? 'Temoin' : 'Witness';
  };

  const getStatusIcon = (status: string) => {
    if (status === 'attested') return 'check-circle';
    if (status === 'declined') return 'cancel';
    return 'schedule';
  };

  const toggleSnapshot = useCallback((id: string) => {
    Haptics.selectionAsync();
    setExpandedSnapshots(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  if (loading) {
    return (
      <View style={[st.card, { borderColor: '#7C3AED30', backgroundColor: '#7C3AED04' }]}>
        <ActivityIndicator size="small" color="#7C3AED" />
      </View>
    );
  }

  return (
    <View>
      <View style={[st.card, { borderWidth: 1, borderColor: '#7C3AED30', backgroundColor: '#7C3AED04' }]}>
        {/* Header */}
        <View style={st.headerRow}>
          <View style={st.headerIconBg}>
            <MaterialIcons name="visibility" size={18} color="#7C3AED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.headerTitle}>
              {fr ? 'Attestation par temoins' : 'Witness Attestation'}
            </Text>
            <Text style={st.headerSub}>
              {attestedCount > 0
                ? `${attestedCount} ${fr ? 'temoin(s) confirme(s)' : 'witness(es) confirmed'} • ${fr ? 'Poids' : 'Weight'} 2.0x`
                : fr ? 'Invitez un temoin pour valider (poids 2.0x)' : 'Invite a witness to validate (2.0x weight)'}
            </Text>
          </View>
          {attestedCount > 0 ? (
            <View style={st.attestedBadge}>
              <MaterialIcons name="verified" size={16} color="#22C55E" />
              <Text style={st.attestedBadgeText}>2.0x</Text>
            </View>
          ) : null}
        </View>

        {/* Existing attestations */}
        {attestations.length > 0 ? (
          <View style={st.attestationsList}>
            {attestations.map(a => {
              const sc = getStatusColor(a.status);
              const isOpponent = a.attestationType === 'opponent_confirmation';
              const snap = a.itemSnapshot;
              const isExpanded = expandedSnapshots.has(a.id);
              return (
                <View key={a.id} style={st.attestationRow}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <MaterialIcons name={isOpponent ? 'people' : (getStatusIcon(a.status) as any)} size={16} color={isOpponent ? '#3B82F6' : sc} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={st.attestationName}>{a.witnessName || a.witnessUserId.substring(0, 8)}</Text>
                          {isOpponent ? (
                            <View style={st.opponentChip}>
                              <Text style={st.opponentChipText}>{getAttestationTypeLabel(a.attestationType)}</Text>
                            </View>
                          ) : null}
                        </View>
                        {a.respondedAt ? (
                          <Text style={st.attestationDate}>
                            {new Date(a.respondedAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        ) : null}
                      </View>
                      <View style={[st.statusPill, { backgroundColor: sc + '15', borderColor: sc + '30' }]}>
                        <Text style={[st.statusPillText, { color: sc }]}>{getStatusLabel(a.status)}</Text>
                      </View>
                    </View>

                    {/* Snapshot toggle */}
                    {snap ? (
                      <View style={{ marginTop: 8 }}>
                        <Pressable
                          style={st.snapshotToggle}
                          onPress={() => toggleSnapshot(a.id)}
                        >
                          <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={14} color="#64748B" />
                          <MaterialIcons name="photo-camera" size={11} color="#64748B" />
                          <Text style={st.snapshotToggleText}>{isExpanded ? (fr ? 'Masquer' : 'Hide') : (fr ? 'Apercu snapshot' : 'Snapshot preview')}</Text>
                        </Pressable>
                        {isExpanded ? (
                          <View style={st.snapshotContainer}>
                            {itemType === 'match' && snap.teamA ? (
                              <>
                                <View style={st.snapshotRow}>
                                  <Text style={st.snapshotLabel}>{fr ? 'Equipes' : 'Teams'}</Text>
                                  <Text style={st.snapshotValueBold}>{snap.teamA?.playerNames?.join(', ')} vs {snap.teamB?.playerNames?.join(', ')}</Text>
                                </View>
                                <View style={st.snapshotRow}>
                                  <Text style={st.snapshotLabel}>Score</Text>
                                  <Text style={st.snapshotValueBold}>{snap.teamA?.score} - {snap.teamB?.score}</Text>
                                </View>
                                {snap.format ? (
                                  <View style={st.snapshotRow}>
                                    <Text style={st.snapshotLabel}>Format</Text>
                                    <Text style={st.snapshotValue}>{snap.format}{snap.duration ? ` - ${snap.duration} min` : ''}</Text>
                                  </View>
                                ) : null}
                              </>
                            ) : itemType === 'challenge' ? (
                              <>
                                <View style={st.snapshotRow}>
                                  <Text style={st.snapshotLabel}>Type</Text>
                                  <Text style={st.snapshotValueBold}>{snap.type} ({snap.mode})</Text>
                                </View>
                                {snap.successCount !== undefined ? (
                                  <View style={st.snapshotRow}>
                                    <Text style={st.snapshotLabel}>{fr ? 'Resultat' : 'Result'}</Text>
                                    <Text style={st.snapshotValueBold}>{snap.successCount}/{snap.totalShots}{snap.successRate ? ` (${snap.successRate}%)` : ''}</Text>
                                  </View>
                                ) : null}
                                {snap.playerName ? (
                                  <View style={st.snapshotRow}>
                                    <Text style={st.snapshotLabel}>{fr ? 'Joueur' : 'Player'}</Text>
                                    <Text style={st.snapshotValue}>{snap.playerName}{snap.opponentName ? ` vs ${snap.opponentName}` : ''}</Text>
                                  </View>
                                ) : null}
                              </>
                            ) : null}
                            <View style={st.snapshotTimestamp}>
                              <MaterialIcons name="lock-clock" size={9} color="#CBD5E1" />
                              <Text style={st.snapshotTimestampText}>
                                Snapshot {snap.snapshotAt ? new Date(snap.snapshotAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                              </Text>
                            </View>
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Request button */}
        {canRequest ? (
          <Pressable
            style={({ pressed }) => [st.requestBtn, pressed && { opacity: 0.85 }, requesting && { opacity: 0.5 }]}
            onPress={openPicker}
            disabled={requesting}
          >
            {requesting ? (
              <ActivityIndicator size="small" color="#7C3AED" />
            ) : (
              <MaterialIcons name="person-add" size={18} color="#7C3AED" />
            )}
            <Text style={st.requestBtnText}>
              {fr ? 'Demander une attestation' : 'Request attestation'}
            </Text>
          </Pressable>
        ) : (
          <View style={st.maxReachedRow}>
            <MaterialIcons name="info-outline" size={14} color={theme.textMuted} />
            <Text style={st.maxReachedText}>
              {fr ? 'Maximum 2 temoins atteint' : 'Maximum 2 witnesses reached'}
            </Text>
          </View>
        )}

        {/* Witness Picker */}
        {showPicker ? (
          <View style={st.pickerContainer}>
            <View style={st.pickerHeader}>
              <Text style={st.pickerTitle}>{fr ? 'Choisir un temoin' : 'Choose a witness'}</Text>
              <Pressable onPress={() => setShowPicker(false)} hitSlop={8}>
                <MaterialIcons name="close" size={20} color={theme.textMuted} />
              </Pressable>
            </View>

            {loadingPlayers ? (
              <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                <ActivityIndicator size="small" color="#7C3AED" />
              </View>
            ) : publicPlayers.length === 0 ? (
              <Text style={st.pickerEmpty}>
                {fr ? 'Aucun joueur public disponible' : 'No public players available'}
              </Text>
            ) : (
              <FlatList
                data={publicPlayers.slice(0, 10)}
                keyExtractor={p => p.id}
                style={{ maxHeight: 200 }}
                renderItem={({ item }) => (
                  <Pressable
                    style={({ pressed }) => [st.pickerItem, pressed && { backgroundColor: '#7C3AED08' }]}
                    onPress={() => handleRequestWitness(item)}
                  >
                    <View style={st.pickerAvatar}>
                      <Text style={st.pickerAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={st.pickerName}>{item.name}</Text>
                    <MaterialIcons name="send" size={16} color="#7C3AED" />
                  </Pressable>
                )}
              />
            )}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 16,
    marginBottom: 14,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  headerIconBg: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#7C3AED15', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 14, fontWeight: '700', color: '#7C3AED' },
  headerSub: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  attestedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#22C55E15', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: '#22C55E30' },
  attestedBadgeText: { fontSize: 12, fontWeight: '800', color: '#22C55E' },

  attestationsList: { gap: 8, marginBottom: 12 },
  attestationRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.backgroundSecondary, borderRadius: 10, padding: 10 },
  attestationName: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  attestationDate: { fontSize: 10, color: theme.textMuted, marginTop: 1 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  statusPillText: { fontSize: 10, fontWeight: '700' },

  requestBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, backgroundColor: '#7C3AED10', borderWidth: 1.5, borderColor: '#7C3AED25' },
  requestBtnText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },

  maxReachedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  maxReachedText: { fontSize: 11, color: theme.textMuted, fontWeight: '500' },

  pickerContainer: { marginTop: 12, backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#7C3AED20' },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  pickerTitle: { fontSize: 13, fontWeight: '700', color: theme.textPrimary },
  pickerEmpty: { fontSize: 12, color: theme.textMuted, textAlign: 'center', paddingVertical: 16 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10 },
  pickerAvatar: { width: 32, height: 32, borderRadius: 8, backgroundColor: '#7C3AED15', alignItems: 'center', justifyContent: 'center' },
  pickerAvatarText: { fontSize: 13, fontWeight: '700', color: '#7C3AED' },
  pickerName: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.textPrimary },

  opponentChip: { backgroundColor: '#3B82F612', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  opponentChipText: { fontSize: 9, fontWeight: '700', color: '#3B82F6', textTransform: 'uppercase' as const },

  // Snapshot preview
  snapshotToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, paddingVertical: 5, paddingHorizontal: 8, backgroundColor: '#F1F5F9', borderRadius: 8, alignSelf: 'flex-start' as const },
  snapshotToggleText: { fontSize: 10, fontWeight: '600' as const, color: '#64748B' },
  snapshotContainer: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0', gap: 4 },
  snapshotRow: { flexDirection: 'row' as const, justifyContent: 'space-between' as const },
  snapshotLabel: { fontSize: 10, color: '#64748B', fontWeight: '500' as const },
  snapshotValue: { fontSize: 10, color: '#0F172A', fontWeight: '600' as const },
  snapshotValueBold: { fontSize: 10, color: '#0F172A', fontWeight: '700' as const },
  snapshotTimestamp: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  snapshotTimestampText: { fontSize: 8, color: '#CBD5E1', fontWeight: '500' as const },
});
