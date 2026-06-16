import React, { memo } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Share as RNShare } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import { config } from '@/constants/config';

interface Props {
  visible: boolean;
  onClose: () => void;
}

function QRShareModal({ visible, onClose }: Props) {
  const { t, language } = useLanguage();
  const { showAlert } = useAlert();

  const handleCopy = async () => {
    try {
      const Clipboard = require('expo-clipboard');
      await Clipboard.setStringAsync(config.appDownloadUrl);
    } catch {
      try { await RNShare.share({ message: config.appDownloadUrl }); } catch {}
    }
    showAlert(t('home', 'linkCopied'));
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.content}>
          <View style={s.header}>
            <Text style={s.headerTitle}>{t('home', 'shareAppTitle')}</Text>
            <Pressable style={s.closeBtn} onPress={onClose}>
              <MaterialIcons name="close" size={22} color={theme.textSecondary} />
            </Pressable>
          </View>
          <View style={s.body}>
            <View style={s.qrWrapper}>
              <View style={s.qrPlaceholder}>
                <MaterialIcons name="qr-code-2" size={80} color="#1E3A8A" />
                <Text style={s.qrUrl} numberOfLines={2}>{config.appDownloadUrl}</Text>
              </View>
            </View>
            <Text style={s.appName}>Ultimate Petanque</Text>
            <Text style={s.desc}>{t('home', 'shareAppDesc')}</Text>
            <View style={s.note}>
              <MaterialIcons name="people" size={18} color={theme.success} />
              <Text style={s.noteText}>{t('home', 'shareAppNote')}</Text>
            </View>
          </View>
          <View style={s.actions}>
            <Pressable style={s.copyBtn} onPress={handleCopy}>
              <MaterialIcons name="content-copy" size={18} color={theme.primary} />
              <Text style={s.copyBtnText}>{t('home', 'copyLink')}</Text>
            </Pressable>
            <Pressable style={s.doneBtn} onPress={onClose}>
              <Text style={s.doneBtnText}>{t('common', 'close')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default memo(QRShareModal);

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
  content: { backgroundColor: '#FFF', borderRadius: 24, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  body: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 24 },
  qrWrapper: { backgroundColor: '#FFF', padding: 16, borderRadius: 20, borderWidth: 2, borderColor: '#E2E8F0', marginBottom: 20 },
  qrPlaceholder: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6', borderRadius: 12 },
  qrUrl: { fontSize: 11, color: theme.textMuted, marginTop: 8, textAlign: 'center', paddingHorizontal: 12 },
  appName: { fontSize: 20, fontWeight: '800', color: '#1E3A8A', marginBottom: 6 },
  desc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: theme.success + '08', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: theme.success + '15' },
  noteText: { flex: 1, fontSize: 12, color: theme.textSecondary, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  copyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: theme.primary + '10' },
  copyBtnText: { fontSize: 15, fontWeight: '600', color: theme.primary },
  doneBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: '#F1F5F9' },
  doneBtnText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
});
