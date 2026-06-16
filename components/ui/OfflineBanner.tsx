import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { getLastSyncTimestamp } from '@/services/cacheService';
import { getQueueSize } from '@/services/offlineQueueService';
import { useAppActions, useAppUI } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import theme from '@/constants/theme';

export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { isConnected } = useNetworkStatus();
  const { refreshData } = useAppActions();
  const { isReplayingQueue, replayProgress } = useAppUI();
  const { t, language } = useLanguage();
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const [, setTick] = useState(0);

  // Animated progress bar for replay
  const progressWidth = useSharedValue(0);
  const pulseOpacity = useSharedValue(1);

  // Load last sync timestamp + queue size and refresh display every 30s
  useEffect(() => {
    const load = async () => {
      const ts = await getLastSyncTimestamp();
      setLastSync(ts);
      const qs = await getQueueSize();
      setQueueCount(qs);
    };
    load();
    const interval = setInterval(() => {
      load();
      setTick(t => t + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Animate progress bar during replay
  useEffect(() => {
    if (isReplayingQueue && replayProgress.total > 0) {
      const pct = (replayProgress.current / replayProgress.total) * 100;
      progressWidth.value = withTiming(pct, { duration: 300, easing: Easing.out(Easing.cubic) });
    } else {
      progressWidth.value = 0;
    }
  }, [isReplayingQueue, replayProgress, progressWidth]);

  // Pulse animation during replay
  useEffect(() => {
    if (isReplayingQueue) {
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 600 }),
          withTiming(1, { duration: 600 })
        ),
        -1,
        false
      );
    } else {
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isReplayingQueue, pulseOpacity]);

  const progressBarStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  const getTimeSinceSync = useCallback((): string => {
    if (!lastSync) {
      return t('offlineBanner', 'neverSynced');
    }
    const diff = Date.now() - new Date(lastSync).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('offlineBanner', 'lessThan1Min');
    if (minutes < 60) return language === 'fr' ? `il y a ${minutes} min` : `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return language === 'fr' ? `il y a ${hours}h` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return language === 'fr' ? `il y a ${days}j` : `${days}d ago`;
  }, [lastSync, language]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshData();
      const ts = await getLastSyncTimestamp();
      setLastSync(ts);
    } catch {
      // ignore
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);

  // Show banner when offline OR when replaying queue (even if connected)
  const shouldShow = !isConnected || isReplayingQueue;
  if (!shouldShow) return null;

  // Replaying state (green/syncing banner)
  if (isReplayingQueue) {
    return (
      <Animated.View
        entering={FadeInDown.duration(300)}
        exiting={FadeOutUp.duration(200)}
        style={[styles.banner, styles.bannerSyncing, { paddingTop: insets.top + 6 }]}
      >
        <Animated.View style={[styles.iconContainer, styles.iconContainerSyncing, pulseStyle]}>
          <MaterialIcons name="cloud-sync" size={16} color="#FFF" />
        </Animated.View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>
            {t('offlineBanner', 'syncing')}
          </Text>
          <Text style={styles.subtitle}>
            {replayProgress.current}/{replayProgress.total}{' '}
            {t('offlineBanner', 'operations')}
          </Text>
          {/* Progress bar */}
          <View style={styles.progressBarTrack}>
            <Animated.View style={[styles.progressBarFill, progressBarStyle]} />
          </View>
        </View>
        <View style={styles.replayBadge}>
          <ActivityIndicator size="small" color="#FFF" />
        </View>
      </Animated.View>
    );
  }

  // Offline state (red banner)
  return (
    <Animated.View
      entering={FadeInDown.duration(300)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.banner, { paddingTop: insets.top + 6 }]}
    >
      <View style={styles.iconContainer}>
        <MaterialIcons name="cloud-off" size={16} color="#FFF" />
      </View>
      <View style={styles.textContainer}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>
            {t('offlineBanner', 'offlineMode')}
          </Text>
          {queueCount > 0 ? (
            <View style={styles.queueBadge}>
              <MaterialIcons name="schedule" size={10} color="#FFF" />
              <Text style={styles.queueBadgeText}>{queueCount}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.subtitle}>
          {t('offlineBanner', 'lastSync')}
          {getTimeSinceSync()}
          {queueCount > 0
            ? ` · ${queueCount} ${t('offlineBanner', 'pending')}`
            : ''}
        </Text>
      </View>
      <Pressable
        style={({ pressed }) => [styles.refreshBtn, pressed && styles.refreshBtnPressed]}
        onPress={handleRefresh}
        disabled={refreshing}
        hitSlop={8}
      >
        {refreshing ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <MaterialIcons name="refresh" size={20} color="#FFF" />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#B91C1C',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  bannerSyncing: {
    backgroundColor: '#1D6F42',
  },
  iconContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainerSyncing: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  textContainer: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 1,
  },
  queueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  queueBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  refreshBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnPressed: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  replayBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#4ADE80',
    borderRadius: 2,
  },
});
