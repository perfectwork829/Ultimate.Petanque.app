import { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthRouter, useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { Redirect, router } from 'expo-router';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import theme from '@/constants/theme';
import { ensureDeviceBoundToAccount } from '@/services/deviceFingerprintService';
import { useLanguage } from '@/hooks/useLanguage';
import { hasRequiredPlayerCity } from '@/utils/playerLocationRequirement';
import {
  isGoogleOnlyProfileComplete,
  isGoogleOnlyUserId,
  loadGoogleOnlyProfile,
} from '@/services/googleOnlyProfileService';

const ONBOARDING_KEY = 'hasSeenOnboarding';
const PENDING_DEVICE_BINDING_ALERT_KEY = '@pending_device_binding_alert';

// ============================================
// Deep Link Parser
// ============================================
function parseDeepLink(url: string): { type: 'share' | 'meetup'; code: string } | null {
  try {
    const parsed = Linking.parse(url);
    const path = parsed.path || '';
    const segments = path.split('/').filter(Boolean);

    if (segments.length >= 2 && segments[0] === 'share' && segments[1]) {
      return { type: 'share', code: segments[1] };
    }
    if (segments.length >= 2 && segments[0] === 'meetup' && segments[1]) {
      return { type: 'meetup', code: segments[1] };
    }

    if (segments.length >= 1 && segments[0] === 'share' && parsed.queryParams?.code) {
      return { type: 'share', code: String(parsed.queryParams.code) };
    }
    if (segments.length >= 1 && segments[0] === 'meetup' && parsed.queryParams?.code) {
      return { type: 'meetup', code: String(parsed.queryParams.code) };
    }

    return null;
  } catch {
    return null;
  }
}

// ============================================
// Profile Checker with Deep Link Handling
// ============================================
function ProfileChecker() {
  const { user, logout } = useAuth();
  const { showAlert } = useAlert();
  const { t, language } = useLanguage();
  const [checking, setChecking] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const supabase = getSupabaseClient();
  const [needsConsent, setNeedsConsent] = useState(false);
  const [deviceBindingAcknowledged, setDeviceBindingAcknowledged] = useState(false);
  const [waitingForDeviceBindingAck, setWaitingForDeviceBindingAck] = useState(false);
  const pendingDeepLinkRef = useRef<{ type: 'share' | 'meetup'; code: string } | null>(null);
  const profileReadyRef = useRef(false);
  const oauthCheckedRef = useRef(false);
  const deviceBindingAlertShownRef = useRef(false);

  const showDeviceBoundConfirmation = (onOk: () => void) => {
    showAlert(
      t('login', 'deviceBindingTitle'),
      t('login', 'deviceBindingMessage'),
      [{ text: 'OK', onPress: onOk }]
    );
  };

  const handleDeepLinkNavigation = (link: { type: 'share' | 'meetup'; code: string }) => {
    setTimeout(() => {
      if (link.type === 'meetup') {
        router.replace('/(tabs)');
        setTimeout(() => {
          router.push({ pathname: '/share', params: { deepLinkCode: link.code, deepLinkType: 'meetup' } });
        }, 300);
      } else {
        router.replace('/(tabs)');
        setTimeout(() => {
          router.push({ pathname: '/share', params: { deepLinkCode: link.code, deepLinkType: 'share' } });
        }, 300);
      }
    }, 200);
  };

  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      const link = parseDeepLink(url);
      if (link && profileReadyRef.current) {
        handleDeepLinkNavigation(link);
      } else if (link) {
        pendingDeepLinkRef.current = link;
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) {
        const link = parseDeepLink(url);
        if (link) {
          pendingDeepLinkRef.current = link;
        }
      }
    });
  }, []);

  useEffect(() => {
    const checkProfile = async () => {
      if (!user?.id) {
        setChecking(false);
        return;
      }

      // Post-OAuth/session device binding check (runs once per session).
      if (!oauthCheckedRef.current && user?.email) {
        oauthCheckedRef.current = true;
        try {
          const binding = await ensureDeviceBoundToAccount(user.email, 'google', user.id);
          if (!binding.allowed && binding.reason === 'device_bound_to_other_account') {
            showAlert(
              t('common', 'error'),
              t('login', 'deviceBindingOAuthKicked'),
              [{
                text: 'OK',
                onPress: async () => {
                  await logout();
                  router.replace('/login');
                }
              }]
            );
            setChecking(false);
            return;
          }

          const pendingBindingAlertFor = await AsyncStorage.getItem(PENDING_DEVICE_BINDING_ALERT_KEY);
          const shouldShowPendingLoginAlert = !!pendingBindingAlertFor;
          const shouldShowNewOAuthBindingAlert = binding.bound && !binding.alreadyBound;

          // Keep this screen in a blocking/loading state while the alert is visible.
          // This prevents the final <Redirect href="/(tabs)" /> from sending the user
          // to the homepage before they press OK.
          if (!deviceBindingAcknowledged && (shouldShowPendingLoginAlert || shouldShowNewOAuthBindingAlert)) {
            setWaitingForDeviceBindingAck(true);
            setChecking(false);

            if (!deviceBindingAlertShownRef.current) {
              deviceBindingAlertShownRef.current = true;
              showDeviceBoundConfirmation(async () => {
                await AsyncStorage.removeItem(PENDING_DEVICE_BINDING_ALERT_KEY);
                setChecking(true);
                setWaitingForDeviceBindingAck(false);
                setDeviceBindingAcknowledged(true);
              });
            }
            return;
          }
        } catch {
          // Do not block legitimate users on unexpected errors.
        }
      }

      // Google-only accounts do not have a Supabase profile/player row. Their
      // express profile lives in AsyncStorage, so profile routing must stay local.
      if (isGoogleOnlyUserId(user.id)) {
        try {
          const localProfile = await loadGoogleOnlyProfile(user.id);
          if (!isGoogleOnlyProfileComplete(localProfile)) {
            setNeedsOnboarding(true);
          } else {
            setNeedsOnboarding(false);
            setNeedsConsent(false);
            profileReadyRef.current = true;
            if (pendingDeepLinkRef.current) {
              const link = pendingDeepLinkRef.current;
              pendingDeepLinkRef.current = null;
              handleDeepLinkNavigation(link);
            }
          }
        } catch {
          setNeedsOnboarding(true);
        } finally {
          setChecking(false);
        }
        return;
      }

      try {
        const [{ data, error }, { data: playerRow }] = await Promise.all([
          supabase
            .from('user_profiles')
            .select('username, consent_accepted')
            .eq('id', user.id)
            .single(),
          supabase
            .from('players')
            .select('city, location')
            .eq('id', user.id)
            .maybeSingle(),
        ]);

        if (error) throw error;

        const emailPrefix = user?.email ? user.email.split('@')[0] : '';
        const hasRealUsername = data?.username && data.username.trim() !== '' && data.username.trim() !== emailPrefix;
        const hasCity = hasRequiredPlayerCity(playerRow);

        if (!hasRealUsername || !hasCity) {
          setNeedsOnboarding(true);
        } else if (!data?.consent_accepted) {
          setNeedsConsent(true);
        } else {
          profileReadyRef.current = true;
          if (pendingDeepLinkRef.current) {
            const link = pendingDeepLinkRef.current;
            pendingDeepLinkRef.current = null;
            handleDeepLinkNavigation(link);
            setChecking(false);
            return;
          }
        }
      } catch (err) {
        console.log('Profile check error:', err);
        setNeedsOnboarding(true);
      } finally {
        setChecking(false);
      }
    };

    checkProfile();
  }, [user?.id, deviceBindingAcknowledged]);

  if (checking || waitingForDeviceBindingAck) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (needsOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  if (needsConsent) {
    return <Redirect href="/consent" />;
  }

  return <Redirect href="/(tabs)" />;
}

export default function RootScreen() {
  const [checkingOnboarding, setCheckingOnboarding] = useState(true);
  const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDING_KEY)
      .then(val => setHasSeenOnboarding(val === 'true'))
      .catch(() => setHasSeenOnboarding(false))
      .finally(() => setCheckingOnboarding(false));
  }, []);

  if (checkingOnboarding) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!hasSeenOnboarding) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <AuthRouter loginRoute="/login">
      <ProfileChecker />
    </AuthRouter>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.backgroundSecondary,
  },
});
