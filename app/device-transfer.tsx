import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert } from '@/template';
import PageErrorBoundary from '@/components/ui/PageErrorBoundary';
import {
  createTransferRequest, getMyTransferRequest, cancelTransferRequest,
  DeviceTransferRequest,
} from '@/services/deviceTransferService';

export default function DeviceTransferScreen() {
  const { language } = useLanguage();
  const { showAlert } = useAlert();
  const isFr = language === 'fr';

  const [request, setRequest] = useState<DeviceTransferRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    (async () => {
      const { request: req } = await getMyTransferRequest();
      setRequest(req);
      setLoading(false);
    })();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const { request: newReq, error } = await createTransferRequest();
    setCreating(false);
    if (error) {
      showAlert(isFr ? 'Erreur' : 'Error', error);
      return;
    }
    setRequest(newReq);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleCancel = async () => {
    if (!request) return;
    setCancelling(true);
    const { error } = await cancelTransferRequest(request.id);
    setCancelling(false);
    if (error) {
      showAlert(isFr ? 'Erreur' : 'Error', error);
      return;
    }
    setRequest(null);
  };

  const isPending = request?.status === 'pending' && new Date(request.expiresAt) > new Date();
  const isValidated = request?.status === 'validated';
  const isExpired = request?.status === 'pending' && new Date(request.expiresAt) <= new Date();

  return (
    <PageErrorBoundary pageName="DeviceTransfer">
      <SafeAreaView edges={['top']} style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{isFr ? 'Transfert d\'appareil' : 'Device Transfer'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={s.content}>
          {loading ? (
            <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 60 }} />
          ) : isPending ? (
            <View style={s.card}>
              <View style={s.cardIcon}>
                <MaterialIcons name="hourglass-top" size={48} color="#F59E0B" />
              </View>
              <Text style={s.cardTitle}>{isFr ? 'Demande en cours' : 'Request Pending'}</Text>
              <Text style={s.cardDesc}>
                {isFr
                  ? 'Communiquez ce code a un administrateur pour valider le transfert de votre compte vers un nouvel appareil.'
                  : 'Share this code with an administrator to validate transferring your account to a new device.'}
              </Text>
              <View style={s.codeBox}>
                <Text style={s.codeText}>{request?.transferCode}</Text>
              </View>
              <Text style={s.expiry}>
                {isFr ? 'Expire le' : 'Expires'}: {new Date(request!.expiresAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Pressable style={[s.cancelBtn, cancelling && { opacity: 0.6 }]} onPress={handleCancel} disabled={cancelling}>
                {cancelling ? <ActivityIndicator size="small" color="#EF4444" /> : <MaterialIcons name="close" size={18} color="#EF4444" />}
                <Text style={s.cancelBtnText}>{isFr ? 'Annuler la demande' : 'Cancel request'}</Text>
              </Pressable>
            </View>
          ) : isValidated ? (
            <View style={s.card}>
              <View style={[s.cardIcon, { backgroundColor: '#22C55E15' }]}>
                <MaterialIcons name="check-circle" size={48} color="#22C55E" />
              </View>
              <Text style={s.cardTitle}>{isFr ? 'Transfert valide !' : 'Transfer Validated!'}</Text>
              <Text style={s.cardDesc}>
                {isFr
                  ? 'Votre ancien appareil a ete delie. Connectez-vous sur votre nouvel appareil pour lier votre compte.'
                  : 'Your old device has been unlinked. Log in on your new device to bind your account.'}
              </Text>
              <Pressable style={s.newRequestBtn} onPress={handleCreate} disabled={creating}>
                <Text style={s.newRequestBtnText}>{isFr ? 'Nouvelle demande' : 'New request'}</Text>
              </Pressable>
            </View>
          ) : (
            <View style={s.card}>
              <View style={s.cardIcon}>
                <MaterialIcons name="swap-horiz" size={48} color={theme.primary} />
              </View>
              <Text style={s.cardTitle}>{isFr ? 'Changer d\'appareil' : 'Change Device'}</Text>
              <Text style={s.cardDesc}>
                {isFr
                  ? 'Pour des raisons anti-triche, votre compte est lie a cet appareil. Si vous changez de telephone, generez un code de transfert ci-dessous et communiquez-le au support ou a un administrateur.'
                  : 'For anti-cheat purposes, your account is linked to this device. If you change phones, generate a transfer code below and share it with support or an admin.'}
              </Text>
              <View style={s.steps}>
                {[
                  { icon: 'confirmation-number', text: isFr ? '1. Generez un code de transfert' : '1. Generate a transfer code' },
                  { icon: 'send', text: isFr ? '2. Communiquez-le au support' : '2. Share it with support' },
                  { icon: 'check-circle', text: isFr ? '3. L\'admin valide et delie l\'ancien appareil' : '3. Admin validates and unlinks old device' },
                  { icon: 'phone-android', text: isFr ? '4. Connectez-vous sur votre nouvel appareil' : '4. Log in on your new device' },
                ].map((step, i) => (
                  <View key={i} style={s.stepRow}>
                    <MaterialIcons name={step.icon as any} size={18} color={theme.primary} />
                    <Text style={s.stepText}>{step.text}</Text>
                  </View>
                ))}
              </View>
              <Pressable style={[s.generateBtn, creating && { opacity: 0.6 }]} onPress={handleCreate} disabled={creating}>
                {creating ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="vpn-key" size={20} color="#FFF" />}
                <Text style={s.generateBtnText}>{isFr ? 'Generer un code de transfert' : 'Generate transfer code'}</Text>
              </Pressable>
              {isExpired ? (
                <Text style={s.expiredNote}>
                  {isFr ? 'Votre precedente demande a expire. Generez un nouveau code.' : 'Your previous request expired. Generate a new code.'}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      </SafeAreaView>
    </PageErrorBoundary>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 24 },
  card: { backgroundColor: theme.surface, borderRadius: 20, padding: 24, alignItems: 'center', ...theme.shadows.card },
  cardIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  cardTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, marginBottom: 12, textAlign: 'center' },
  cardDesc: { fontSize: 14, color: theme.textSecondary, lineHeight: 22, textAlign: 'center', marginBottom: 20 },
  codeBox: { backgroundColor: '#F59E0B10', borderWidth: 2, borderColor: '#F59E0B30', borderRadius: 16, paddingVertical: 18, paddingHorizontal: 32, marginBottom: 12 },
  codeText: { fontSize: 32, fontWeight: '900', color: '#F59E0B', letterSpacing: 6, textAlign: 'center' },
  expiry: { fontSize: 12, color: theme.textMuted, marginBottom: 20 },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#EF444412', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: '#EF4444' },
  steps: { width: '100%', gap: 12, marginBottom: 24 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepText: { fontSize: 14, color: theme.textSecondary, flex: 1 },
  generateBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 16, paddingHorizontal: 24, borderRadius: 14, width: '100%' },
  generateBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  newRequestBtn: { backgroundColor: theme.primary + '15', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, marginTop: 12 },
  newRequestBtnText: { fontSize: 14, fontWeight: '600', color: theme.primary },
  expiredNote: { fontSize: 12, color: '#F59E0B', fontWeight: '600', marginTop: 12, textAlign: 'center' },
});
