import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';

interface SharedBadgeProps {
  permission: 'read' | 'write';
  size?: 'small' | 'medium';
}

export default function SharedBadge({ permission, size = 'medium' }: SharedBadgeProps) {
  const { t } = useLanguage();
  const isWrite = permission === 'write';
  const color = isWrite ? theme.accent : theme.primary;
  const bgColor = color + '15';
  const borderColor = color + '30';
  const isSmall = size === 'small';

  return (
    <View style={[
      styles.badge,
      { backgroundColor: bgColor, borderColor },
      isSmall && styles.badgeSmall,
    ]}>
      <MaterialIcons
        name={isWrite ? 'edit' : 'visibility'}
        size={isSmall ? 10 : 12}
        color={color}
      />
      <Text
        numberOfLines={1}
        style={[
          styles.badgeText,
          { color },
          isSmall && styles.badgeTextSmall,
        ]}
      >
        {isWrite ? t('sharedBadge', 'write') : t('sharedBadge', 'readOnly')}
      </Text>
    </View>
  );
}

/** Tiny overlay badge for avatars in lists */
export function SharedOverlayBadge({ permission }: { permission: 'read' | 'write' }) {
  const isWrite = permission === 'write';
  const color = isWrite ? theme.accent : theme.primary;

  return (
    <View style={[styles.overlayBadge, { backgroundColor: color }]}>
      <MaterialIcons
        name={isWrite ? 'edit' : 'visibility'}
        size={9}
        color="#FFF"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: '100%',
    overflow: 'hidden',
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 3,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    flexShrink: 1,
  },
  badgeTextSmall: {
    fontSize: 9,
    fontWeight: '700',
  },
  overlayBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
});
