import React, { useState, memo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, TextInput, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import { findMeetupByCode } from '@/services/meetupService';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function JoinMeetupModal({ visible, onClose }: Props) {
  const { t } = useLanguage();
  const { showAlert } = useAlert();
  const [joinCode, setJoinCode] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  const handleJoin = async () => {
    if (!joinCode.trim() || joinLoading) return;
    setJoinLoading(true);
    const { meetup: found } = await findMeetupByCode(joinCode.trim());
    setJoinLoading(false);
    if (found) {
      onClose();
      setJoinCode('');
      router.push(`/meetup/${found.id}` as any);
    } else {
      showAlert(t('common', 'error'), t('meetup', 'invalidCode'));
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.content}>
          <View style={s.header}>
            <Text style={s.title}>{t('meetup', 'joinMeetup')}</Text>
            <Pressable style={s.closeBtn} onPress={onClose}>
              <MaterialIcons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>
          <Text style={s.desc}>{t('meetup', 'enterMeetupCode')}</Text>
          <TextInput
            style={s.input}
            value={joinCode}
            onChangeText={setJoinCode}
            placeholder={t('meetup', 'enterCodePlaceholder')}
            placeholderTextColor={theme.textMuted}
            autoCapitalize="characters"
            autoFocus
          />
          <Pressable
            style={[s.btn, (!joinCode.trim() || joinLoading) && { opacity: 0.5 }]}
            disabled={!joinCode.trim() || joinLoading}
            onPress={handleJoin}
          >
            {joinLoading ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="search" size={20} color="#FFF" />
                <Text style={s.btnText}>{t('meetup', 'joinMeetup')}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default memo(JoinMeetupModal);

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
  content: { backgroundColor: '#FFF', borderRadius: 24, padding: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  desc: { fontSize: 14, color: theme.textSecondary, marginBottom: 16, lineHeight: 20 },
  input: { backgroundColor: '#F8FAFC', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 18, fontWeight: '700', color: theme.textPrimary, textAlign: 'center', letterSpacing: 2, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 16, borderRadius: 16 },
  btnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
