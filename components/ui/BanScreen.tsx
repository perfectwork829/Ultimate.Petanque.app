/**
 * BanScreen
 *
 * Full-screen overlay shown when the current user is banned.
 * Blocks all app interaction and shows ban reason + contact info.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Linking, TextInput, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '@/constants/theme';
import { BanInfo } from '@/services/banCheckService';
import { useAuth } from '@/template';
import { submitBanAppeal, getMyAppeals, BanAppeal } from '@/services/banAppealService';

const REASON_LABELS: Record<string, { fr: string; en: string }> = {
  fake_stats: { fr: 'Statistiques falsifiees', en: 'Fake statistics' },
  unsportsmanlike: { fr: 'Comportement antisportif', en: 'Unsportsmanlike behavior' },
  harassment: { fr: 'Harcelement', en: 'Harassment' },
  cheating: { fr: 'Triche', en: 'Cheating' },
  inappropriate: { fr: 'Contenu inapproprie', en: 'Inappropriate content' },
  other: { fr: 'Violation des regles', en: 'Rule violation' },
};

interface BanScreenProps {
  banInfo: BanInfo;
  language: string;
}

export default function BanScreen({ banInfo, language }: BanScreenProps) {
  const { logout } = useAuth();
  const fr = language === 'fr';
  const reasonLabel = REASON_LABELS[banInfo.reason || 'other'] || REASON_LABELS.other;

  const [showAppeal, setShowAppeal] = useState(false);
  const [appealMessage, setAppealMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [appealSent, setAppealSent] = useState(false);
  const [appealError, setAppealError] = useState<string | null>(null);
  const [existingAppeals, setExistingAppeals] = useState<BanAppeal[]>([]);
  const [loadingAppeals, setLoadingAppeals] = useState(true);

  useEffect(() => {
    getMyAppeals().then(({ appeals }) => {
      setExistingAppeals(appeals);
      if (appeals.some(a => a.status === 'pending')) setAppealSent(true);
      setLoadingAppeals(false);
    }).catch(() => setLoadingAppeals(false));
  }, []);

  const handleSubmitAppeal = async () => {
    if (!appealMessage.trim() || submitting) return;
    setSubmitting(true);
    setAppealError(null);
    const { error } = await submitBanAppeal(appealMessage.trim());
    if (error) {
      if (error === 'appeal_already_pending') {
        setAppealError(fr ? 'Un appel est deja en cours de traitement.' : 'An appeal is already pending.');
      } else {
        setAppealError(error);
      }
    } else {
      setAppealSent(true);
      setAppealMessage('');
    }
    setSubmitting(false);
  };

  const handleContact = () => {
    Linking.openURL('mailto:contact@onspace.ai?subject=Ban Appeal');
  };

  const handleLogout = async () => {
    await logout();
  };

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Icon */}
        <View style={s.iconWrap}>
          <View style={s.iconOuter}>
            <View style={s.iconInner}>
              <MaterialIcons name="block" size={48} color="#DC2626" />
            </View>
          </View>
        </View>

        {/* Title */}
        <Text style={s.title}>
          {fr ? 'Compte suspendu' : 'Account Suspended'}
        </Text>

        {/* Description */}
        <Text style={s.description}>
          {fr
            ? 'Votre compte a ete banni pour non-respect des regles de la communaute. L\'acces a l\'application est desormais bloque.'
            : 'Your account has been banned for violating community rules. Access to the application is now blocked.'}
        </Text>

        {/* Reason card */}
        <View style={s.reasonCard}>
          <View style={s.reasonHeader}>
            <MaterialIcons name="gavel" size={16} color="#991B1B" />
            <Text style={s.reasonTitle}>{fr ? 'Motif' : 'Reason'}</Text>
          </View>
          <Text style={s.reasonText}>{fr ? reasonLabel.fr : reasonLabel.en}</Text>
          {banInfo.bannedAt ? (
            <Text style={s.reasonDate}>
              {new Date(banInfo.bannedAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}
            </Text>
          ) : null}
        </View>

        {/* Contact */}
        <View style={s.contactCard}>
          <MaterialIcons name="info-outline" size={16} color="#2563EB" />
          <Text style={s.contactText}>
            {fr
              ? 'Si vous pensez qu\'il s\'agit d\'une erreur, contactez le support pour faire appel.'
              : 'If you believe this is a mistake, contact support to appeal.'}
          </Text>
        </View>

        {/* Appeal Section */}
        {!showAppeal && !appealSent ? (
          <Pressable
            style={({ pressed }) => [s.appealBtn, pressed && { opacity: 0.85 }]}
            onPress={() => setShowAppeal(true)}
          >
            <MaterialIcons name="rate-review" size={18} color="#D97706" />
            <Text style={s.appealBtnText}>
              {fr ? 'Faire appel de la decision' : 'Appeal this decision'}
            </Text>
          </Pressable>
        ) : null}

        {showAppeal && !appealSent ? (
          <View style={s.appealForm}>
            <View style={s.appealFormHeader}>
              <MaterialIcons name="rate-review" size={16} color="#D97706" />
              <Text style={s.appealFormTitle}>{fr ? 'Formulaire d\'appel' : 'Appeal Form'}</Text>
            </View>
            <Text style={s.appealFormDesc}>
              {fr
                ? 'Expliquez pourquoi vous pensez que cette decision est injuste. Un administrateur examinera votre demande.'
                : 'Explain why you believe this decision is unfair. An administrator will review your request.'}
            </Text>
            <TextInput
              style={s.appealInput}
              value={appealMessage}
              onChangeText={setAppealMessage}
              placeholder={fr ? 'Votre message...' : 'Your message...'}
              placeholderTextColor="#94A3B8"
              multiline
              numberOfLines={4}
              maxLength={1000}
              textAlignVertical="top"
            />
            <Text style={s.appealCharCount}>{appealMessage.length}/1000</Text>
            {appealError ? (
              <View style={s.appealErrorRow}>
                <MaterialIcons name="error-outline" size={14} color="#DC2626" />
                <Text style={s.appealErrorText}>{appealError}</Text>
              </View>
            ) : null}
            <View style={s.appealActions}>
              <Pressable style={s.appealCancelBtn} onPress={() => { setShowAppeal(false); setAppealMessage(''); setAppealError(null); }}>
                <Text style={s.appealCancelText}>{fr ? 'Annuler' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={[s.appealSubmitBtn, (!appealMessage.trim() || submitting) && { opacity: 0.5 }]}
                onPress={handleSubmitAppeal}
                disabled={!appealMessage.trim() || submitting}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="send" size={16} color="#FFF" />
                    <Text style={s.appealSubmitText}>{fr ? 'Envoyer' : 'Submit'}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        ) : null}

        {appealSent ? (
          <View style={s.appealSentCard}>
            <View style={s.appealSentIcon}>
              <MaterialIcons name="mark-email-read" size={24} color="#D97706" />
            </View>
            <Text style={s.appealSentTitle}>
              {fr ? 'Appel envoye' : 'Appeal submitted'}
            </Text>
            <Text style={s.appealSentDesc}>
              {fr
                ? 'Votre appel est en cours d\'examen. Un administrateur vous repondra prochainement.'
                : 'Your appeal is under review. An administrator will respond soon.'}
            </Text>
            {existingAppeals.filter(a => a.status !== 'pending' && a.adminResponse).map(a => (
              <View key={a.id} style={[s.appealResponseCard, { borderColor: a.status === 'accepted' ? '#10B981' : '#EF4444' }]}>
                <View style={s.appealResponseHeader}>
                  <MaterialIcons name={a.status === 'accepted' ? 'check-circle' : 'cancel'} size={14} color={a.status === 'accepted' ? '#10B981' : '#EF4444'} />
                  <Text style={[s.appealResponseStatus, { color: a.status === 'accepted' ? '#10B981' : '#EF4444' }]}>
                    {a.status === 'accepted' ? (fr ? 'Accepte' : 'Accepted') : (fr ? 'Rejete' : 'Rejected')}
                  </Text>
                </View>
                {a.adminResponse ? <Text style={s.appealResponseText}>{a.adminResponse}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        <Pressable
          style={({ pressed }) => [s.contactBtn, pressed && { opacity: 0.85 }]}
          onPress={handleContact}
        >
          <MaterialIcons name="email" size={18} color="#2563EB" />
          <Text style={s.contactBtnText}>
            {fr ? 'Contacter le support' : 'Contact Support'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [s.logoutBtn, pressed && { opacity: 0.85 }]}
          onPress={handleLogout}
        >
          <MaterialIcons name="logout" size={18} color="#64748B" />
          <Text style={s.logoutBtnText}>
            {fr ? 'Se deconnecter' : 'Log out'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FEF2F2',
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  iconWrap: {
    marginBottom: 28,
  },
  iconOuter: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconInner: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 15,
    color: '#7F1D1D',
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 24,
  },
  reasonCard: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  reasonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  reasonTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reasonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
    marginBottom: 4,
  },
  reasonDate: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 4,
  },
  contactCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  contactText: {
    flex: 1,
    fontSize: 13,
    color: '#1E40AF',
    lineHeight: 19,
  },
  contactBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    marginBottom: 12,
  },
  contactBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2563EB',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  logoutBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  // Appeal styles
  appealBtn: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    marginBottom: 12,
  },
  appealBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#D97706',
  },
  appealForm: {
    width: '100%',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  appealFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  appealFormTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#92400E',
  },
  appealFormDesc: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 18,
    marginBottom: 12,
  },
  appealInput: {
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#0F172A',
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#FDE68A',
    lineHeight: 20,
  },
  appealCharCount: {
    fontSize: 10,
    color: '#94A3B8',
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 8,
  },
  appealErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  appealErrorText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  appealActions: {
    flexDirection: 'row',
    gap: 10,
  },
  appealCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  appealCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  appealSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#D97706',
  },
  appealSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  appealSentCard: {
    width: '100%',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  appealSentIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  appealSentTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400E',
    marginBottom: 6,
  },
  appealSentDesc: {
    fontSize: 13,
    color: '#B45309',
    textAlign: 'center',
    lineHeight: 19,
  },
  appealResponseCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
  },
  appealResponseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  appealResponseStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  appealResponseText: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
});
