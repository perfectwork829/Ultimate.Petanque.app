/**
 * MaintenanceBanner
 *
 * Displays a prominent banner at the top of the app when maintenance mode is active.
 * Features a live countdown timer to estimated end time.
 * Polls app_config every 60s and auto-dismisses when maintenance ends.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useLanguage } from '@/hooks/useLanguage';
import { getMaintenanceStatus, autoActivateScheduledMaintenance, MaintenanceStatus } from '@/services/maintenanceService';

const POLL_INTERVAL_MS = 60_000; // Check every 60s

export default function MaintenanceBanner() {
  const { language } = useLanguage();
  const fr = language === 'fr';
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [countdown, setCountdown] = useState('');
  const [scheduleCountdown, setScheduleCountdown] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [scheduleDismissed, setScheduleDismissed] = useState(false);
  const [autoActivated, setAutoActivated] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scheduleCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    const result = await getMaintenanceStatus();
    setStatus(result);
    if (!result.isActive && !result.isScheduled) {
      setDismissed(false);
      setScheduleDismissed(false);
      setAutoActivated(false);
    }
    // Auto-activate scheduled maintenance when time passes (admin only, silently fails for others)
    if (result.scheduledAt && !result.isScheduled && !result.isActive && !autoActivated) {
      // scheduledAt exists but isScheduled=false means time passed, isActive=false means not yet activated
    }
    if (result.isActive && result.scheduledAt && !autoActivated) {
      // Scheduled time passed, try to formalize activation
      setAutoActivated(true);
      autoActivateScheduledMaintenance(result).catch(() => {});
    }
  }, [autoActivated]);

  // Poll maintenance status
  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchStatus]);

  // Scheduled countdown timer
  useEffect(() => {
    if (!status?.isScheduled || !status.scheduledAt) {
      setScheduleCountdown('');
      if (scheduleCountdownRef.current) clearInterval(scheduleCountdownRef.current);
      return;
    }

    const updateScheduleCountdown = () => {
      const start = new Date(status.scheduledAt!).getTime();
      const now = Date.now();
      const diff = start - now;

      if (diff <= 0) {
        setScheduleCountdown(fr ? 'Imminent' : 'Imminent');
        fetchStatus(); // Re-fetch to detect transition
        return;
      }

      const hours = Math.floor(diff / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);

      if (hours > 24) {
        const days = Math.floor(hours / 24);
        setScheduleCountdown(`${days}j ${hours % 24}h`);
      } else if (hours > 0) {
        setScheduleCountdown(`${hours}h ${minutes.toString().padStart(2, '0')}m`);
      } else {
        const seconds = Math.floor((diff % 60_000) / 1_000);
        setScheduleCountdown(`${minutes}m ${seconds.toString().padStart(2, '0')}s`);
      }
    };

    updateScheduleCountdown();
    scheduleCountdownRef.current = setInterval(updateScheduleCountdown, 1000);
    return () => {
      if (scheduleCountdownRef.current) clearInterval(scheduleCountdownRef.current);
    };
  }, [status?.isScheduled, status?.scheduledAt, fr, fetchStatus]);

  // Active countdown timer
  useEffect(() => {
    if (!status?.isActive || !status.endTime) {
      setCountdown('');
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }

    const updateCountdown = () => {
      const end = new Date(status.endTime!).getTime();
      const now = Date.now();
      const diff = end - now;

      if (diff <= 0) {
        setCountdown(fr ? 'Bientot termine' : 'Ending soon');
        // Re-fetch to check if maintenance ended
        fetchStatus();
        return;
      }

      const hours = Math.floor(diff / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1_000);

      if (hours > 0) {
        setCountdown(`${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`);
      } else if (minutes > 0) {
        setCountdown(`${minutes}m ${seconds.toString().padStart(2, '0')}s`);
      } else {
        setCountdown(`${seconds}s`);
      }
    };

    updateCountdown();
    countdownRef.current = setInterval(updateCountdown, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [status?.isActive, status?.endTime, fr, fetchStatus]);

  // Don't render if nothing to show
  if (!status?.isActive && !status?.isScheduled) return null;

  // Scheduled maintenance banner (blue)
  if (status?.isScheduled && !scheduleDismissed) {
    const schedMsg = fr ? status.scheduledMessageFr : status.scheduledMessageEn;
    const scheduledDate = status.scheduledAt
      ? new Date(status.scheduledAt).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    return (
      <Animated.View entering={FadeInDown.duration(400)} exiting={FadeOutUp.duration(300)} style={styles.scheduledContainer}>
        <View style={styles.inner}>
          <View style={styles.scheduledIconWrap}>
            <MaterialIcons name="schedule" size={20} color="#FFF" />
          </View>
          <View style={styles.content}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{fr ? 'Maintenance prevue' : 'Scheduled Maintenance'}</Text>
              {scheduleCountdown ? (
                <View style={styles.scheduledCountdownBadge}>
                  <MaterialIcons name="timer" size={12} color="#FFF" />
                  <Text style={styles.countdownText}>{scheduleCountdown}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.message} numberOfLines={2}>
              {schedMsg || `${scheduledDate}`}
            </Text>
            {schedMsg && scheduledDate ? (
              <Text style={styles.scheduledDate}>{scheduledDate}</Text>
            ) : null}
          </View>
          <Pressable style={styles.closeBtn} onPress={() => setScheduleDismissed(true)} hitSlop={8}>
            <MaterialIcons name="close" size={16} color="rgba(255,255,255,0.6)" />
          </Pressable>
        </View>
      </Animated.View>
    );
  }

  // Active maintenance banner (orange)
  if (!status?.isActive || dismissed) return null;

  const message = fr ? status.messageFr : status.messageEn;
  const fallbackMessage = fr
    ? 'Maintenance en cours. Certains services peuvent etre temporairement indisponibles.'
    : 'Maintenance in progress. Some services may be temporarily unavailable.';

  return (
    <Animated.View entering={FadeInDown.duration(400)} exiting={FadeOutUp.duration(300)} style={styles.container}>
      <View style={styles.inner}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="construction" size={20} color="#FFF" />
        </View>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{fr ? 'Maintenance' : 'Maintenance'}</Text>
            {countdown ? (
              <View style={styles.countdownBadge}>
                <MaterialIcons name="timer" size={12} color="#FFF" />
                <Text style={styles.countdownText}>{countdown}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.message} numberOfLines={3}>
            {message || fallbackMessage}
          </Text>
        </View>
        <Pressable style={styles.closeBtn} onPress={() => setDismissed(true)} hitSlop={8}>
          <MaterialIcons name="close" size={16} color="rgba(255,255,255,0.6)" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#D97706',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 100,
  },
  scheduledContainer: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 16,
    paddingVertical: 10,
    zIndex: 100,
  },
  scheduledIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  scheduledCountdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  scheduledDate: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    marginTop: 2,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  title: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.3,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  countdownText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
    fontVariant: ['tabular-nums'],
  },
  message: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 17,
    fontWeight: '500',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
});
