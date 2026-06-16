import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '@/constants/theme';

interface ToastAction {
  label: string;
  onPress: () => void;
}

interface ToastConfig {
  message: string;
  icon?: string;
  iconColor?: string;
  action?: ToastAction;
  duration?: number;
}

interface ToastContextType {
  showToast: (config: ToastConfig) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<(ToastConfig & { key: number }) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(0);

  const showToast = useCallback((config: ToastConfig) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    keyRef.current += 1;
    setToast({ ...config, key: keyRef.current });
    timerRef.current = setTimeout(() => {
      setToast(null);
    }, config.duration || 5000);
  }, []);

  const handleDismiss = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setToast(null);
  }, []);

  const handleAction = useCallback(() => {
    if (toast?.action) {
      toast.action.onPress();
    }
    handleDismiss();
  }, [toast, handleDismiss]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const tabBarHeight = Platform.select({ ios: insets.bottom + 68, android: insets.bottom + 68, default: 78 });

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast !== null ? (
        <Animated.View
          key={toast.key}
          entering={SlideInDown.springify().damping(18).stiffness(140)}
          exiting={SlideOutDown.duration(200)}
          style={[styles.toastContainer, { bottom: tabBarHeight + 12 }]}
          pointerEvents="box-none"
        >
          <Pressable style={styles.toast} onPress={handleDismiss}>
            {toast.icon ? (
              <View style={[styles.toastIconWrap, { backgroundColor: (toast.iconColor || theme.success) + '25' }]}>
                <MaterialIcons name={toast.icon as any} size={18} color={toast.iconColor || theme.success} />
              </View>
            ) : null}
            <Text style={styles.toastMessage} numberOfLines={2}>{toast.message}</Text>
            {toast.action ? (
              <Pressable style={styles.toastActionBtn} onPress={handleAction} hitSlop={8}>
                <Text style={styles.toastActionText}>{toast.action.label}</Text>
                <MaterialIcons name="arrow-forward" size={14} color={theme.primary} />
              </Pressable>
            ) : null}
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    width: '100%',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
    }),
  },
  toastIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastMessage: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#F1F5F9',
    lineHeight: 19,
  },
  toastActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
  },
  toastActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#93C5FD',
  },
});
