/**
 * PageErrorBoundary
 * 
 * Reusable per-page error boundary that catches JS crashes
 * without blocking the entire app. Shows a contextual retry button.
 */

import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import theme from '@/constants/theme';
import { initSentry } from '@/services/sentryService';

interface PageErrorBoundaryProps {
  children: React.ReactNode;
  pageName?: string;
  fallbackAction?: () => void;
}

interface PageErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class PageErrorBoundary extends React.Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  constructor(props: PageErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[PageErrorBoundary:${this.props.pageName || 'unknown'}]`, error.message, errorInfo.componentStack?.substring(0, 400));
    // Report to Sentry in production
    try {
      const Sentry = require('@/services/sentryService');
      if (Sentry.captureException) {
        Sentry.captureException(error, { extra: { pageName: this.props.pageName, componentStack: errorInfo.componentStack?.substring(0, 1000) } });
      }
    } catch { /* Sentry not available */ }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.fallbackAction) {
      this.props.fallbackAction();
    }
  };

  handleGoBack = () => {
    this.setState({ hasError: false, error: null });
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)' as any);
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={s.container}>
          <View style={s.iconWrap}>
            <MaterialIcons name="error-outline" size={48} color="#EF4444" />
          </View>
          <Text style={s.title}>Oops</Text>
          <Text style={s.message}>
            {this.props.pageName
              ? `An error occurred on "${this.props.pageName}". You can retry or go back.`
              : 'Something went wrong on this page. You can retry or go back.'}
          </Text>
          {__DEV__ && this.state.error ? (
            <View style={s.errorBox}>
              <Text style={s.errorText} numberOfLines={6}>
                {this.state.error.message}
              </Text>
            </View>
          ) : null}
          <View style={s.actions}>
            <Pressable
              style={({ pressed }) => [s.retryBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
              onPress={this.handleRetry}
            >
              <MaterialIcons name="refresh" size={18} color="#FFF" />
              <Text style={s.retryText}>Retry</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
              onPress={this.handleGoBack}
            >
              <MaterialIcons name="arrow-back" size={18} color={theme.primary} />
              <Text style={s.backText}>Go back</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#991B1B',
    lineHeight: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  retryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  backText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2563EB',
  },
});
