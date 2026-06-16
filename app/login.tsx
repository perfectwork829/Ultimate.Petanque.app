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
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { router } from 'expo-router';
import { useAuth, useAlert } from '@/template';
import {
  GOOGLE_PROVIDER_NOT_ENABLED,
  GOOGLE_DISALLOWED_USER_AGENT,
  GOOGLE_EXPO_GO_REQUIRES_DEV_BUILD,
} from '@/template/auth';
import theme from '@/constants/theme';
import {
  AUTH_EMAIL_OTP_LENGTH,
  AUTH_EMAIL_OTP_MAX_LENGTH,
  isCompleteEmailOtp,
  normalizeEmailOtpInput,
} from '@/constants/authOtp';
import { useLanguage } from '@/hooks/useLanguage';
import { isDisposableEmail } from '@/services/emailValidationService';
import { canCreateAccount, canLoginOnDevice, recordAccountCreation, shouldShowDeviceBindingNotification, markDeviceBindingNotificationShown } from '@/services/deviceFingerprintService';
import { clearTempDataExpiry } from '@/services/retentionNotificationService';
import { trackReferral } from '@/services/ambassadorService';
import { mapAuthLoginErrorMessage } from '@/utils/mapAuthLoginError';

type AuthMode = 'login' | 'register';
type RegisterStep = 'email' | 'otp';
type ResetStep = 'email' | 'otp' | 'done';

export default function LoginScreen() {
  const { sendOTP, verifyOTPAndLogin, signInWithPassword, signInWithGoogle, operationLoading } = useAuth();
  const { showAlert } = useAlert();
  const { t, language } = useLanguage();

  const [mode, setMode] = useState<AuthMode>('login');
  const [registerStep, setRegisterStep] = useState<RegisterStep>('email');
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [showReferralField, setShowReferralField] = useState(false);
  const [showResetFlow, setShowResetFlow] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');

  const resetForm = () => {
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setOtp('');
    setRegisterStep('email');
    setShowPassword(false);
    setReferralCode('');
    setShowReferralField(false);
    setShowResetFlow(false);
    setResetStep('email');
    setResetEmail('');
    setResetOtp('');
    setResetNewPassword('');
    setResetConfirmPassword('');
  };

  const handleModeSwitch = (newMode: AuthMode) => {
    setMode(newMode);
    resetForm();
  };

  const handleGoogleLogin = async () => {
    // Note: Google OAuth cannot pre-check email before auth flow,
    // device binding is enforced via post-login check in canLoginOnDevice
    const { error } = await signInWithGoogle();
    if (error) {
      let message = error;
      if (
        error === GOOGLE_PROVIDER_NOT_ENABLED ||
        error.toLowerCase().includes('provider is not enabled')
      ) {
        message = t('login', 'googleProviderNotEnabled');
      } else if (
        error === GOOGLE_DISALLOWED_USER_AGENT ||
        error.toLowerCase().includes('disallowed_useragent')
      ) {
        message = t('login', 'googleDisallowedUserAgent');
      } else if (error === GOOGLE_EXPO_GO_REQUIRES_DEV_BUILD) {
        message = t('login', 'googleExpoGoNotSupported');
      }
      showAlert(t('login', 'googleError'), message);
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      showAlert(t('common', 'error'), t('login', 'fillAllFields'));
      return;
    }

    const emailNormalized = email.trim().toLowerCase();

    // Anti-cheat: check if device is bound to a different account
    const { allowed, reason } = await canLoginOnDevice(emailNormalized);
    if (!allowed && reason === 'device_bound_to_other_account') {
      showAlert(t('common', 'error'), t('login', 'deviceBoundToOther'));
      return;
    }

    const { error, user } = await signInWithPassword(emailNormalized, password);
    if (error) {
      showAlert(t('login', 'loginError'), mapAuthLoginErrorMessage(error, t));
      return;
    }
    if (!user) {
      showAlert(t('login', 'loginError'), t('login', 'loginSessionFailed'));
      return;
    }

    const shouldShow = await shouldShowDeviceBindingNotification();
    if (shouldShow) {
      markDeviceBindingNotificationShown();
      showAlert(t('login', 'deviceBindingTitle'), t('login', 'deviceBindingMessage'));
    }
    router.replace('/');
  };

  const handleResetSendOTP = async () => {
    if (!resetEmail.trim()) {
      showAlert(t('common', 'error'), t('login', 'enterEmail'));
      return;
    }
    const { error } = await sendOTP(resetEmail.trim().toLowerCase());
    if (error) {
      showAlert(t('common', 'error'), error);
      return;
    }
    setResetStep('otp');
    showAlert(
      language === 'fr' ? 'Code envoye' : 'Code sent',
      language === 'fr' ? 'Verifiez votre email pour le code de verification.' : 'Check your email for the verification code.'
    );
  };

  const handleResetVerifyAndSetPassword = async () => {
    if (!isCompleteEmailOtp(resetOtp)) {
      showAlert(t('common', 'error'), t('login', 'enterCode'));
      return;
    }
    if (!resetNewPassword.trim() || resetNewPassword.length < 6) {
      showAlert(t('common', 'error'), t('login', 'passwordTooShort'));
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      showAlert(t('common', 'error'), t('login', 'passwordMismatch'));
      return;
    }
    const { error } = await verifyOTPAndLogin(
      resetEmail.trim().toLowerCase(),
      normalizeEmailOtpInput(resetOtp),
      { password: resetNewPassword }
    );
    if (error) {
      showAlert(t('common', 'error'), error);
      return;
    }
    showAlert(
      language === 'fr' ? 'Mot de passe reinitialise' : 'Password reset',
      language === 'fr' ? 'Votre mot de passe a ete mis a jour.' : 'Your password has been updated.'
    );
    router.replace('/');
  };

  const handleSendOTP = async () => {
    if (!email.trim()) {
      showAlert(t('common', 'error'), t('login', 'enterEmail'));
      return;
    }
    if (!password.trim() || password.length < 6) {
      showAlert(t('common', 'error'), t('login', 'passwordTooShort'));
      return;
    }
    if (password !== confirmPassword) {
      showAlert(t('common', 'error'), t('login', 'passwordMismatch'));
      return;
    }

    // Check for disposable email
    if (isDisposableEmail(email.trim())) {
      showAlert(t('common', 'error'), t('login', 'disposableEmail'));
      return;
    }

    // Check device account creation limits
    const { allowed, reason } = await canCreateAccount(email.trim());
    if (!allowed) {
      if (reason === 'max_accounts_reached') {
        showAlert(t('common', 'error'), t('login', 'maxAccountsReached'));
      } else if (reason === 'cooldown_active') {
        showAlert(t('common', 'error'), t('login', 'cooldownActive'));
      } else {
        showAlert(t('common', 'error'), t('common', 'error'));
      }
      return;
    }

    try {
      const { error } = await sendOTP(email.trim().toLowerCase());
      if (error) {
        showAlert(t('common', 'error'), error);
        return;
      }

      // Update state first, then show confirmation
      setRegisterStep('otp');
      showAlert(t('login', 'codeSentSuccess'), t('login', 'codeSentMessage'));
    } catch (err: any) {
      showAlert(t('common', 'error'), err.message || t('common', 'error'));
    }
  };

  const handleVerifyOTP = async () => {
    if (!isCompleteEmailOtp(otp)) {
      showAlert(t('common', 'error'), t('login', 'enterCode'));
      return;
    }

    const { error, user: newUser } = await verifyOTPAndLogin(
      email.trim().toLowerCase(),
      normalizeEmailOtpInput(otp),
      { password }
    );
    if (error) {
      showAlert(t('common', 'error'), error);
    } else {
      // Record successful account creation for device fingerprint tracking
      recordAccountCreation(email.trim(), 'email').catch(() => {});
      // Clear 7-day temp data expiry since user is now registered
      clearTempDataExpiry().catch(() => {});
      // Show one-time device binding notification
      shouldShowDeviceBindingNotification().then(shouldShow => {
        if (shouldShow) {
          markDeviceBindingNotificationShown();
          showAlert(t('login', 'deviceBindingTitle'), t('login', 'deviceBindingMessage'));
        }
      }).catch(() => {});
      // Track referral if code was provided
      if (referralCode.trim() && newUser?.id) {
        trackReferral(referralCode.trim(), newUser.id).then(({ success }) => {
          if (success) showAlert(
            t('login', 'referralSuccess') || (language === 'fr' ? 'Parrainage valide' : 'Referral validated'),
            t('login', 'referralSuccessMsg') || (language === 'fr' ? 'Merci ! L\'ambassadeur a ete credite.' : 'Thanks! The ambassador has been credited.')
          );
        }).catch(() => {});
      }
      // Navigate to index so AuthRouter/ProfileChecker can handle routing
      router.replace('/');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Animated.View entering={FadeInDown.duration(500)} style={styles.header}>
            <Image
              source={require('@/assets/images/logo-ultimate-petanque.png')}
              style={styles.logo}
              contentFit="contain"
            />
            <Text style={styles.tagline}>
              {mode === 'login' ? t('login', 'welcomeBack') : t('login', 'createAccount')}
            </Text>
          </Animated.View>

          {/* Mode Tabs */}
          <Animated.View entering={FadeInDown.duration(500).delay(100)} style={styles.modeTabs}>
            <Pressable
              testID="mode-tab-login"
              style={[styles.modeTab, mode === 'login' && styles.modeTabActive]}
              onPress={() => handleModeSwitch('login')}
            >
              <Text style={[styles.modeTabText, mode === 'login' && styles.modeTabTextActive]}>
                {t('login', 'signIn')}
              </Text>
            </Pressable>
            <Pressable
              testID="mode-tab-register"
              style={[styles.modeTab, mode === 'register' && styles.modeTabActive]}
              onPress={() => handleModeSwitch('register')}
            >
              <Text style={[styles.modeTabText, mode === 'register' && styles.modeTabTextActive]}>
                {t('login', 'signUp')}
              </Text>
            </Pressable>
          </Animated.View>

          {/* Login Form */}
          {mode === 'login' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.form}>
              <View style={styles.inputContainer}>
                <MaterialIcons name="email" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput
                  testID="login-email-input"
                  style={styles.input}
                  placeholder={t('login', 'email')}
                  placeholderTextColor={theme.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <MaterialIcons name="lock" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput
                  testID="login-password-input"
                  style={styles.input}
                  placeholder={t('login', 'password')}
                  placeholderTextColor={theme.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color={theme.textMuted}
                  />
                </Pressable>
              </View>

              <Pressable
                testID="login-submit-button"
                style={[styles.submitButton, operationLoading && styles.submitButtonDisabled]}
                onPress={handleLogin}
                disabled={operationLoading}
              >
                {operationLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="login" size={20} color="#FFF" />
                    <Text style={styles.submitButtonText}>{t('login', 'login')}</Text>
                  </>
                )}
              </Pressable>

              <Pressable style={styles.forgotButton} onPress={() => { setShowResetFlow(true); setResetEmail(email); }}>
                <Text style={styles.forgotButtonText}>
                  {language === 'fr' ? 'Mot de passe oublie ?' : 'Forgot password?'}
                </Text>
              </Pressable>

              {/* Divider */}
              <View style={styles.dividerContainer}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>{t('common', 'or')}</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Google Sign-In */}
              <Pressable
                testID="login-google-button"
                style={[styles.googleButton, operationLoading && styles.googleButtonDisabled]}
                onPress={handleGoogleLogin}
                disabled={operationLoading}
              >
                <MaterialIcons name="login" size={20} color={theme.textPrimary} />
                <Text style={styles.googleButtonText}>{t('login', 'continueWithGoogle')}</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Register Form - Step 1: Email & Password */}
          {mode === 'register' && registerStep === 'email' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.form}>
              <View style={styles.inputContainer}>
                <MaterialIcons name="email" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput
                  testID="register-email-input"
                  style={styles.input}
                  placeholder={t('login', 'email')}
                  placeholderTextColor={theme.textMuted}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              <View style={styles.inputContainer}>
                <MaterialIcons name="lock" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput
                  testID="register-password-input"
                  style={styles.input}
                  placeholder={t('login', 'passwordMin')}
                  placeholderTextColor={theme.textMuted}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                  <MaterialIcons
                    name={showPassword ? 'visibility' : 'visibility-off'}
                    size={20}
                    color={theme.textMuted}
                  />
                </Pressable>
              </View>

              <View style={styles.inputContainer}>
                <MaterialIcons name="lock" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput
                  testID="register-confirm-password-input"
                  style={styles.input}
                  placeholder={t('login', 'confirmPassword')}
                  placeholderTextColor={theme.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
              </View>

              {/* Referral Code */}
              {showReferralField ? (
                <View style={styles.inputContainer}>
                  <MaterialIcons name="card-giftcard" size={20} color="#7C3AED" style={styles.inputIcon} />
                  <TextInput
                    style={[styles.input, { letterSpacing: 1, fontWeight: '600' }]}
                    placeholder={language === 'fr' ? 'Code parrainage (optionnel)' : 'Referral code (optional)'}
                    placeholderTextColor={theme.textMuted}
                    value={referralCode}
                    onChangeText={setReferralCode}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  {referralCode.length > 0 ? (
                    <Pressable onPress={() => setReferralCode('')} style={styles.eyeButton}>
                      <MaterialIcons name="close" size={18} color={theme.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
              ) : (
                <Pressable style={styles.referralToggle} onPress={() => setShowReferralField(true)}>
                  <MaterialIcons name="card-giftcard" size={16} color="#7C3AED" />
                  <Text style={styles.referralToggleText}>
                    {language === 'fr' ? 'J\'ai un code parrainage' : 'I have a referral code'}
                  </Text>
                </Pressable>
              )}

              <Pressable
                testID="register-send-otp-button"
                style={[styles.submitButton, operationLoading && styles.submitButtonDisabled]}
                onPress={handleSendOTP}
                disabled={operationLoading}
              >
                {operationLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="send" size={20} color="#FFF" />
                    <Text style={styles.submitButtonText}>{t('login', 'getCode')}</Text>
                  </>
                )}
              </Pressable>
            </Animated.View>
          )}

          {/* Register Form - Step 2: OTP Verification */}
          {mode === 'register' && registerStep === 'otp' && (
            <Animated.View entering={FadeIn.duration(300)} style={styles.form}>
              <View style={styles.otpInfo}>
                <MaterialIcons name="mark-email-read" size={48} color={theme.primary} />
                <Text style={styles.otpInfoTitle}>{t('login', 'verifyEmail')}</Text>
                <Text style={styles.otpInfoText}>
                  {t('login', 'codeSent')} {email}
                </Text>
              </View>

              <View style={styles.inputContainer}>
                <MaterialIcons name="pin" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                <TextInput
                  testID="otp-input"
                  style={[styles.input, styles.otpInput]}
                  placeholder={t('login', 'verificationCode')}
                  placeholderTextColor={theme.textMuted}
                  value={otp}
                  onChangeText={(text) => setOtp(normalizeEmailOtpInput(text))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  maxLength={AUTH_EMAIL_OTP_MAX_LENGTH}
                />
              </View>

              <Pressable
                testID="verify-otp-button"
                style={[
                  styles.submitButton,
                  (operationLoading || !isCompleteEmailOtp(otp)) && styles.submitButtonDisabled,
                ]}
                onPress={handleVerifyOTP}
                disabled={operationLoading || !isCompleteEmailOtp(otp)}
              >
                {operationLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <MaterialIcons name="verified" size={20} color="#FFF" />
                    <Text style={styles.submitButtonText}>{t('login', 'createMyAccount')}</Text>
                  </>
                )}
              </Pressable>

              <Pressable
                style={styles.backButton}
                onPress={() => setRegisterStep('email')}
              >
                <MaterialIcons name="arrow-back" size={18} color={theme.textSecondary} />
                <Text style={styles.backButtonText}>{t('login', 'editEmail')}</Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Password Reset Flow */}
          {showResetFlow ? (
            <Animated.View entering={FadeIn.duration(300)} style={styles.form}>
              <View style={styles.resetHeader}>
                <Pressable onPress={() => { setShowResetFlow(false); setResetStep('email'); }} hitSlop={8}>
                  <MaterialIcons name="arrow-back" size={22} color={theme.textSecondary} />
                </Pressable>
                <Text style={styles.resetTitle}>
                  {language === 'fr' ? 'Reinitialiser le mot de passe' : 'Reset Password'}
                </Text>
              </View>

              {resetStep === 'email' ? (
                <>
                  <Text style={styles.resetSubtitle}>
                    {language === 'fr'
                      ? 'Entrez votre email. Nous vous enverrons un code de verification.'
                      : 'Enter your email. We will send you a verification code.'}
                  </Text>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="email" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder={t('login', 'email')}
                      placeholderTextColor={theme.textMuted}
                      value={resetEmail}
                      onChangeText={setResetEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                    />
                  </View>
                  <Pressable
                    style={[styles.submitButton, operationLoading && styles.submitButtonDisabled]}
                    onPress={handleResetSendOTP}
                    disabled={operationLoading}
                  >
                    {operationLoading ? <ActivityIndicator color="#FFF" /> : (
                      <><MaterialIcons name="send" size={20} color="#FFF" /><Text style={styles.submitButtonText}>{language === 'fr' ? 'Envoyer le code' : 'Send code'}</Text></>
                    )}
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.otpInfo}>
                    <MaterialIcons name="mark-email-read" size={40} color={theme.primary} />
                    <Text style={styles.otpInfoTitle}>{language === 'fr' ? 'Verification' : 'Verification'}</Text>
                    <Text style={styles.otpInfoText}>{language === 'fr' ? 'Code envoye a' : 'Code sent to'} {resetEmail}</Text>
                  </View>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="pin" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.input, styles.otpInput]}
                      placeholder={t('login', 'verificationCode')}
                      placeholderTextColor={theme.textMuted}
                      value={resetOtp}
                      onChangeText={(text) => setResetOtp(normalizeEmailOtpInput(text))}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      maxLength={AUTH_EMAIL_OTP_MAX_LENGTH}
                    />
                  </View>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="lock" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder={language === 'fr' ? 'Nouveau mot de passe (6+ car.)' : 'New password (6+ chars)'}
                      placeholderTextColor={theme.textMuted}
                      value={resetNewPassword}
                      onChangeText={setResetNewPassword}
                      secureTextEntry={!showPassword}
                    />
                    <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                      <MaterialIcons name={showPassword ? 'visibility' : 'visibility-off'} size={20} color={theme.textMuted} />
                    </Pressable>
                  </View>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="lock-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder={language === 'fr' ? 'Confirmer le mot de passe' : 'Confirm password'}
                      placeholderTextColor={theme.textMuted}
                      value={resetConfirmPassword}
                      onChangeText={setResetConfirmPassword}
                      secureTextEntry={!showPassword}
                    />
                  </View>
                  <Pressable
                    style={[styles.submitButton, operationLoading && styles.submitButtonDisabled]}
                    onPress={handleResetVerifyAndSetPassword}
                    disabled={operationLoading}
                  >
                    {operationLoading ? <ActivityIndicator color="#FFF" /> : (
                      <><MaterialIcons name="check" size={20} color="#FFF" /><Text style={styles.submitButtonText}>{language === 'fr' ? 'Reinitialiser' : 'Reset Password'}</Text></>
                    )}
                  </Pressable>
                  <Pressable style={styles.backButton} onPress={() => setResetStep('email')}>
                    <MaterialIcons name="arrow-back" size={18} color={theme.textSecondary} />
                    <Text style={styles.backButtonText}>{t('login', 'editEmail')}</Text>
                  </Pressable>
                </>
              )}
            </Animated.View>
          ) : null}

          {/* Footer */}
          <Animated.View entering={FadeInDown.duration(500).delay(300)} style={styles.footer}>
            <Pressable onPress={() => router.push('/terms')}>
              <Text style={styles.footerText}>
                {t('login', 'termsText')}
              </Text>
            </Pressable>
            <View style={styles.footerLinks}>
              <Pressable onPress={() => router.push('/terms')}>
                <Text style={styles.footerLink}>{t('terms', 'title')}</Text>
              </Pressable>
              <Text style={styles.footerSeparator}>•</Text>
              <Pressable onPress={() => router.push('/privacy-policy')}>
                <Text style={styles.footerLink}>{t('privacy', 'title')}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: theme.textSecondary,
  },
  modeTabs: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 4,
    marginBottom: 24,
    ...theme.shadows.card,
  },
  modeTab: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: theme.borderRadius.md,
  },
  modeTabActive: {
    backgroundColor: theme.primary,
  },
  modeTabText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  modeTabTextActive: {
    color: '#FFF',
  },
  form: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: 14,
    ...theme.shadows.card,
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
  otpInput: {
    letterSpacing: 8,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
  },
  eyeButton: {
    padding: 8,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.primary,
    paddingVertical: 18,
    borderRadius: theme.borderRadius.md,
    marginTop: 8,
  },
  submitButtonDisabled: {
    backgroundColor: theme.textMuted,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFF',
  },
  otpInfo: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  otpInfoTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: 16,
    marginBottom: 8,
  },
  otpInfoText: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  backButtonText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: theme.textMuted,
    textAlign: 'center',
  },
  footerLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  footerLink: {
    fontSize: 12,
    color: theme.primary,
    fontWeight: '500',
    textDecorationLine: 'underline',
  },
  footerSeparator: {
    fontSize: 12,
    color: theme.textMuted,
  },
  referralToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  referralToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7C3AED',
  },
  // Divider styles
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: theme.border,
  },
  dividerText: {
    fontSize: 13,
    color: theme.textMuted,
    paddingHorizontal: 16,
  },
  // Forgot password
  forgotButton: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  forgotButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
  },
  // Reset flow
  resetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  resetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  resetSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  // Google button styles
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.surface,
    paddingVertical: 16,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.border,
    ...theme.shadows.card,
  },
  googleButtonDisabled: {
    opacity: 0.6,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
  },
});
