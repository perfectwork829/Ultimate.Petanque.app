// ============================================
// Tracking Consent Modal - ATT Pre-Permission Screen
// Elegant pre-prompt shown before the native iOS ATT dialog
// ============================================
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '@/hooks/useLanguage';
import theme from '@/constants/theme';
import {
  requestTrackingPermission,
  markConsentShown,
} from '@/services/trackingService';

interface TrackingConsentModalProps {
  visible: boolean;
  onComplete: (authorized: boolean) => void;
}

export default function TrackingConsentModal({ visible, onComplete }: TrackingConsentModalProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);

  const handleAllow = async () => {
    setLoading(true);
    await markConsentShown();
    const status = await requestTrackingPermission();
    setLoading(false);
    onComplete(status === 'authorized');
  };

  const handleDecline = async () => {
    await markConsentShown();
    onComplete(false);
  };

  // Only relevant on iOS
  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          {/* Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <MaterialIcons name="ads-click" size={36} color={theme.primary} />
            </View>
          </View>

          {/* Title */}
          <Text style={styles.title}>
            {t('tracking', 'title')}
          </Text>

          {/* Description */}
          <Text style={styles.description}>
            {t('tracking', 'description')}
          </Text>

          {/* Benefits list */}
          <View style={styles.benefitsList}>
            <BenefitItem
              icon="shield"
              text={t('tracking', 'benefit1')}
            />
            <BenefitItem
              icon="tune"
              text={t('tracking', 'benefit2')}
            />
            <BenefitItem
              icon="volunteer-activism"
              text={t('tracking', 'benefit3')}
            />
          </View>

          {/* Privacy note */}
          <View style={styles.privacyNote}>
            <MaterialIcons name="lock" size={16} color={theme.textSecondary} />
            <Text style={styles.privacyText}>
              {t('tracking', 'privacyNote')}
            </Text>
          </View>

          {/* Buttons */}
          <View style={styles.buttonsContainer}>
            <Pressable
              style={({ pressed }) => [
                styles.allowButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleAllow}
              disabled={loading}
            >
              <Text style={styles.allowButtonText}>
                {loading ? t('common', 'loading') : t('tracking', 'allowButton')}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.declineButton,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleDecline}
              disabled={loading}
            >
              <Text style={styles.declineButtonText}>
                {t('tracking', 'declineButton')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function BenefitItem({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.benefitItem}>
      <View style={styles.benefitIconContainer}>
        <MaterialIcons name={icon as any} size={20} color={theme.primary} />
      </View>
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  container: {
    backgroundColor: theme.background,
    borderRadius: 24,
    paddingTop: 32,
    paddingHorizontal: 24,
    width: '100%',
    maxWidth: 380,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${theme.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.text,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  benefitsList: {
    marginBottom: 20,
    gap: 14,
  },
  benefitItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  benefitIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${theme.primary}10`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: theme.text,
    fontWeight: '500',
  },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 24,
  },
  privacyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: theme.textSecondary,
  },
  buttonsContainer: {
    gap: 10,
  },
  allowButton: {
    backgroundColor: theme.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  allowButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  declineButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  declineButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
});
