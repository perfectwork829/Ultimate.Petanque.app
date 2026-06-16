import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Switch,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import {
  requestNotificationPermissions,
  areNotificationsEnabled,
  getAllScheduledNotifications,
  cancelTournamentNotifications,
  sendTestNotification,
  cancelAllNotifications,
} from '@/services/notificationService';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const { tournaments, tournamentNotifications } = useAppData();
  const { toggleTournamentNotification, isTournamentNotificationEnabled } = useAppActions();
  const { t, language } = useLanguage();
  
  const [permissionStatus, setPermissionStatus] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [loading, setLoading] = useState(true);
  const [scheduledCount, setScheduledCount] = useState(0);

  // Get tournaments with notifications enabled
  const tournamentsWithNotifications = useMemo(() => {
    return tournaments.filter(t => isTournamentNotificationEnabled(t.id));
  }, [tournaments, tournamentNotifications, isTournamentNotificationEnabled]);

  // Get upcoming tournaments (can enable notifications) — exclude En cours / Terminé
  const upcomingTournaments = useMemo(() => {
    const now = new Date();
    return tournaments.filter(t => {
      const tournamentDate = new Date(t.date);
      if (t.status === 'Terminé' || t.status === 'En cours') return false;
      return tournamentDate > now && !isTournamentNotificationEnabled(t.id);
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [tournaments, tournamentNotifications, isTournamentNotificationEnabled]);

  // Auto-disable notifications for tournaments that are finished, in progress, or past date
  useEffect(() => {
    const now = new Date();
    const staleWithNotifs = tournamentsWithNotifications.filter(t => {
      if (t.status === 'Terminé' || t.status === 'En cours') return true;
      // Also catch tournaments whose date has passed but status was never updated
      const tournamentDate = new Date(t.date);
      return tournamentDate < now;
    });
    if (staleWithNotifs.length > 0) {
      staleWithNotifs.forEach(async (t) => {
        await cancelTournamentNotifications(t.id);
        toggleTournamentNotification(t.id);
      });
    }
  }, [tournamentsWithNotifications]);

  // Check permission and scheduled notifications on mount
  useEffect(() => {
    const checkStatus = async () => {
      setLoading(true);
      try {
        const enabled = await areNotificationsEnabled();
        setPermissionStatus(enabled ? 'granted' : 'denied');
        
        const scheduled = await getAllScheduledNotifications();
        setScheduledCount(scheduled.length);
      } catch (error) {
        console.log('Error checking notification status:', error);
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, []);

  // Request permission
  const handleRequestPermission = useCallback(async () => {
    Haptics.selectionAsync();
    const granted = await requestNotificationPermissions();
    setPermissionStatus(granted ? 'granted' : 'denied');
    
    if (!granted) {
      Alert.alert(
        t('notifications', 'authRequired'),
        t('notifications', 'authRequiredMsg'),
        [
          { text: t('common', 'cancel'), style: 'cancel' },
          { 
            text: t('notifications', 'openSettings'), 
            onPress: () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            }
          },
        ]
      );
    }
  }, []);

  // Disable notification for a tournament
  const handleDisableNotification = useCallback(async (tournamentId: string, tournamentName: string) => {
    Alert.alert(
      t('notifications', 'disableReminders'),
      `${t('notifications', 'disableConfirm')} "${tournamentName}" ?`,
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('notifications', 'disableReminders'),
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await cancelTournamentNotifications(tournamentId);
            toggleTournamentNotification(tournamentId);
            
            // Refresh count
            const scheduled = await getAllScheduledNotifications();
            setScheduledCount(scheduled.length);
          }
        }
      ]
    );
  }, [toggleTournamentNotification]);

  // Navigate to tournament to enable notifications
  const handleEnableNotification = useCallback((tournamentId: string) => {
    Haptics.selectionAsync();
    router.push(`/tournament/${tournamentId}`);
  }, []);

  // Send test notification
  const handleTestNotification = useCallback(async () => {
    Haptics.selectionAsync();
    await sendTestNotification();
    Alert.alert(t('notifications', 'testSent'), t('notifications', 'testSentMsg'));
  }, []);

  // Disable all notifications
  const handleDisableAll = useCallback(() => {
    if (tournamentsWithNotifications.length === 0) return;
    
    Alert.alert(
      t('notifications', 'disableAll'),
      `${t('notifications', 'disableAllConfirm')} ${tournamentsWithNotifications.length} ${t('notifications', 'tournamentCount')} ?`,
      [
        { text: t('common', 'cancel'), style: 'cancel' },
        {
          text: t('notifications', 'disableAll'),
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            await cancelAllNotifications();
            
            // Disable all in context
            for (const t of tournamentsWithNotifications) {
              toggleTournamentNotification(t.id);
            }
            
            setScheduledCount(0);
          }
        }
      ]
    );
  }, [tournamentsWithNotifications, toggleTournamentNotification]);

  // Calculate days until tournament
  const getDaysUntil = (date: string) => {
    const tournamentDate = new Date(date);
    const now = new Date();
    return Math.ceil((tournamentDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('notifications', 'title')}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('notifications', 'title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Card */}
        <Animated.View entering={FadeInDown.duration(300)} style={styles.statusCard}>
          <View style={[
            styles.statusIconBox,
            { backgroundColor: permissionStatus === 'granted' ? theme.success + '20' : theme.warning + '20' }
          ]}>
            <MaterialIcons 
              name={permissionStatus === 'granted' ? 'notifications-active' : 'notifications-off'} 
              size={32} 
              color={permissionStatus === 'granted' ? theme.success : theme.warning} 
            />
          </View>
          <View style={styles.statusInfo}>
            <Text style={[
              styles.statusTitle,
              { color: permissionStatus === 'granted' ? theme.success : theme.warning }
            ]}>
              {permissionStatus === 'granted' ? t('notifications', 'enabled') : t('notifications', 'disabled')}
            </Text>
            <Text style={styles.statusSubtitle}>
              {permissionStatus === 'granted' 
                ? `${scheduledCount} ${t('notifications', 'scheduledReminders')}`
                : t('notifications', 'enableToReceive')
              }
            </Text>
          </View>
          {permissionStatus !== 'granted' && (
            <Pressable style={styles.enableButton} onPress={handleRequestPermission}>
              <Text style={styles.enableButtonText}>{t('notifications', 'enable')}</Text>
            </Pressable>
          )}
        </Animated.View>

        {/* Test Notification */}
        {permissionStatus === 'granted' && (
          <Animated.View entering={FadeInDown.duration(300).delay(50)}>
            <Pressable style={styles.testButton} onPress={handleTestNotification}>
              <MaterialIcons name="send" size={20} color={theme.primary} />
              <Text style={styles.testButtonText}>{t('notifications', 'sendTest')}</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* Active Notifications Section */}
        <Animated.View entering={FadeInDown.duration(300).delay(100)} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('notifications', 'activeReminders')}</Text>
            {tournamentsWithNotifications.length > 0 && (
              <Pressable onPress={handleDisableAll}>
                <Text style={styles.disableAllText}>{t('notifications', 'disableAll')}</Text>
              </Pressable>
            )}
          </View>

          {tournamentsWithNotifications.length > 0 ? (
            <View style={styles.tournamentList}>
              {tournamentsWithNotifications.map((tournament, index) => {
                const daysUntil = getDaysUntil(tournament.date);
                const isPast = daysUntil < 0;
                
                return (
                  <Animated.View
                    key={tournament.id}
                    entering={FadeIn.duration(200).delay(index * 50)}
                  >
                    <Pressable 
                      style={[styles.tournamentCard, isPast && styles.tournamentCardPast]}
                      onPress={() => router.push(`/tournament/${tournament.id}`)}
                    >
                      <View style={styles.tournamentIconBox}>
                        <MaterialIcons 
                          name="emoji-events" 
                          size={24} 
                          color={isPast ? theme.textMuted : theme.carreauColor} 
                        />
                      </View>
                      <View style={styles.tournamentInfo}>
                        <Text style={[styles.tournamentName, isPast && styles.tournamentNamePast]} numberOfLines={1}>
                          {tournament.name}
                        </Text>
                        <View style={styles.tournamentMeta}>
                          <MaterialIcons name="event" size={12} color={theme.textMuted} />
                          <Text style={styles.tournamentMetaText}>
                            {new Date(tournament.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </Text>
                          {!isPast && (
                            <>
                              <View style={styles.dot} />
                              <Text style={[
                                styles.tournamentMetaText,
                                daysUntil <= 3 && { color: theme.warning, fontWeight: '600' }
                              ]}>
                                {daysUntil === 0 ? t('notifications', 'todayLabel') : daysUntil === 1 ? t('notifications', 'tomorrowLabel') : `${t('notifications', 'inDays')} ${daysUntil}${t('notifications', 'daysUnit')}`}
                              </Text>
                            </>
                          )}
                        </View>
                      </View>
                      <Pressable
                        style={styles.disableButton}
                        onPress={() => handleDisableNotification(tournament.id, tournament.name)}
                        hitSlop={8}
                      >
                        <MaterialIcons name="notifications-off" size={20} color={theme.error} />
                      </Pressable>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          ) : (
            <View style={styles.emptyState}>
              <MaterialIcons name="notifications-none" size={48} color={theme.textMuted} />
              <Text style={styles.emptyStateText}>{t('notifications', 'noActiveReminders')}</Text>
              <Text style={styles.emptyStateHint}>
                {t('notifications', 'enableFromTournament')}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* Upcoming Tournaments Section */}
        {upcomingTournaments.length > 0 && (
          <Animated.View entering={FadeInDown.duration(300).delay(150)} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('notifications', 'upcomingTournaments')}</Text>
              <Text style={styles.sectionCount}>{upcomingTournaments.length}</Text>
            </View>

            <View style={styles.tournamentList}>
              {upcomingTournaments.slice(0, 5).map((tournament, index) => {
                const daysUntil = getDaysUntil(tournament.date);
                
                return (
                  <Animated.View
                    key={tournament.id}
                    entering={FadeIn.duration(200).delay(index * 50)}
                  >
                    <Pressable 
                      style={styles.upcomingCard}
                      onPress={() => handleEnableNotification(tournament.id)}
                    >
                      <View style={[styles.tournamentIconBox, { backgroundColor: theme.backgroundSecondary }]}>
                        <MaterialIcons name="emoji-events" size={24} color={theme.textSecondary} />
                      </View>
                      <View style={styles.tournamentInfo}>
                        <Text style={styles.upcomingName} numberOfLines={1}>
                          {tournament.name}
                        </Text>
                        <View style={styles.tournamentMeta}>
                          <MaterialIcons name="event" size={12} color={theme.textMuted} />
                          <Text style={styles.tournamentMetaText}>
                            {new Date(tournament.date).toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
                              day: 'numeric',
                              month: 'short'
                            })}
                          </Text>
                          <View style={styles.dot} />
                          <Text style={styles.tournamentMetaText}>
                            {t('notifications', 'inDays')} {daysUntil}{t('notifications', 'daysUnit')}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.addNotificationButton}>
                        <MaterialIcons name="add-alert" size={20} color={theme.primary} />
                      </View>
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>

            {upcomingTournaments.length > 5 && (
              <Pressable 
                style={styles.viewAllButton}
                onPress={() => router.push('/(tabs)/directory')}
              >
                <Text style={styles.viewAllButtonText}>
                  {t('notifications', 'viewAll')} ({upcomingTournaments.length})
                </Text>
                <MaterialIcons name="chevron-right" size={18} color={theme.primary} />
              </Pressable>
            )}
          </Animated.View>
        )}

        {/* Witness Attestation Requests Link */}
        <Animated.View entering={FadeInDown.duration(300).delay(175)} style={styles.section}>
          <Pressable
            style={styles.tournamentCard}
            onPress={() => router.push({ pathname: '/notifications-hub', params: { tab: 'witness' } } as any)}
          >
            <View style={[styles.tournamentIconBox, { backgroundColor: '#7C3AED15' }]}>
              <MaterialIcons name="visibility" size={24} color="#7C3AED" />
            </View>
            <View style={styles.tournamentInfo}>
              <Text style={styles.tournamentName}>
                {language === 'fr' ? 'Attestations de temoin' : 'Witness Attestations'}
              </Text>
              <Text style={styles.tournamentMetaText}>
                {language === 'fr' ? 'Voir les demandes recues' : 'View received requests'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
          </Pressable>
        </Animated.View>

        {/* Info Card */}
        <Animated.View entering={FadeInDown.duration(300).delay(200)} style={styles.infoCard}>
          <MaterialIcons name="info-outline" size={20} color={theme.textMuted} />
          <Text style={styles.infoText}>
            {t('notifications', 'infoText')}
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  // Status Card
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 16,
    ...theme.shadows.card,
  },
  statusIconBox: {
    width: 56,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  statusInfo: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  statusSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  enableButton: {
    backgroundColor: theme.warning,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.borderRadius.md,
  },
  enableButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  // Test Button
  testButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.primary + '15',
    paddingVertical: 14,
    borderRadius: theme.borderRadius.lg,
    marginBottom: 24,
  },
  testButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
  },
  // Section
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 1,
  },
  sectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.primary,
    backgroundColor: theme.primary + '15',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  disableAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.error,
  },
  // Tournament List
  tournamentList: {
    gap: 10,
  },
  tournamentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: theme.success,
    ...theme.shadows.card,
  },
  tournamentCardPast: {
    borderLeftColor: theme.textMuted,
    opacity: 0.7,
  },
  tournamentIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.carreauColor + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  tournamentInfo: {
    flex: 1,
  },
  tournamentName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
    marginBottom: 4,
  },
  tournamentNamePast: {
    color: theme.textSecondary,
  },
  tournamentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tournamentMetaText: {
    fontSize: 12,
    color: theme.textMuted,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.textMuted,
  },
  disableButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.error + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Upcoming Card
  upcomingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    ...theme.shadows.card,
  },
  upcomingName: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: 4,
  },
  addNotificationButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
  },
  viewAllButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
  },
  // Empty State
  emptyState: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 32,
    alignItems: 'center',
    ...theme.shadows.card,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.textPrimary,
    marginTop: 12,
  },
  emptyStateHint: {
    fontSize: 13,
    color: theme.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
  // Info Card
  infoCard: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md,
    padding: 14,
    gap: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: theme.textMuted,
    lineHeight: 18,
  },
});
