import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GOOGLE_OAUTH_CALLBACK_URL_KEY, GOOGLE_OAUTH_IN_PROGRESS_KEY } from '@/template/auth/supabase/service';
import { getSupabaseClient } from '@/template';
import theme from '@/constants/theme';

/**
 * Handles Supabase email links (signup / magic link / PKCE) opened via ultimatepetanque://auth
 * or exp://.../--/auth in Expo Go. Sign-up in the app normally uses the numeric OTP field on /login.
 */
export default function AuthCallbackScreen() {
  const [message, setMessage] = useState('Signing you in…');

  useEffect(() => {
    let cancelled = false;

    const finish = (path: '/' | '/login' = '/') => {
      if (!cancelled) router.replace(path);
    };

    const handleUrl = async (url: string) => {
      try {
        const supabase = getSupabaseClient();
        const normalizedUrl = url.replace('ultimate.petanque.app', 'ultimatepetanque.app');
        const { params, errorCode } = QueryParams.getQueryParams(normalizedUrl);

        if (errorCode) {
          setMessage('Sign-in link expired or invalid. Use the code from your email on the login screen.');
          setTimeout(() => finish('/login'), 2500);
          return;
        }

        const code = typeof params.code === 'string' ? params.code : null;
        if (code) {
          // Google OAuth started from login.tsx is completed by WebBrowser.openAuthSessionAsync.
          // Do not exchange the same code here, because it can consume/lose the PKCE verifier
          // before the login flow exchanges it. Email magic links still fall through here normally.
          const googleOAuthInProgress = await AsyncStorage.getItem(GOOGLE_OAUTH_IN_PROGRESS_KEY);
          if (googleOAuthInProgress === '1') {
            // Hand the callback back to the login flow. On some Android devices
            // Chrome Custom Tabs reports "dismiss" even though the deep link arrived here.
            await AsyncStorage.setItem(GOOGLE_OAUTH_CALLBACK_URL_KEY, normalizedUrl);
            setMessage('Returning to Google sign-in…');
            setTimeout(() => finish('/login'), 350);
            return;
          }

          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          finish('/');
          return;
        }

        const accessToken = typeof params.access_token === 'string' ? params.access_token : null;
        const refreshToken = typeof params.refresh_token === 'string' ? params.refresh_token : null;
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
          finish('/');
          return;
        }

        setMessage('Open the app and enter the verification code from your email (not the browser link).');
        setTimeout(() => finish('/login'), 3000);
      } catch {
        setMessage('Could not complete sign-in from the link. Enter the code from your email on the login screen.');
        setTimeout(() => finish('/login'), 3000);
      }
    };

    Linking.getInitialURL()
      .then((url) => {
        if (url && (url.includes('auth') || url.includes('access_token') || url.includes('code='))) {
          handleUrl(url);
        } else {
          finish('/');
        }
      })
      .catch(() => finish('/'));

    const sub = Linking.addEventListener('url', ({ url }) => {
      if (url.includes('auth') || url.includes('access_token') || url.includes('code=')) {
        handleUrl(url);
      }
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={theme.primary} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#FFF' },
  text: { marginTop: 16, fontSize: 14, color: theme.textSecondary, textAlign: 'center' },
});
