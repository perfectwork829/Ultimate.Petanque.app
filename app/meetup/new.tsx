import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Platform,
  Modal,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from '@/services/haptics';
import * as Clipboard from 'expo-clipboard';
import theme from '@/constants/theme';
import { useAppData } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import { createMeetup, scheduleMeetupReminder, getInvitableUsers, inviteUsersToMeetup, InvitableUser } from '@/services/meetupService';
import { useAuth } from '@/template';

export default function NewMeetupScreen() {
  const insets = useSafeAreaInsets();
  const { terrains } = useAppData();
  const { t, language } = useLanguage();
  const { showAlert } = useAlert();
  const params = useLocalSearchParams<{ terrainId?: string }>();

  const [title, setTitle] = useState('');
  const [selectedTerrainId, setSelectedTerrainId] = useState<string | null>(params.terrainId || null);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(14, 0, 0, 0);
    return d;
  });
  const [endDate, setEndDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(16, 0, 0, 0);
    return d;
  });
  const [maxParticipants, setMaxParticipants] = useState('8');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [showTerrainPicker, setShowTerrainPicker] = useState(false);
  const [terrainSearch, setTerrainSearch] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showEndTimePicker, setShowEndTimePicker] = useState(false);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdMeetupId, setCreatedMeetupId] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [invitableUsers, setInvitableUsers] = useState<InvitableUser[]>([]);
  const [selectedInvitees, setSelectedInvitees] = useState<Set<string>>(new Set());
  const [loadingInvitees, setLoadingInvitees] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const { user } = useAuth();

  const selectedTerrain = useMemo(
    () => selectedTerrainId ? terrains.find(tr => tr.id === selectedTerrainId) || null : null,
    [selectedTerrainId, terrains]
  );

  const filteredTerrains = useMemo(() => {
    const s = terrainSearch.toLowerCase();
    return terrains.filter(tr => !s || tr.name.toLowerCase().includes(s) || tr.city.toLowerCase().includes(s));
  }, [terrains, terrainSearch]);

  const handleSave = useCallback(async () => {
    if (!title.trim()) {
      showAlert(t('common', 'error'), t('meetup', 'titleRequired'));
      return;
    }
    if (!selectedTerrainId) {
      showAlert(t('common', 'error'), t('meetup', 'terrainRequired'));
      return;
    }
    if (date <= new Date()) {
      showAlert(t('common', 'error'), t('meetup', 'dateMustBeFuture'));
      return;
    }
    if (endDate <= date) {
      showAlert(t('common', 'error'), language === 'fr' ? 'L\'heure de fin doit etre apres l\'heure de debut' : 'End time must be after start time');
      return;
    }

    setSaving(true);
    const { meetup, error } = await createMeetup({
      terrainId: selectedTerrainId,
      title: title.trim(),
      date: date.toISOString(),
      endTime: endDate.toISOString(),
      maxParticipants: parseInt(maxParticipants) || 8,
      notes: notes.trim() || undefined,
    });
    setSaving(false);

    if (error) {
      showAlert(t('common', 'error'), error);
      return;
    }

    if (meetup) {
      // Schedule local reminder
      await scheduleMeetupReminder(meetup, selectedTerrain?.name || '');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreatedCode(meetup.share_code);
      setCreatedMeetupId(meetup.id);
    }
  }, [title, selectedTerrainId, date, maxParticipants, notes, selectedTerrain, t, showAlert]);

  const handleOpenInviteModal = useCallback(async () => {
    setShowInviteModal(true);
    setLoadingInvitees(true);
    setInviteSearch('');
    setSelectedInvitees(new Set());
    const { users } = await getInvitableUsers();
    setInvitableUsers(users);
    setLoadingInvitees(false);
  }, []);

  const toggleInvitee = useCallback((userId: string) => {
    setSelectedInvitees(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    Haptics.selectionAsync();
  }, []);

  const handleSendInvitations = useCallback(async () => {
    if (!createdMeetupId || selectedInvitees.size === 0) return;
    setInviting(true);
    const { invited, error } = await inviteUsersToMeetup(createdMeetupId, Array.from(selectedInvitees));
    setInviting(false);
    if (error) {
      showAlert(t('common', 'error'), error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showAlert(t('meetup', 'inviteSuccess'), `${invited} ${t('meetup', 'inviteSuccessDesc')}`);
    setShowInviteModal(false);
  }, [createdMeetupId, selectedInvitees, t, showAlert]);

  const filteredInvitees = useMemo(() => {
    const s = inviteSearch.toLowerCase();
    return invitableUsers.filter(u => !s || u.name.toLowerCase().includes(s) || u.club.toLowerCase().includes(s));
  }, [invitableUsers, inviteSearch]);

  const handleCopyCode = useCallback(async () => {
    if (createdCode) {
      await Clipboard.setStringAsync(createdCode);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('common', 'success'), t('meetup', 'codeCopied'));
    }
  }, [createdCode, t, showAlert]);

  // Success screen
  if (createdCode) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => router.back()}>
            <MaterialIcons name="close" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('meetup', 'meetupCreated')}</Text>
          <View style={styles.headerBtn} />
        </View>
        <ScrollView contentContainerStyle={styles.successContent}>
          <View style={styles.successIcon}>
            <MaterialIcons name="check-circle" size={64} color={theme.success} />
          </View>
          <Text style={styles.successTitle}>{t('meetup', 'meetupCreated')}</Text>
          <Text style={styles.successSubtitle}>{t('meetup', 'shareCodeToInvite')}</Text>

          <Pressable style={styles.codeCard} onPress={handleCopyCode}>
            <Text style={styles.codeLabel}>{t('meetup', 'shareCodeLabel')}</Text>
            <Text style={styles.codeValue}>{createdCode}</Text>
            <View style={styles.copyBtn}>
              <MaterialIcons name="content-copy" size={18} color={theme.primary} />
              <Text style={styles.copyBtnText}>{t('meetup', 'copyCode')}</Text>
            </View>
          </Pressable>

          <View style={styles.successInfo}>
            <MaterialIcons name="info-outline" size={18} color={theme.textSecondary} />
            <Text style={styles.successInfoText}>{t('meetup', 'shareInstructions')}</Text>
          </View>

          {/* Invite Players Button */}
          <Pressable style={styles.inviteBtn} onPress={handleOpenInviteModal}>
            <MaterialIcons name="person-add" size={20} color={theme.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteBtnText}>{t('meetup', 'invitePlayers')}</Text>
              <Text style={styles.inviteBtnDesc}>{t('meetup', 'invitePlayersDesc')}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
          </Pressable>

          <Pressable style={styles.doneBtn} onPress={() => router.back()}>
            <Text style={styles.doneBtnText}>{t('common', 'close')}</Text>
          </Pressable>
        </ScrollView>

        {/* Invite Players Modal */}
        <Modal visible={showInviteModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowInviteModal(false)}>
          <SafeAreaView style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Pressable style={styles.modalCloseBtn} onPress={() => setShowInviteModal(false)}>
                <MaterialIcons name="close" size={24} color={theme.textPrimary} />
              </Pressable>
              <Text style={styles.modalTitle}>{t('meetup', 'invitePlayers')}</Text>
              <View style={{ width: 40 }}>
                {selectedInvitees.size > 0 ? (
                  <View style={styles.inviteCountBadge}>
                    <Text style={styles.inviteCountText}>{selectedInvitees.size}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={styles.modalSearch}>
              <MaterialIcons name="search" size={20} color={theme.textMuted} />
              <TextInput style={styles.modalSearchInput} value={inviteSearch} onChangeText={setInviteSearch} placeholder={`${t('common', 'search')}...`} placeholderTextColor={theme.textMuted} />
            </View>

            <View style={styles.inviteNote}>
              <MaterialIcons name="info-outline" size={16} color={theme.primary} />
              <Text style={styles.inviteNoteText}>{t('meetup', 'inviteNote')}</Text>
            </View>

            {loadingInvitees ? (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator size="large" color={theme.primary} />
              </View>
            ) : (
              <FlatList
                data={filteredInvitees}
                keyExtractor={item => item.userId}
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item: u }) => {
                  const isSelected = selectedInvitees.has(u.userId);
                  return (
                    <Pressable
                      style={[styles.inviteeCard, isSelected && styles.inviteeCardSelected]}
                      onPress={() => toggleInvitee(u.userId)}
                    >
                      <View style={styles.inviteeAvatar}>
                        <Text style={styles.inviteeAvatarText}>{u.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.inviteeName}>{u.name}</Text>
                          <View style={[styles.sourceTag, u.source === 'public' ? styles.sourceTagPublic : styles.sourceTagShared]}>
                            <Text style={[styles.sourceTagText, u.source === 'public' ? styles.sourceTagTextPublic : styles.sourceTagTextShared]}>
                              {u.source === 'public' ? t('meetup', 'publicPlayer') : t('meetup', 'sharedPlayer')}
                            </Text>
                          </View>
                        </View>
                        {u.club || u.role ? <Text style={styles.inviteeSub}>{[u.club, u.role].filter(Boolean).join(' • ')}</Text> : null}
                      </View>
                      <View style={[styles.inviteeCheck, isSelected && styles.inviteeCheckSelected]}>
                        {isSelected ? <MaterialIcons name="check" size={16} color="#FFF" /> : null}
                      </View>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 }}>
                    <MaterialIcons name="person-search" size={48} color={theme.textMuted} />
                    <Text style={{ fontSize: 15, fontWeight: '600', color: theme.textPrimary, marginTop: 12, textAlign: 'center' }}>{t('meetup', 'noInvitablePlayers')}</Text>
                    <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 6, textAlign: 'center', lineHeight: 19 }}>{t('meetup', 'noInvitablePlayersDesc')}</Text>
                  </View>
                }
              />
            )}

            {selectedInvitees.size > 0 ? (
              <View style={styles.inviteBottomAction}>
                <Pressable style={[styles.inviteSendBtn, inviting && { opacity: 0.6 }]} onPress={handleSendInvitations} disabled={inviting}>
                  {inviting ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <>
                      <MaterialIcons name="send" size={20} color="#FFF" />
                      <Text style={styles.inviteSendBtnText}>{t('meetup', 'inviteSend')} ({selectedInvitees.size})</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : null}
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialIcons name="close" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('meetup', 'newMeetup')}</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.formContent, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('meetup', 'meetupTitle')} *</Text>
          <TextInput
            style={styles.fieldInput}
            value={title}
            onChangeText={setTitle}
            placeholder={t('meetup', 'titlePlaceholder')}
            placeholderTextColor={theme.textMuted}
          />
        </View>

        {/* Terrain */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('meetup', 'terrain')} *</Text>
          <Pressable style={styles.pickerBtn} onPress={() => { setTerrainSearch(''); setShowTerrainPicker(true); }}>
            <View style={[styles.pickerIcon, { backgroundColor: selectedTerrain ? theme.primary + '15' : theme.textMuted + '10' }]}>
              <MaterialIcons name="place" size={20} color={selectedTerrain ? theme.primary : theme.textMuted} />
            </View>
            <Text style={[styles.pickerText, !selectedTerrain && styles.pickerPlaceholder]} numberOfLines={1}>
              {selectedTerrain ? `${selectedTerrain.name} • ${selectedTerrain.city}` : t('match', 'chooseTerrain')}
            </Text>
            <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
          </Pressable>
        </View>

        {/* Date */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('meetup', 'dateAndTime')} *</Text>
          <View style={styles.dateRow}>
            <Pressable style={[styles.dateBtn, { flex: 1 }]} onPress={() => setShowDatePicker(true)}>
              <MaterialIcons name="calendar-today" size={18} color={theme.primary} />
              <Text style={styles.dateBtnText}>
                {date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
              </Text>
            </Pressable>
            <Pressable style={styles.dateBtn} onPress={() => setShowTimePicker(true)}>
              <MaterialIcons name="schedule" size={18} color={theme.primary} />
              <Text style={styles.dateBtnText}>
                {date.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* End Time */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{language === 'fr' ? 'Heure de fin' : 'End time'} *</Text>
          <Pressable style={styles.dateBtn} onPress={() => setShowEndTimePicker(true)}>
            <MaterialIcons name="schedule" size={18} color="#EF4444" />
            <Text style={styles.dateBtnText}>
              {endDate.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            <Text style={{ fontSize: 12, color: theme.textMuted, marginLeft: 'auto' }}>
              {(() => {
                const diffMs = endDate.getTime() - date.getTime();
                const diffH = Math.floor(diffMs / 3600000);
                const diffM = Math.round((diffMs % 3600000) / 60000);
                return diffMs > 0 ? `${diffH}h${diffM > 0 ? `${diffM.toString().padStart(2, '0')}` : ''}` : (language === 'fr' ? 'invalide' : 'invalid');
              })()}
            </Text>
          </Pressable>
        </View>

        {/* Max participants */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('meetup', 'maxParticipants')}</Text>
          <View style={styles.counterRow}>
            <Pressable style={styles.counterBtn} onPress={() => setMaxParticipants(String(Math.max(2, (parseInt(maxParticipants) || 8) - 1)))}>
              <MaterialIcons name="remove" size={20} color={theme.primary} />
            </Pressable>
            <TextInput
              style={styles.counterInput}
              value={maxParticipants}
              onChangeText={setMaxParticipants}
              keyboardType="numeric"
            />
            <Pressable style={styles.counterBtn} onPress={() => setMaxParticipants(String(Math.min(50, (parseInt(maxParticipants) || 8) + 1)))}>
              <MaterialIcons name="add" size={20} color={theme.primary} />
            </Pressable>
          </View>
        </View>

        {/* Notes */}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>{t('meetup', 'notesLabel')}</Text>
          <TextInput
            style={[styles.fieldInput, styles.textArea]}
            value={notes}
            onChangeText={setNotes}
            placeholder={t('meetup', 'notesPlaceholder')}
            placeholderTextColor={theme.textMuted}
            multiline
            numberOfLines={3}
          />
        </View>
      </ScrollView>

      {/* Bottom Action */}
      <View style={[styles.bottomAction, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={[styles.createBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <MaterialIcons name="event" size={22} color="#FFF" />
              <Text style={styles.createBtnText}>{t('meetup', 'createMeetup')}</Text>
            </>
          )}
        </Pressable>
      </View>

      {/* Date Picker */}
      {showDatePicker && (
        <DateTimePicker
          value={date}
          mode="date"
          minimumDate={new Date()}
          onChange={(_, selectedDate) => {
            setShowDatePicker(false);
            if (selectedDate) {
              const newDate = new Date(date);
              newDate.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
              setDate(newDate);
            }
          }}
        />
      )}
      {showTimePicker && (
        <DateTimePicker
          value={date}
          mode="time"
          is24Hour
          onChange={(_, selectedDate) => {
            setShowTimePicker(false);
            if (selectedDate) {
              const newDate = new Date(date);
              newDate.setHours(selectedDate.getHours(), selectedDate.getMinutes());
              setDate(newDate);
              // Auto-adjust end time if it's before new start
              if (endDate <= newDate) {
                const newEnd = new Date(newDate);
                newEnd.setHours(newEnd.getHours() + 2);
                setEndDate(newEnd);
              }
            }
          }}
        />
      )}
      {showEndTimePicker && (
        <DateTimePicker
          value={endDate}
          mode="time"
          is24Hour
          onChange={(_, selectedDate) => {
            setShowEndTimePicker(false);
            if (selectedDate) {
              const newEnd = new Date(date);
              newEnd.setHours(selectedDate.getHours(), selectedDate.getMinutes());
              setEndDate(newEnd);
            }
          }}
        />
      )}

      {/* Terrain Picker Modal */}
      <Modal visible={showTerrainPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowTerrainPicker(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalCloseBtn} onPress={() => setShowTerrainPicker(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>{t('meetup', 'terrain')}</Text>
            <View style={{ width: 40 }} />
          </View>
          <View style={styles.modalSearch}>
            <MaterialIcons name="search" size={20} color={theme.textMuted} />
            <TextInput style={styles.modalSearchInput} value={terrainSearch} onChangeText={setTerrainSearch} placeholder={`${t('common', 'search')}...`} placeholderTextColor={theme.textMuted} autoFocus />
          </View>
          <FlatList
            data={filteredTerrains}
            keyExtractor={item => item.id}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item: tr }) => (
              <Pressable
                style={[styles.modalItem, selectedTerrainId === tr.id && styles.modalItemActive]}
                onPress={() => { Haptics.selectionAsync(); setSelectedTerrainId(tr.id); setShowTerrainPicker(false); }}
              >
                <View style={[styles.modalItemIcon, { backgroundColor: selectedTerrainId === tr.id ? theme.primary : theme.primary + '15' }]}>
                  <MaterialIcons name="place" size={20} color={selectedTerrainId === tr.id ? '#FFF' : theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalItemName}>{tr.name}</Text>
                  <Text style={styles.modalItemSub}>{tr.city} • {tr.type}</Text>
                </View>
                {selectedTerrainId === tr.id ? <MaterialIcons name="check-circle" size={20} color={theme.primary} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.modalEmpty}>
                <MaterialIcons name="place" size={40} color={theme.textMuted} />
                <Text style={styles.modalEmptyText}>{t('common', 'noResults')}</Text>
              </View>
            }
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  formContent: { paddingHorizontal: 16, paddingTop: 20 },
  field: { marginBottom: 20 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, marginBottom: 8, textTransform: 'uppercase' },
  fieldInput: { backgroundColor: theme.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: theme.textPrimary, borderWidth: 1, borderColor: theme.border },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  pickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: theme.border },
  pickerIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pickerText: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  pickerPlaceholder: { color: theme.textMuted, fontWeight: '400' },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border },
  dateBtnText: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  counterBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' },
  counterInput: { width: 60, textAlign: 'center', fontSize: 20, fontWeight: '700', color: theme.textPrimary, backgroundColor: theme.surface, borderRadius: 12, paddingVertical: 10, borderWidth: 1, borderColor: theme.border },
  bottomAction: { paddingHorizontal: 16, paddingTop: 14, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 16, borderRadius: 16 },
  createBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  // Success
  successContent: { alignItems: 'center', paddingHorizontal: 24, paddingTop: 48 },
  successIcon: { marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: '800', color: theme.textPrimary, marginBottom: 8 },
  successSubtitle: { fontSize: 15, color: theme.textSecondary, textAlign: 'center', marginBottom: 32 },
  codeCard: { backgroundColor: theme.surface, borderRadius: 20, padding: 24, alignItems: 'center', width: '100%', borderWidth: 2, borderColor: theme.primary + '20', ...theme.shadows.cardElevated },
  codeLabel: { fontSize: 11, fontWeight: '700', color: theme.textSecondary, letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' },
  codeValue: { fontSize: 32, fontWeight: '900', color: theme.primary, letterSpacing: 3, marginBottom: 16 },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.primary + '15', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 },
  copyBtnText: { fontSize: 14, fontWeight: '700', color: theme.primary },
  successInfo: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: theme.primary + '08', borderRadius: 14, padding: 16, marginTop: 24, width: '100%' },
  successInfoText: { flex: 1, fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
  doneBtn: { marginTop: 32, backgroundColor: theme.textPrimary, paddingHorizontal: 40, paddingVertical: 14, borderRadius: 14 },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  // Modal
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  modalSearch: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, gap: 10, borderWidth: 1, borderColor: theme.border },
  modalSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },
  modalItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: theme.surface, borderRadius: 12, marginBottom: 8 },
  modalItemActive: { borderWidth: 2, borderColor: theme.primary },
  modalItemIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalItemName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  modalItemSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  modalEmpty: { alignItems: 'center', paddingVertical: 40 },
  modalEmptyText: { fontSize: 14, color: theme.textMuted, marginTop: 10 },
  // Invite
  inviteBtn: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.accent + '10', borderRadius: 16, padding: 18, marginTop: 20, width: '100%', borderWidth: 1.5, borderColor: theme.accent + '25' },
  inviteBtnText: { fontSize: 15, fontWeight: '700', color: theme.accent },
  inviteBtnDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  inviteCountBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center' },
  inviteCountText: { fontSize: 12, fontWeight: '800', color: '#FFF' },
  inviteNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: theme.primary + '08', borderRadius: 12, padding: 12, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: theme.primary + '15' },
  inviteNoteText: { flex: 1, fontSize: 12, color: theme.textSecondary, lineHeight: 17 },
  inviteeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: theme.border },
  inviteeCardSelected: { borderColor: theme.primary, backgroundColor: theme.primary + '06' },
  inviteeAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center' },
  inviteeAvatarText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  inviteeName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  inviteeSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  sourceTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  sourceTagPublic: { backgroundColor: theme.success + '15' },
  sourceTagShared: { backgroundColor: theme.accent + '15' },
  sourceTagText: { fontSize: 10, fontWeight: '700' },
  sourceTagTextPublic: { color: theme.success },
  sourceTagTextShared: { color: theme.accent },
  inviteeCheck: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: theme.border, alignItems: 'center', justifyContent: 'center' },
  inviteeCheckSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  inviteBottomAction: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  inviteSendBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 16, borderRadius: 16 },
  inviteSendBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
