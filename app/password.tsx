import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import { useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';

export default function PasswordScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const supabase = getSupabaseClient();
  const { t } = useLanguage();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  // Password strength
  const getPasswordStrength = (pwd: string) => {
    if (!pwd) return { level: 0, label: '', color: theme.textMuted };
    let score = 0;
    if (pwd.length >= 6) score++;
    if (pwd.length >= 8) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;

    if (score <= 1) return { level: 1, label: t('password', 'weak'), color: theme.error };
    if (score <= 2) return { level: 2, label: t('password', 'medium'), color: theme.warning };
    if (score <= 3) return { level: 3, label: t('password', 'good'), color: theme.accent };
    return { level: 4, label: t('password', 'strong'), color: theme.success };
  };

  const strength = getPasswordStrength(newPassword);

  const handleChangePassword = async () => {
    if (!newPassword.trim()) {
      showAlert(t('common', 'error'), t('password', 'enterNew'));
      return;
    }
    if (newPassword.length < 6) {
      showAlert(t('common', 'error'), t('password', 'tooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert(t('common', 'error'), t('password', 'mismatch'));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(t('password', 'changed'), t('password', 'changedSuccess'));
      
      // Reset fields
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      
      // Go back after short delay
      setTimeout(() => router.back(), 800);
    } catch (error: any) {
      console.log('Password change error:', error);
      
      let errorMsg = t('password', 'cantChange');
      if (error.message?.includes('same_password')) {
        errorMsg = t('password', 'samePassword');
      } else if (error.message?.includes('weak_password')) {
        errorMsg = t('password', 'weakPassword');
      } else if (error.message) {
        errorMsg = error.message;
      }
      
      showAlert(t('common', 'error'), errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const passwordsMatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword === confirmPassword;
  const passwordsMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = newPassword.length >= 6 && passwordsMatch && !saving;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('password', 'title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Info Card */}
          <Animated.View entering={FadeInDown.duration(400)} style={styles.infoCard}>
            <View style={styles.infoIconContainer}>
              <MaterialIcons name="shield" size={32} color={theme.primary} />
            </View>
            <Text style={styles.infoTitle}>{t('password', 'changePassword')}</Text>
            <Text style={styles.infoText}>
              {t('password', 'chooseStrong')}
            </Text>
          </Animated.View>

          {/* Email Display */}
          <Animated.View entering={FadeInDown.duration(400).delay(50)} style={styles.emailCard}>
            <MaterialIcons name="email" size={18} color={theme.textSecondary} />
            <Text style={styles.emailText}>{user?.email}</Text>
          </Animated.View>

          {/* New Password */}
          <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('password', 'newPassword')}</Text>
            <View style={[styles.inputContainer, newPassword.length > 0 && newPassword.length < 6 && styles.inputContainerError]}>
              <MaterialIcons name="lock" size={20} color={theme.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('password', 'minChars')}
                placeholderTextColor={theme.textMuted}
                value={newPassword}
                onChangeText={setNewPassword}
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
              />
              <Pressable onPress={() => setShowNewPassword(!showNewPassword)} style={styles.eyeButton} hitSlop={8}>
                <MaterialIcons
                  name={showNewPassword ? 'visibility' : 'visibility-off'}
                  size={20}
                  color={theme.textMuted}
                />
              </Pressable>
            </View>

            {/* Strength Indicator */}
            {newPassword.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBars}>
                  {[1, 2, 3, 4].map(level => (
                    <View
                      key={level}
                      style={[
                        styles.strengthBar,
                        { backgroundColor: level <= strength.level ? strength.color : theme.border },
                      ]}
                    />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: strength.color }]}>{strength.label}</Text>
              </View>
            )}

            {/* Requirements */}
            <View style={styles.requirementsList}>
              <RequirementItem met={newPassword.length >= 6} text={t('password', 'atLeast6')} />
              <RequirementItem met={/[A-Z]/.test(newPassword)} text={t('password', 'uppercase')} />
              <RequirementItem met={/[0-9]/.test(newPassword)} text={t('password', 'digit')} />
              <RequirementItem met={/[^A-Za-z0-9]/.test(newPassword)} text={t('password', 'specialChar')} />
            </View>
          </Animated.View>

          {/* Confirm Password */}
          <Animated.View entering={FadeInDown.duration(400).delay(150)} style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>{t('password', 'confirmPassword')}</Text>
            <View style={[
              styles.inputContainer,
              passwordsMatch && styles.inputContainerSuccess,
              passwordsMismatch && styles.inputContainerError,
            ]}>
              <MaterialIcons name="lock-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('password', 'retypePassword')}
                placeholderTextColor={theme.textMuted}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
              />
              {passwordsMatch && (
                <MaterialIcons name="check-circle" size={20} color={theme.success} />
              )}
              {passwordsMismatch && (
                <MaterialIcons name="error" size={20} color={theme.error} />
              )}
            </View>
            {passwordsMismatch && (
              <Text style={styles.errorText}>{t('password', 'mismatch')}</Text>
            )}
          </Animated.View>

          {/* Submit Button */}
          <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.submitSection}>
            <Pressable
              style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
              onPress={handleChangePassword}
              disabled={!canSubmit}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <MaterialIcons name="check" size={20} color="#FFF" />
                  <Text style={styles.submitButtonText}>{t('password', 'changeBtn')}</Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RequirementItem({ met, text }: { met: boolean; text: string }) {
  return (
    <View style={styles.requirementItem}>
      <MaterialIcons
        name={met ? 'check-circle' : 'radio-button-unchecked'}
        size={16}
        color={met ? theme.success : theme.textMuted}
      />
      <Text style={[styles.requirementText, met && { color: theme.success }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // Info Card
  infoCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.xl,
    padding: 24,
    alignItems: 'center',
    marginBottom: 20,
    ...theme.shadows.card,
  },
  infoIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 18,
    backgroundColor: theme.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Email Card
  emailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    marginBottom: 20,
    ...theme.shadows.card,
  },
  emailText: {
    fontSize: 14,
    color: theme.textSecondary,
    flex: 1,
  },

  // Field Group
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 8,
    paddingLeft: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    borderWidth: 2,
    borderColor: 'transparent',
    ...theme.shadows.card,
  },
  inputContainerError: {
    borderColor: theme.error + '40',
  },
  inputContainerSuccess: {
    borderColor: theme.success + '40',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    color: theme.textPrimary,
  },
  eyeButton: {
    padding: 8,
  },
  errorText: {
    fontSize: 12,
    color: theme.error,
    marginTop: 6,
    paddingLeft: 4,
  },

  // Strength
  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingHorizontal: 4,
  },
  strengthBars: {
    flexDirection: 'row',
    gap: 4,
    flex: 1,
  },
  strengthBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 12,
    fontWeight: '600',
    minWidth: 48,
    textAlign: 'right',
  },

  // Requirements
  requirementsList: {
    marginTop: 12,
    gap: 6,
    paddingLeft: 4,
  },
  requirementItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  requirementText: {
    fontSize: 13,
    color: theme.textMuted,
  },

  // Submit
  submitSection: {
    marginTop: 8,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.primary,
    paddingVertical: 18,
    borderRadius: theme.borderRadius.md,
  },
  submitButtonDisabled: {
    backgroundColor: theme.textMuted,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
});
