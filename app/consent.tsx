import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import { useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppActions } from '@/contexts/AppContext';
import { clearTempDataExpiry, updateRetentionForRegisteredUser } from '@/services/retentionNotificationService';
import { enableSelfPlayerPublicProfile } from '@/services/publicItemsService';

export default function ConsentScreen() {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { setItemPublic } = useAppActions();
  const { t } = useLanguage();
  const supabase = getSupabaseClient();

  const [cguChecked, setCguChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const canAccept = cguChecked && privacyChecked;

  const openTerms = () => {
    Haptics.selectionAsync();
    router.push('/terms');
  };

  const openPrivacy = () => {
    Haptics.selectionAsync();
    router.push('/privacy-policy');
  };

  const handleAccept = async () => {
    if (!canAccept || !user?.id) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          consent_accepted: true,
          consent_date: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) throw error;

      const { playerId, error: publicError } = await enableSelfPlayerPublicProfile(user.id);
      if (publicError) {
        console.log('Consent: could not enable public profile:', publicError);
      } else if (playerId) {
        setItemPublic('players', playerId, true);
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Clear temp data expiry and update retention notifications for registered user
      clearTempDataExpiry().catch(() => {});
      updateRetentionForRegisteredUser({
        language: t('common', 'version').includes('Version') ? 'fr' : 'en',
        matchStats: { successRate: 0, carreaux: 0, matchCount: 0, wins: 0, tirRate: 0 },
      }).catch(() => {});

      router.replace('/(tabs)');
    } catch (err: any) {
      console.log('Consent save error:', err);
      showAlert(t('common', 'error'), err.message || t('consent', 'errorSaving'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.heroSection}>
          <View style={styles.heroIcon}>
            <MaterialIcons name="verified-user" size={48} color={theme.primary} />
          </View>
          <Text style={styles.heroTitle}>{t('consent', 'title')}</Text>
          <Text style={styles.heroSubtitle}>{t('consent', 'subtitle')}</Text>
        </Animated.View>

        {/* Summary Card */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.summaryCard}>
          <Text style={styles.summaryText}>{t('consent', 'summaryText')}</Text>
        </Animated.View>

        {/* Key Points */}
        <Animated.View entering={FadeInDown.duration(400).delay(150)} style={styles.keyPointsCard}>
          <Text style={styles.keyPointsTitle}>{t('consent', 'keyPointsTitle')}</Text>

          <View style={styles.keyPoint}>
            <View style={[styles.keyPointIcon, { backgroundColor: theme.primary + '15' }]}>
              <MaterialIcons name="security" size={18} color={theme.primary} />
            </View>
            <Text style={styles.keyPointText}>{t('consent', 'keyPoint1')}</Text>
          </View>

          <View style={styles.keyPoint}>
            <View style={[styles.keyPointIcon, { backgroundColor: theme.success + '15' }]}>
              <MaterialIcons name="cloud-done" size={18} color={theme.success} />
            </View>
            <Text style={styles.keyPointText}>{t('consent', 'keyPoint2')}</Text>
          </View>

          <View style={styles.keyPoint}>
            <View style={[styles.keyPointIcon, { backgroundColor: theme.accent + '15' }]}>
              <MaterialIcons name="share" size={18} color={theme.accent} />
            </View>
            <Text style={styles.keyPointText}>{t('consent', 'keyPoint3')}</Text>
          </View>

          <View style={styles.keyPoint}>
            <View style={[styles.keyPointIcon, { backgroundColor: theme.error + '15' }]}>
              <MaterialIcons name="delete-outline" size={18} color={theme.error} />
            </View>
            <Text style={styles.keyPointText}>{t('consent', 'keyPoint4')}</Text>
          </View>
        </Animated.View>

        {/* Checkboxes — links open in-app screens (app/terms.tsx, app/privacy-policy.tsx) */}
        <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.checkboxSection}>
          <View style={styles.legalCard}>
            <Pressable
              style={styles.checkboxRow}
              onPress={() => {
                Haptics.selectionAsync();
                setCguChecked(!cguChecked);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: cguChecked }}
            >
              <View style={[styles.checkbox, cguChecked && styles.checkboxChecked]}>
                {cguChecked ? <MaterialIcons name="check" size={18} color="#FFF" /> : null}
              </View>
              <Text style={styles.checkboxLabel}>
                {t('consent', 'acceptCgu')}{' '}
                <Text style={styles.checkboxLink}>{t('terms', 'title')}</Text>
              </Text>
            </Pressable>
            <Pressable style={styles.readDocButton} onPress={openTerms} accessibilityRole="link">
              <MaterialIcons name="description" size={18} color={theme.primary} />
              <Text style={styles.readDocButtonText}>{t('consent', 'readDocument')}</Text>
              <MaterialIcons name="chevron-right" size={20} color={theme.primary} />
            </Pressable>
          </View>

          <View style={styles.legalCard}>
            <Pressable
              style={styles.checkboxRow}
              onPress={() => {
                Haptics.selectionAsync();
                setPrivacyChecked(!privacyChecked);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: privacyChecked }}
            >
              <View style={[styles.checkbox, privacyChecked && styles.checkboxChecked]}>
                {privacyChecked ? <MaterialIcons name="check" size={18} color="#FFF" /> : null}
              </View>
              <Text style={styles.checkboxLabel}>
                {t('consent', 'acceptPrivacy')}{' '}
                <Text style={styles.checkboxLink}>{t('privacy', 'title')}</Text>
              </Text>
            </Pressable>
            <Pressable style={styles.readDocButton} onPress={openPrivacy} accessibilityRole="link">
              <MaterialIcons name="policy" size={18} color={theme.primary} />
              <Text style={styles.readDocButtonText}>{t('consent', 'readDocument')}</Text>
              <MaterialIcons name="chevron-right" size={20} color={theme.primary} />
            </Pressable>
          </View>
        </Animated.View>

        {/* Accept Button */}
        <Animated.View entering={FadeInDown.duration(400).delay(250)}>
          <Pressable
            style={[styles.acceptButton, !canAccept && styles.acceptButtonDisabled]}
            onPress={handleAccept}
            disabled={!canAccept || saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="check-circle" size={22} color="#FFF" />
                <Text style={styles.acceptButtonText}>{t('consent', 'acceptButton')}</Text>
              </>
            )}
          </Pressable>
        </Animated.View>

        {/* Footer note */}
        <Text style={styles.footerNote}>{t('consent', 'footerNote')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    flexGrow: 1,
  },
  // Hero
  heroSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroSubtitle: {
    fontSize: 15,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  // Summary
  summaryCard: {
    backgroundColor: theme.primary + '08',
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.primary + '20',
  },
  summaryText: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 22,
    textAlign: 'center',
  },
  // Key points
  keyPointsCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: theme.border,
  },
  keyPointsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 16,
  },
  keyPoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  keyPointIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPointText: {
    flex: 1,
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  // Checkboxes
  checkboxSection: {
    gap: 16,
    marginBottom: 24,
  },
  legalCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
  },
  readDocButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.primary + '08',
  },
  readDocButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: theme.primary,
    borderColor: theme.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 15,
    color: theme.textPrimary,
    lineHeight: 22,
  },
  checkboxLink: {
    color: theme.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  // Accept button
  acceptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.primary,
    paddingVertical: 18,
    borderRadius: theme.borderRadius.lg,
  },
  acceptButtonDisabled: {
    backgroundColor: theme.textMuted,
    opacity: 0.5,
  },
  acceptButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
  },
  // Footer
  footerNote: {
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
