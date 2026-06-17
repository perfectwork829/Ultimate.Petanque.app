import { useEffect, useState, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { AuthRouter, useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { Redirect, router } from 'expo-router';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import theme from '@/constants/theme';
import { checkPostOAuthDeviceBinding, recordAccountCreation } from '@/services/deviceFingerprintService';
import { useLanguage } from '@/hooks/useLanguage';
import { hasRequiredPlayerCity } from '@/utils/playerLocationRequirement';

const ONBOARDING_KEY = 'hasSeenOnboarding';

// ============================================
// Deep Link Parser
// ============================================
function parseDeepLink(url: string): { type: 'share' | 'meetup'; code: string } | null {
  try {
    // Handle custom scheme: ultimatepetanque://share/CODE or ultimatepetanque://meetup/CODE
    // Handle https: https://ultimatepetanque.app/share/CODE or /meetup/CODE
    const parsed = Linking.parse(url);
    const path = parsed.path || '';
    const segments = path.split('/').filter(Boolean);

    if (segments.length >= 2 && segments[0] === 'share' && segments[1]) {
      return { type: 'share', code: segments[1] };
    }
    if (segments.length >= 2 && segments[0] === 'meetup' && segments[1]) {
      return { type: 'meetup', code: segments[1] };
    }

    // Also check queryParams as fallback (e.g. ?code=XXX)
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
  const { t } = useLanguage();
  const [checking, setChecking] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const supabase = getSupabaseClient();
  const [needsConsent, setNeedsConsent] = useState(false);
  const pendingDeepLinkRef = useRef<{ type: 'share' | 'meetup'; code: string } | null>(null);
  const profileReadyRef = useRef(false);
  const oauthCheckedRef = useRef(false);

  // Handle deep link navigation after profile is ready
  const handleDeepLinkNavigation = (link: { type: 'share' | 'meetup'; code: string }) => {
    // Small delay to let the tabs mount before navigating
    setTimeout(() => {
      if (link.type === 'meetup') {
        // Navigate to meetup lookup: first try finding by code, then redirect
        router.replace('/(tabs)');
        setTimeout(() => {
          // Pass the code as a search param to share page which handles meetup codes too
          router.push({ pathname: '/share', params: { deepLinkCode: link.code, deepLinkType: 'meetup' } });
        }, 300);
      } else {
        // Share code: navigate to share page with pre-filled code
        router.replace('/(tabs)');
        setTimeout(() => {
          router.push({ pathname: '/share', params: { deepLinkCode: link.code, deepLinkType: 'share' } });
        }, 300);
      }
    }, 200);
  };

  // Listen for deep links (app already open)
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

  // Check initial URL (app opened via deep link)
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

      // Post-OAuth device binding check (runs once per session)
      if (!oauthCheckedRef.current && user?.email) {
        oauthCheckedRef.current = true;
        try {
          const { allowed, reason } = await checkPostOAuthDeviceBinding(user.email);
          if (!allowed && reason === 'device_bound_to_other_account') {
            // Device is bound to another account — kick user out
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
          // Record device binding for OAuth users (first-time)
          recordAccountCreation(user.email, 'google').catch(() => {});
        } catch { /* silent — don't block login on error */ }
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

        // Check if username is just the email prefix (auto-generated by trigger)
        // If so, user hasn't completed the express profile step
        const emailPrefix = user?.email ? user.email.split('@')[0] : '';
        const hasRealUsername = data?.username && data.username.trim() !== '' && data.username.trim() !== emailPrefix;
        const hasCity = hasRequiredPlayerCity(playerRow);

        if (!hasRealUsername || !hasCity) {
          setNeedsOnboarding(true);
        } else if (!data?.consent_accepted) {
          setNeedsConsent(true);
        } else {
          // Profile is ready - handle pending deep link
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
  }, [user?.id]);

  if (checking) {
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
