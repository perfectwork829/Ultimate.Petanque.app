/**
 * Admin Role Guard with Permission-Based Access Control
 * 
 * Wraps admin pages to:
 * 1. Redirect non-admin users automatically
 * 2. Check granular permissions if requiredPermission is specified
 * Shows access denied screen if user lacks the required permission.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { router } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAppUI } from '@/contexts/AppContext';
import { useAuth, useAlert } from '@/template';
import { getUserPermissions, PermissionKey, ADMIN_PERMISSIONS } from '@/services/adminPermissionService';
import theme from '@/constants/theme';

interface AdminGuardProps {
  children: React.ReactNode;
  language?: string;
  /** If set, checks for this specific permission (or full_access). */
  requiredPermission?: PermissionKey;
}

export default function AdminGuard({ children, language = 'fr', requiredPermission }: AdminGuardProps) {
  const { isAdmin } = useAppUI();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const fr = language === 'fr';

  const [checked, setChecked] = useState(false);
  const [permissionGranted, setPermissionGranted] = useState(true);
  const [checkedPermission, setCheckedPermission] = useState(false);

  // Step 1: Check admin role
  useEffect(() => {
    const timer = setTimeout(() => {
      setChecked(true);
      if (!isAdmin) {
        showAlert(
          fr ? 'Acces refuse' : 'Access denied',
          fr ? 'Vous devez etre administrateur pour acceder a cette page.' : 'You must be an administrator to access this page.'
        );
        router.replace('/profile');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [isAdmin]);

  // Step 2: Check granular permission (only if admin and requiredPermission is set)
  useEffect(() => {
    if (!checked || !isAdmin || !user?.id) return;
    if (!requiredPermission) {
      setCheckedPermission(true);
      setPermissionGranted(true);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const { permissions } = await getUserPermissions(user.id);
        if (cancelled) return;

        // No permissions set = standard admin with full access (legacy behavior)
        if (permissions.length === 0) {
          setPermissionGranted(true);
        } else if (permissions.includes('full_access')) {
          setPermissionGranted(true);
        } else if (permissions.includes(requiredPermission)) {
          setPermissionGranted(true);
        } else if (permissions.includes('read_only') && requiredPermission !== 'read_only') {
          // read_only grants view access to all pages
          setPermissionGranted(true);
        } else {
          setPermissionGranted(false);
        }
      } catch {
        // On error, allow access (fail open for admins)
        setPermissionGranted(true);
      }
      setCheckedPermission(true);
    })();

    return () => { cancelled = true; };
  }, [checked, isAdmin, user?.id, requiredPermission]);

  // Loading state
  if (!checked || !isAdmin) {
    return (
      <View style={s.container}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={s.text}>{fr ? 'Verification...' : 'Verifying...'}</Text>
      </View>
    );
  }

  // Permission check in progress
  if (requiredPermission && !checkedPermission) {
    return (
      <View style={s.container}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={s.text}>{fr ? 'Verification des permissions...' : 'Checking permissions...'}</Text>
      </View>
    );
  }

  // Permission denied screen
  if (requiredPermission && !permissionGranted) {
    const permConfig = ADMIN_PERMISSIONS[requiredPermission];
    return (
      <View style={s.deniedContainer}>
        <View style={s.deniedIconWrap}>
          <MaterialIcons name="lock" size={48} color="#DC2626" />
        </View>
        <Text style={s.deniedTitle}>
          {fr ? 'Acces restreint' : 'Restricted Access'}
        </Text>
        <Text style={s.deniedMessage}>
          {fr
            ? `Vous n'avez pas la permission "${permConfig?.labelFr || requiredPermission}" pour acceder a cette section.`
            : `You do not have the "${permConfig?.labelEn || requiredPermission}" permission to access this section.`}
        </Text>
        <View style={s.deniedPermBadge}>
          <MaterialIcons name={(permConfig?.icon || 'lock') as any} size={16} color={permConfig?.color || '#DC2626'} />
          <Text style={[s.deniedPermText, { color: permConfig?.color || '#DC2626' }]}>
            {fr ? permConfig?.labelFr : permConfig?.labelEn}
          </Text>
        </View>
        <Text style={s.deniedHint}>
          {fr
            ? 'Contactez un administrateur avec acces complet pour obtenir cette permission.'
            : 'Contact a full-access administrator to obtain this permission.'}
        </Text>
        <Pressable
          style={s.deniedBackBtn}
          onPress={() => router.replace('/admin-dashboard' as any)}
        >
          <MaterialIcons name="arrow-back" size={18} color="#FFF" />
          <Text style={s.deniedBackText}>
            {fr ? 'Retour au tableau de bord' : 'Back to dashboard'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return <>{children}</>;
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  deniedContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  deniedIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 28,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#FECACA',
  },
  deniedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  deniedMessage: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 320,
  },
  deniedPermBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginVertical: 4,
  },
  deniedPermText: {
    fontSize: 14,
    fontWeight: '700',
  },
  deniedHint: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
    marginTop: 4,
  },
  deniedBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 12,
  },
  deniedBackText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
});
