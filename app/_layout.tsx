import React from 'react';
import { View, Text, ScrollView, StyleSheet as RNStyleSheet, Platform, Pressable } from 'react-native';
import { initializeAds } from '@/services/adService';
import { bindGoldSponsorSyncOnAppResume } from '@/services/goldSponsorAdReplacement';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertProvider, AuthProvider } from '@/template';
import { AppProvider } from '@/contexts/AppContext';
import { AdminCacheProvider } from '@/contexts/AdminCacheContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { ToastProvider } from '@/components/ui/Toast';
import OfflineBanner from '@/components/ui/OfflineBanner';
import ConflictResolutionModal from '@/components/ui/ConflictResolutionModal';
import { useAppActions } from '@/contexts/AppContext';
import TrackingConsentModal from '@/components/ui/TrackingConsentModal';
import MaintenanceBanner from '@/components/ui/MaintenanceBanner';
import { isATTPromptNeeded } from '@/services/trackingService';
import DevPerformanceOverlay from '@/components/ui/DevPerformanceOverlay';
import PageErrorBoundary from '@/components/ui/PageErrorBoundary';
import { checkUserBanStatus, BanInfo } from '@/services/banCheckService';
import BanScreen from '@/components/ui/BanScreen';
import { initSentry } from '@/services/sentryService';
import { addNotificationResponseListener } from '@/services/notificationService';
import { registerPushToken } from '@/services/pushTokenService';
import { router } from 'expo-router';
import { checkTempDataExpiry } from '@/services/retentionNotificationService';
import { checkFavoriteTerrainActivity } from '@/services/terrainActivityNotificationService';
import { checkTeamDeadlineReminders } from '@/services/teamInvitationService';
import { registerBackgroundProximityTask } from '@/services/backgroundProximityService';
import * as Linking from 'expo-linking';
import { findEventByCode } from '@/services/sponsoredEventService';

// ============================================
// Error Boundary — catches JS crashes on web
// ============================================
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={errorStyles.container}>
          <ScrollView contentContainerStyle={errorStyles.scroll}>
            <Text style={errorStyles.icon}>⚠️</Text>
            <Text style={errorStyles.title}>Application Error</Text>
            <Text style={errorStyles.message}>
              {this.state.error?.message || 'An unexpected error occurred'}
            </Text>
            <Text style={errorStyles.stack}>
              {this.state.error?.stack?.substring(0, 800) || ''}
            </Text>
            <Pressable
              style={errorStyles.button}
              onPress={() => this.setState({ hasError: false, error: null })}
            >
              <Text style={errorStyles.buttonText}>Retry</Text>
            </Pressable>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

const errorStyles = RNStyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'center' },
  scroll: { padding: 24, alignItems: 'center' },
  icon: { fontSize: 48, marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', color: '#F8FAFC', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 16, color: '#94A3B8', marginBottom: 16, textAlign: 'center', lineHeight: 24 },
  stack: { fontSize: 12, color: '#64748B', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 24, textAlign: 'left', width: '100%' },
  button: { backgroundColor: '#3B82F6', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  buttonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <AlertProvider>
        <AuthProvider>
          <SafeAreaProvider>
            <LanguageProvider>
            <ToastProvider>
            <AppProvider>
              <AdminCacheProvider>
              <LayoutInner />
              </AdminCacheProvider>
            </AppProvider>
            </ToastProvider>
            </LanguageProvider>
          </SafeAreaProvider>
        </AuthProvider>
      </AlertProvider>
    </AppErrorBoundary>
  );
}

function LayoutInner() {
  const { currentConflict, conflictRemaining, resolveConflict } = useAppActions();
  const [showATT, setShowATT] = React.useState(false);
  const [banInfo, setBanInfo] = React.useState<BanInfo | null>(null);

  // Initialize Sentry crash reporting
  React.useEffect(() => {
    try { initSentry(); } catch (e) { console.log('[Sentry] Init error:', e); }
  }, []);

  // Re-sync gold sponsor ↔ AdMob state when app returns to foreground
  React.useEffect(() => {
    bindGoldSponsorSyncOnAppResume();
  }, []);

  // Google Mobile Ads — delay until after first frame (requires DELAY_APP_MEASUREMENT_INIT in manifest)
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const timer = setTimeout(() => {
      initializeAds().catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  // Check ban status on mount and periodically
  React.useEffect(() => {
    const checkBan = async () => {
      const result = await checkUserBanStatus();
      if (result.isBanned) setBanInfo(result);
      else setBanInfo(null);
    };
    checkBan();
    const interval = setInterval(checkBan, 60000); // Check every 60s
    return () => clearInterval(interval);
  }, []);

  React.useEffect(() => {
    isATTPromptNeeded().then(needed => {
      if (needed) setShowATT(true);
    }).catch(() => {});
  }, []);

  // Register push token for server-side notifications
  React.useEffect(() => {
    registerPushToken().catch(() => {});
  }, []);

  // Check temp data expiry for non-registered users & update retention on login
  React.useEffect(() => {
    checkTempDataExpiry().then(({ expired }) => {
      if (expired) {
        console.log('[Retention] Temporary onboarding data expired and cleaned up');
      }
    }).catch(() => {});
  }, []);

  // Check if favorite terrains are active and send push notification
  React.useEffect(() => {
    const timer = setTimeout(() => {
      checkFavoriteTerrainActivity().then(({ activeTerrains, notificationSent }) => {
        if (activeTerrains.length > 0) {
          console.log(`[TerrainActivity] ${activeTerrains.length} favorite terrain(s) active, push sent: ${notificationSent}`);
        }
      }).catch(() => {});
    }, 5000); // Delay 5s after app mount
    return () => clearTimeout(timer);
  }, []);

  // Check team formation deadline reminders
  React.useEffect(() => {
    const timer = setTimeout(() => {
      checkTeamDeadlineReminders().catch(() => {});
    }, 8000); // Delay 8s after mount
    return () => clearTimeout(timer);
  }, []);

  // Register background proximity check task
  React.useEffect(() => {
    const timer = setTimeout(() => {
      try {
        registerBackgroundProximityTask().catch(() => {});
      } catch (e) {
        console.log('[Layout] Background proximity registration skipped:', e);
      }
    }, 10000); // Delay 10s after mount
    return () => clearTimeout(timer);
  }, []);

  // Handle deep links for event QR codes (?event=CODE)
  React.useEffect(() => {
    const handleDeepLinkUrl = async (url: string) => {
      if (!url) return;
      const eventMatch = url.match(/[?&]event=([A-Z0-9-]+)/i);
      if (eventMatch) {
        const code = eventMatch[1].toUpperCase();
        setTimeout(async () => {
          try {
            const { event } = await findEventByCode(code);
            if (event) {
              router.push(`/sponsored-event/${event.id}` as any);
            } else {
              router.push({ pathname: '/sponsored-event/list', params: { joinCode: code } } as any);
            }
          } catch {
            router.push({ pathname: '/sponsored-event/list', params: { joinCode: code } } as any);
          }
        }, 500);
      }
    };

    Linking.getInitialURL().then(url => {
      if (url) handleDeepLinkUrl(url);
    }).catch(() => {});

    const sub = Linking.addEventListener('url', ({ url }) => handleDeepLinkUrl(url));
    return () => sub.remove();
  }, []);

  // Navigate to match-invitations when user taps a share request notification
  React.useEffect(() => {
    const sub = addNotificationResponseListener((response: any) => {
      const data = response?.notification?.request?.content?.data;
      if (!data?.type) return;
      // Small delay to ensure navigation stack is ready
      setTimeout(() => {
        switch (data.type) {
          case 'retention':
            // Handle retention notification taps
            if (data.action === 'play_match') {
              router.push('/match/new' as any);
            } else if (data.action === 'register' || data.action === 'register_urgent') {
              router.push('/login' as any);
            } else if (data.action === 'view_stats') {
              router.push('/(tabs)/stats' as any);
            } else if (data.action === 'invite_partner') {
              router.push('/share-hub' as any);
            }
            break;
          case 'share_request':
            router.push({ pathname: '/notifications-hub', params: { tab: 'invitations' } } as any);
            break;
          case 'event_created':
          case 'event_reminder':
            if (data.eventId) router.push(`/sponsored-event/${data.eventId}` as any);
            else router.push('/sponsored-event/list' as any);
            break;
          case 'meetup_invitation':
            if (data.meetupId) router.push(`/meetup/${data.meetupId}` as any);
            else router.push('/meetup/invitations' as any);
            break;
          case 'ranking_changed':
            router.push('/leaderboard' as any);
            break;
          case 'witness_request':
            router.push({ pathname: '/notifications-hub', params: { tab: 'witness' } } as any);
            break;
          case 'witness_attested':
            if (data.matchId) router.push(`/match/${data.matchId}` as any);
            break;
          case 'club_claim':
            router.push({ pathname: '/notifications-hub', params: { tab: 'claims' } } as any);
            break;
          case 'club_invitation':
          case 'club_invitation_reminder':
            router.push('/club-invitations' as any);
            break;
          case 'club_invitation_response':
            router.push('/club-invitations' as any);
            break;
          case 'admin_deletion_alert':
            router.push('/admin-anticheat' as any);
            break;
          case 'player_transfer_request':
            router.push({ pathname: '/notifications-hub', params: { tab: 'transfers' } } as any);
            break;
          case 'player_transfer_response':
            router.push({ pathname: '/notifications-hub', params: { tab: 'transfers' } } as any);
            break;
          case 'team_invitation':
            router.push({ pathname: '/notifications-hub', params: { tab: 'teams' } } as any);
            break;
          case 'team_invitation_response':
            router.push({ pathname: '/notifications-hub', params: { tab: 'teams' } } as any);
            break;
          case 'device_transfer_decision':
            router.push('/device-transfer' as any);
            break;
          case 'team_dissolved':
          case 'team_member_removed':
            router.push({ pathname: '/notifications-hub', params: { tab: 'teams' } } as any);
            break;
          case 'team_chat_message':
            if (data.teamId) router.push(`/team-chat/${data.teamId}` as any);
            else router.push({ pathname: '/notifications-hub', params: { tab: 'teams' } } as any);
            break;
          case 'team_deadline_reminder':
            if (data.teamId) router.push({ pathname: '/notifications-hub', params: { tab: 'teams' } } as any);
            else router.push('/(tabs)' as any);
            break;
          case 'terrain_activity':
            if (data.terrainId) router.push(`/terrain/${data.terrainId}` as any);
            else router.push({ pathname: '/(tabs)/map', params: { filter: 'terrains', activeNow: 'true' } } as any);
            break;
          case 'maintenance':
            // No navigation, banner auto-shows via polling
            break;
          default:
            break;
        }
      }, 300);
    });
    return () => sub.remove();
  }, []);
  // Show ban screen if user is banned
  if (banInfo?.isBanned) {
    return <BanScreen banInfo={banInfo} language="fr" />;
  }

  return (
            <PageErrorBoundary pageName="App">
            <View style={{ flex: 1 }}>
            <StatusBar style="dark" />
            <MaintenanceBanner />
            <OfflineBanner />
            <TrackingConsentModal
              visible={showATT}
              onComplete={() => setShowATT(false)}
            />
            <ConflictResolutionModal
              visible={currentConflict !== null}
              conflict={currentConflict}
              onResolve={resolveConflict}
              remaining={conflictRemaining}
            />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen 
                name="player/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }}
              />
              <Stack.Screen 
                name="club/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="tournament/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="match/new" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }}
              />
              <Stack.Screen 
                name="match/[id]" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="match-detail/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="player/edit/[id]" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="player/new" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />

              <Stack.Screen 
                name="player/me" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="club/new" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="club/edit/[id]" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="tournament/new" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="tournament/edit/[id]" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="challenge/new" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="challenge/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="sponsored-event/new" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="sponsored-event/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="sponsored-event/list" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="terrain/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="terrain/new" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="terrain/edit/[id]" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="meetup/new" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="meetup/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="meetup/invitations" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="history" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="profile" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="login" 
                options={{ 
                  headerShown: false,
                  animation: 'fade',
                }} 
              />
              <Stack.Screen 
                name="onboarding" 
                options={{ 
                  headerShown: false,
                  animation: 'slide_from_right',
                  gestureEnabled: false,
                }} 
              />
              <Stack.Screen 
                name="faq" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="notifications" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="palmares" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="equipment" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="password" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="financial" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="merge-history" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="privacy-policy" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="terms" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="consent" 
                options={{ 
                  headerShown: false,
                  animation: 'fade',
                  gestureEnabled: false,
                }} 
              />
              <Stack.Screen 
                name="share" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="notifications-hub" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="share-hub" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="share-history" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="share-notifications" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="shared-items" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="match-invitations" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="sync-history" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="creator-note" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="leaderboard" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="export" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="remove-ads" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="partners" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="ambassadors" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-promos" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="ambassador-dashboard" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="ambassador-program" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="partner-program" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="club-ranking/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="boules-ranking/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="notification-preferences" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="badges" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="city-leaderboard" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="trust-score" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="elo-awards" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-anticheat" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="partnerships" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="sponsor-analytics" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-sponsors" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-partners" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="partner-analytics" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="partner/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="sponsor-portal" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="sponsor-preview" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="sponsor-digest" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="witness-invitations" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="scanner" 
                options={{ 
                  headerShown: false,
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="roadmap" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-maintenance" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-announcements" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-moderation" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-terrains" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-dashboard" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-activity-log" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-users" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-clubs" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-reports" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-notifications" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-changelog" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="admin-ab-tests" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="activity-feed" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="player-compare" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="global-ranking" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="leaderboard-geo" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="role-performance" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="share-card" 
                options={{ 
                  presentation: 'modal',
                  animation: 'slide_from_bottom',
                }} 
              />
              <Stack.Screen 
                name="card-gallery" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="club-leaderboard" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="club-compare" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="club-city-ranking" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="club-analytics" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="club-invitations" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="season-detail" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="following" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="device-transfer" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="terrain-activity/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
              <Stack.Screen 
                name="team-chat/[id]" 
                options={{ 
                  presentation: 'card',
                  animation: 'slide_from_right',
                }} 
              />
            </Stack>
            {__DEV__ ? <DevPerformanceOverlay /> : null}
            </View>
            </PageErrorBoundary>
  );
}
