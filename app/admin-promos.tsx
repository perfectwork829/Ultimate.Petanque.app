import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Modal,
  Switch,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';

import * as Haptics from '@/services/haptics';
import { getSupabaseClient } from '@/template';
import { useAuth, useAlert } from '@/template';
import { useAppUI } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import theme from '@/constants/theme';
import AdminQuickNav from '@/components/feature/AdminQuickNav';

interface PromoCode {
  id: string;
  code: string;
  max_uses: number;
  current_uses: number;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
}

interface Redemption {
  id: string;
  user_id: string;
  promo_code_id: string;
  redeemed_at: string;
  user_email?: string;
}

export default function AdminPromosScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { isAdmin } = useAppUI();
  const { language } = useLanguage();
  const supabase = getSupabaseClient();

  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRedemptionsModal, setShowRedemptionsModal] = useState(false);
  const [selectedCodeId, setSelectedCodeId] = useState<string | null>(null);

  // Create form
  const [newCode, setNewCode] = useState('');
  const [newMaxUses, setNewMaxUses] = useState('1');
  const [newHasExpiry, setNewHasExpiry] = useState(false);
  const [newExpiryDays, setNewExpiryDays] = useState('30');
  const [creating, setCreating] = useState(false);

  // Bulk generation form
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkPrefix, setBulkPrefix] = useState('PROMO');
  const [bulkCount, setBulkCount] = useState('10');
  const [bulkMaxUses, setBulkMaxUses] = useState('1');
  const [bulkHasExpiry, setBulkHasExpiry] = useState(false);
  const [bulkExpiryDays, setBulkExpiryDays] = useState('30');
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  const fr = language === 'fr';

  // Export CSV
  const handleExportCSV = useCallback(async () => {
    if (promoCodes.length === 0) {
      showAlert(fr ? 'Aucune donnee' : 'No data', fr ? 'Aucun code promo a exporter.' : 'No promo codes to export.');
      return;
    }
    Haptics.selectionAsync();

    const headers = ['Code', fr ? 'Statut' : 'Status', fr ? 'Utilisations' : 'Uses', 'Max', fr ? 'Date creation' : 'Created', fr ? 'Expiration' : 'Expires'];
    const rows = promoCodes.map(p => {
      const isExpired = p.expires_at && new Date(p.expires_at) < new Date();
      const isFull = p.current_uses >= p.max_uses;
      let status = p.is_active ? (isExpired ? (fr ? 'Expire' : 'Expired') : isFull ? (fr ? 'Epuise' : 'Exhausted') : (fr ? 'Actif' : 'Active')) : (fr ? 'Desactive' : 'Disabled');
      const created = new Date(p.created_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US');
      const expires = p.expires_at ? new Date(p.expires_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US') : (fr ? 'Jamais' : 'Never');
      return [p.code, status, String(p.current_uses), String(p.max_uses), created, expires];
    });

    const csvContent = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');

    try {
      if (Platform.OS === 'web') {
        try {
          const blob = new Blob([csvContent], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `promo_codes_${Date.now()}.csv`;
          a.click();
          URL.revokeObjectURL(url);
        } catch {
          try {
            const ExpoClipboard = require('expo-clipboard');
            await ExpoClipboard.setStringAsync(csvContent);
            showAlert(fr ? 'Copie !' : 'Copied!', fr ? 'CSV copie dans le presse-papiers.' : 'CSV copied to clipboard.');
          } catch { /* silent */ }
        }
        return;
      }

      const FS = require('expo-file-system');
      const SharingModule = require('expo-sharing');
      const fileUri = `${FS.cacheDirectory}promo_codes_${Date.now()}.csv`;
      await FS.writeAsStringAsync(fileUri, csvContent, { encoding: FS.EncodingType.UTF8 });

      const canShare = await SharingModule.isAvailableAsync();
      if (canShare) {
        await SharingModule.shareAsync(fileUri, { mimeType: 'text/csv', dialogTitle: fr ? 'Exporter codes promo' : 'Export promo codes' });
      } else {
        showAlert(fr ? 'Erreur' : 'Error', fr ? 'Partage non disponible' : 'Sharing not available');
      }
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message || 'Export failed');
    }
  }, [promoCodes, fr, showAlert]);

  // Load promo codes
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPromoCodes(data || []);
    } catch (e: any) {
      console.log('Error loading promo codes:', e);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    if (isAdmin) loadData();
  }, [isAdmin, loadData]);

  // Load redemptions for a specific code
  const loadRedemptions = useCallback(async (codeId: string) => {
    try {
      const { data, error } = await supabase
        .from('promo_code_redemptions')
        .select('*')
        .eq('promo_code_id', codeId)
        .order('redeemed_at', { ascending: false });

      if (error) throw error;

      const redemptionsWithEmails: Redemption[] = [];
      for (const r of (data || [])) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('email')
          .eq('id', r.user_id)
          .single();
        redemptionsWithEmails.push({
          ...r,
          user_email: profile?.email || r.user_id.slice(0, 8) + '...',
        });
      }
      setRedemptions(redemptionsWithEmails);
    } catch (e: any) {
      console.log('Error loading redemptions:', e);
      setRedemptions([]);
    }
  }, [supabase]);

  // Create promo code
  const handleCreate = useCallback(async () => {
    const code = newCode.trim().toUpperCase();
    if (!code) {
      showAlert(fr ? 'Erreur' : 'Error', fr ? 'Le code est requis' : 'Code is required');
      return;
    }
    const maxUses = parseInt(newMaxUses) || 1;
    Haptics.selectionAsync();
    setCreating(true);

    try {
      const insertData: any = {
        code,
        max_uses: maxUses,
        current_uses: 0,
        is_active: true,
      };

      if (newHasExpiry) {
        const days = parseInt(newExpiryDays) || 30;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + days);
        insertData.expires_at = expiresAt.toISOString();
      }

      const { error } = await supabase.from('promo_codes').insert(insertData);

      if (error) {
        if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
          showAlert(fr ? 'Erreur' : 'Error', fr ? 'Ce code existe deja' : 'This code already exists');
        } else {
          showAlert(fr ? 'Erreur' : 'Error', error.message);
        }
        setCreating(false);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowCreateModal(false);
      setNewCode('');
      setNewMaxUses('1');
      setNewHasExpiry(false);
      setNewExpiryDays('30');
      await loadData();
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
    } finally {
      setCreating(false);
    }
  }, [newCode, newMaxUses, newHasExpiry, newExpiryDays, supabase, fr, showAlert, loadData]);

  // Generate random alphanumeric string
  const generateRandomCode = useCallback((prefix: string, length: number = 6): string => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let suffix = '';
    for (let i = 0; i < length; i++) {
      suffix += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return prefix ? `${prefix}-${suffix}` : suffix;
  }, []);

  // Bulk generate promo codes
  const handleBulkGenerate = useCallback(async () => {
    const prefix = bulkPrefix.trim().toUpperCase();
    const count = parseInt(bulkCount) || 10;
    const maxUses = parseInt(bulkMaxUses) || 1;

    if (count < 1 || count > 100) {
      showAlert(fr ? 'Erreur' : 'Error', fr ? 'La quantite doit etre entre 1 et 100' : 'Quantity must be between 1 and 100');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBulkGenerating(true);
    setBulkProgress({ current: 0, total: count });

    try {
      let expiresAt: string | null = null;
      if (bulkHasExpiry) {
        const days = parseInt(bulkExpiryDays) || 30;
        const date = new Date();
        date.setDate(date.getDate() + days);
        expiresAt = date.toISOString();
      }

      const existingCodes = new Set(promoCodes.map(p => p.code));
      const codes: string[] = [];
      let attempts = 0;
      while (codes.length < count && attempts < count * 10) {
        const code = generateRandomCode(prefix);
        if (!existingCodes.has(code) && !codes.includes(code)) {
          codes.push(code);
        }
        attempts++;
      }

      if (codes.length < count) {
        showAlert(fr ? 'Erreur' : 'Error', fr ? 'Impossible de generer assez de codes uniques' : 'Could not generate enough unique codes');
        setBulkGenerating(false);
        return;
      }

      const batchSize = 20;
      let inserted = 0;
      for (let i = 0; i < codes.length; i += batchSize) {
        const batch = codes.slice(i, i + batchSize).map(code => ({
          code,
          max_uses: maxUses,
          current_uses: 0,
          is_active: true,
          expires_at: expiresAt,
        }));

        const { error } = await supabase.from('promo_codes').insert(batch);
        if (error) {
          showAlert(fr ? 'Erreur' : 'Error', `${fr ? 'Erreur lot' : 'Batch error'} ${i + 1}: ${error.message}`);
          break;
        }
        inserted += batch.length;
        setBulkProgress({ current: inserted, total: count });
      }

      if (inserted > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert(
          fr ? 'Succes' : 'Success',
          fr ? `${inserted} codes promo generes avec le prefixe "${prefix}"` : `${inserted} promo codes generated with prefix "${prefix}"`
        );
        setShowBulkModal(false);
        setBulkPrefix('PROMO');
        setBulkCount('10');
        setBulkMaxUses('1');
        setBulkHasExpiry(false);
        setBulkExpiryDays('30');
        await loadData();
      }
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
    } finally {
      setBulkGenerating(false);
      setBulkProgress({ current: 0, total: 0 });
    }
  }, [bulkPrefix, bulkCount, bulkMaxUses, bulkHasExpiry, bulkExpiryDays, supabase, fr, showAlert, loadData, promoCodes, generateRandomCode]);

  // Toggle active/inactive
  const handleToggleActive = useCallback(async (promo: PromoCode) => {
    Haptics.selectionAsync();
    const newActive = !promo.is_active;
    setPromoCodes(prev => prev.map(p => p.id === promo.id ? { ...p, is_active: newActive } : p));

    try {
      const { error } = await supabase
        .from('promo_codes')
        .update({ is_active: newActive, updated_at: new Date().toISOString() })
        .eq('id', promo.id);

      if (error) throw error;
    } catch (e: any) {
      setPromoCodes(prev => prev.map(p => p.id === promo.id ? { ...p, is_active: promo.is_active } : p));
      showAlert(fr ? 'Erreur' : 'Error', e.message);
    }
  }, [supabase, fr, showAlert]);

  // View redemptions
  const handleViewRedemptions = useCallback((codeId: string) => {
    Haptics.selectionAsync();
    setSelectedCodeId(codeId);
    setShowRedemptionsModal(true);
    loadRedemptions(codeId);
  }, [loadRedemptions]);

  // Not admin guard
  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{fr ? 'Codes promo' : 'Promo Codes'}</Text>
        </View>
        <View style={styles.emptyContainer}>
          <MaterialIcons name="lock" size={56} color={theme.textMuted} />
          <Text style={styles.emptyTitle}>{fr ? 'Acces refuse' : 'Access Denied'}</Text>
          <Text style={styles.emptyDesc}>{fr ? 'Cette page est reservee aux administrateurs.' : 'This page is restricted to administrators.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Stats summary
  const totalCodes = promoCodes.length;
  const activeCodes = promoCodes.filter(p => p.is_active).length;
  const totalRedemptions = promoCodes.reduce((sum, p) => sum + p.current_uses, 0);
  const expiredCodes = promoCodes.filter(p => p.expires_at && new Date(p.expires_at) < new Date()).length;

  const selectedCode = promoCodes.find(p => p.id === selectedCodeId);

  const renderPromoItem = ({ item: promo }: { item: PromoCode }) => {
    const isExpired = promo.expires_at && new Date(promo.expires_at) < new Date();
    const usagePercent = promo.max_uses > 0 ? Math.round((promo.current_uses / promo.max_uses) * 100) : 0;
    const isFull = promo.current_uses >= promo.max_uses;

    return (
      <View style={styles.promoCard}>
        <View style={styles.promoTopRow}>
          <View style={styles.promoCodeBadge}>
            <Text style={styles.promoCodeText}>{promo.code}</Text>
          </View>
          <Switch
            value={promo.is_active}
            onValueChange={() => handleToggleActive(promo)}
            trackColor={{ false: theme.border, true: theme.success + '60' }}
            thumbColor={promo.is_active ? theme.success : theme.textMuted}
          />
        </View>

        {/* Status badges */}
        <View style={styles.promoStatusRow}>
          {promo.is_active && !isExpired && !isFull ? (
            <View style={[styles.statusBadge, { backgroundColor: theme.success + '15' }]}>
              <View style={[styles.statusDot, { backgroundColor: theme.success }]} />
              <Text style={[styles.statusText, { color: theme.success }]}>{fr ? 'Actif' : 'Active'}</Text>
            </View>
          ) : null}
          {!promo.is_active ? (
            <View style={[styles.statusBadge, { backgroundColor: theme.textMuted + '15' }]}>
              <View style={[styles.statusDot, { backgroundColor: theme.textMuted }]} />
              <Text style={[styles.statusText, { color: theme.textMuted }]}>{fr ? 'Desactive' : 'Disabled'}</Text>
            </View>
          ) : null}
          {isExpired ? (
            <View style={[styles.statusBadge, { backgroundColor: theme.error + '15' }]}>
              <MaterialIcons name="timer-off" size={12} color={theme.error} />
              <Text style={[styles.statusText, { color: theme.error }]}>{fr ? 'Expire' : 'Expired'}</Text>
            </View>
          ) : null}
          {isFull ? (
            <View style={[styles.statusBadge, { backgroundColor: theme.warning + '15' }]}>
              <MaterialIcons name="block" size={12} color={theme.warning} />
              <Text style={[styles.statusText, { color: theme.warning }]}>{fr ? 'Epuise' : 'Exhausted'}</Text>
            </View>
          ) : null}
        </View>

        {/* Usage bar */}
        <View style={styles.usageSection}>
          <View style={styles.usageLabels}>
            <Text style={styles.usageLabel}>{fr ? 'Utilisations' : 'Uses'}</Text>
            <Text style={styles.usageCount}>{promo.current_uses} / {promo.max_uses}</Text>
          </View>
          <View style={styles.usageBarTrack}>
            <View style={[styles.usageBarFill, { width: `${Math.min(usagePercent, 100)}%`, backgroundColor: isFull ? theme.warning : theme.primary }]} />
          </View>
        </View>

        {/* Meta info */}
        <View style={styles.promoMetaRow}>
          <View style={styles.promoMetaItem}>
            <MaterialIcons name="event" size={14} color={theme.textMuted} />
            <Text style={styles.promoMetaText}>
              {new Date(promo.created_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
          {promo.expires_at ? (
            <View style={styles.promoMetaItem}>
              <MaterialIcons name="timer" size={14} color={isExpired ? theme.error : theme.textMuted} />
              <Text style={[styles.promoMetaText, isExpired && { color: theme.error }]}>
                {fr ? 'Exp.' : 'Exp.'} {new Date(promo.expires_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}
              </Text>
            </View>
          ) : (
            <View style={styles.promoMetaItem}>
              <MaterialIcons name="all-inclusive" size={14} color={theme.textMuted} />
              <Text style={styles.promoMetaText}>{fr ? 'Sans expiration' : 'No expiry'}</Text>
            </View>
          )}
        </View>

        {/* View redemptions button */}
        {promo.current_uses > 0 ? (
          <Pressable style={styles.viewRedemptionsBtn} onPress={() => handleViewRedemptions(promo.id)}>
            <MaterialIcons name="people" size={16} color={theme.primary} />
            <Text style={styles.viewRedemptionsBtnText}>
              {fr ? `Voir les ${promo.current_uses} utilisation(s)` : `View ${promo.current_uses} redemption(s)`}
            </Text>
            <MaterialIcons name="chevron-right" size={16} color={theme.primary} />
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{fr ? 'Codes promo' : 'Promo Codes'}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable style={styles.actionBtn} onPress={handleExportCSV}>
            <MaterialIcons name="file-download" size={20} color={theme.primary} />
          </Pressable>
          <Pressable style={styles.actionBtn} onPress={() => { Haptics.selectionAsync(); setShowBulkModal(true); }}>
            <MaterialIcons name="dynamic-feed" size={20} color={theme.primary} />
          </Pressable>
          <Pressable style={styles.addBtn} onPress={() => { Haptics.selectionAsync(); setShowCreateModal(true); }}>
            <MaterialIcons name="add" size={24} color="#FFF" />
          </Pressable>
        </View>
      </View>

      <AdminQuickNav currentRoute="/admin-promos" />

      {loading ? (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <FlatList
          data={promoCodes}
          keyExtractor={item => item.id}
          renderItem={renderPromoItem}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { backgroundColor: theme.primary + '12' }]}>
                <MaterialIcons name="confirmation-number" size={22} color={theme.primary} />
                <Text style={[styles.statValue, { color: theme.primary }]}>{totalCodes}</Text>
                <Text style={styles.statLabel}>Total</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.success + '12' }]}>
                <MaterialIcons name="check-circle" size={22} color={theme.success} />
                <Text style={[styles.statValue, { color: theme.success }]}>{activeCodes}</Text>
                <Text style={styles.statLabel}>{fr ? 'Actifs' : 'Active'}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.accent + '12' }]}>
                <MaterialIcons name="redeem" size={22} color={theme.accent} />
                <Text style={[styles.statValue, { color: theme.accent }]}>{totalRedemptions}</Text>
                <Text style={styles.statLabel}>{fr ? 'Utilises' : 'Redeemed'}</Text>
              </View>
              <View style={[styles.statCard, { backgroundColor: theme.error + '12' }]}>
                <MaterialIcons name="timer-off" size={22} color={theme.error} />
                <Text style={[styles.statValue, { color: theme.error }]}>{expiredCodes}</Text>
                <Text style={styles.statLabel}>{fr ? 'Expires' : 'Expired'}</Text>
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyListContainer}>
              <MaterialIcons name="confirmation-number" size={48} color={theme.textMuted} />
              <Text style={styles.emptyTitle}>{fr ? 'Aucun code promo' : 'No promo codes'}</Text>
              <Text style={styles.emptyDesc}>{fr ? 'Creez votre premier code promo.' : 'Create your first promo code.'}</Text>
            </View>
          }
        />
      )}

      {/* Create Promo Code Modal */}
      <Modal visible={showCreateModal} animationType="slide" transparent onRequestClose={() => setShowCreateModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalHeaderIcon, { backgroundColor: theme.carreauColor + '15' }]}>
                <MaterialIcons name="add-circle" size={22} color={theme.carreauColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{fr ? 'Nouveau code promo' : 'New Promo Code'}</Text>
                <Text style={styles.modalSubtitle}>{fr ? 'Creez un code pour debloquer le premium' : 'Create a code to unlock premium'}</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setShowCreateModal(false)}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{fr ? 'Code' : 'Code'} *</Text>
                <TextInput style={styles.formInput} value={newCode} onChangeText={setNewCode} placeholder="Ex: PREMIUM2026" placeholderTextColor={theme.textMuted} autoCapitalize="characters" autoCorrect={false} />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{fr ? 'Utilisations max' : 'Max uses'}</Text>
                <TextInput style={styles.formInput} value={newMaxUses} onChangeText={setNewMaxUses} placeholder="1" placeholderTextColor={theme.textMuted} keyboardType="number-pad" />
              </View>

              <View style={styles.formToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>{fr ? "Date d'expiration" : 'Expiry date'}</Text>
                  <Text style={styles.formHint}>{fr ? 'Le code expirera apres ce delai' : 'Code expires after this period'}</Text>
                </View>
                <Switch value={newHasExpiry} onValueChange={setNewHasExpiry} trackColor={{ false: theme.border, true: theme.primary + '60' }} thumbColor={newHasExpiry ? theme.primary : theme.textMuted} />
              </View>

              {newHasExpiry ? (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>{fr ? 'Expire dans (jours)' : 'Expires in (days)'}</Text>
                  <TextInput style={styles.formInput} value={newExpiryDays} onChangeText={setNewExpiryDays} placeholder="30" placeholderTextColor={theme.textMuted} keyboardType="number-pad" />
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => setShowCreateModal(false)}>
                <Text style={styles.modalCancelText}>{fr ? 'Annuler' : 'Cancel'}</Text>
              </Pressable>
              <Pressable style={[styles.modalCreateBtn, (!newCode.trim() || creating) && { opacity: 0.5 }]} onPress={handleCreate} disabled={!newCode.trim() || creating}>
                {creating ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <><MaterialIcons name="add" size={18} color="#FFF" /><Text style={styles.modalCreateText}>{fr ? 'Creer' : 'Create'}</Text></>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bulk Generate Modal */}
      <Modal visible={showBulkModal} animationType="slide" transparent onRequestClose={() => { if (!bulkGenerating) setShowBulkModal(false); }}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalHeaderIcon, { backgroundColor: theme.success + '15' }]}>
                <MaterialIcons name="dynamic-feed" size={22} color={theme.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{fr ? 'Generation en lot' : 'Bulk Generate'}</Text>
                <Text style={styles.modalSubtitle}>{fr ? 'Creer plusieurs codes en une action' : 'Create multiple codes at once'}</Text>
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => { if (!bulkGenerating) setShowBulkModal(false); }}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              <View style={styles.bulkPreview}>
                <MaterialIcons name="visibility" size={16} color={theme.primary} />
                <Text style={styles.bulkPreviewLabel}>{fr ? 'Apercu :' : 'Preview:'}</Text>
                <Text style={styles.bulkPreviewCode}>
                  {bulkPrefix.trim().toUpperCase() ? `${bulkPrefix.trim().toUpperCase()}-A3X7K9` : 'A3X7K9'}
                </Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{fr ? 'Prefixe' : 'Prefix'}</Text>
                <TextInput style={styles.formInput} value={bulkPrefix} onChangeText={setBulkPrefix} placeholder="PROMO" placeholderTextColor={theme.textMuted} autoCapitalize="characters" autoCorrect={false} editable={!bulkGenerating} />
                <Text style={styles.formHint}>{fr ? 'Les codes seront PREFIXE-XXXXXX' : 'Codes will be PREFIX-XXXXXX'}</Text>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{fr ? 'Quantite' : 'Quantity'} *</Text>
                <View style={styles.bulkQuantityRow}>
                  {['5', '10', '25', '50'].map(q => (
                    <Pressable key={q} style={[styles.bulkQuantityChip, bulkCount === q && styles.bulkQuantityChipActive]} onPress={() => { if (!bulkGenerating) setBulkCount(q); }}>
                      <Text style={[styles.bulkQuantityChipText, bulkCount === q && styles.bulkQuantityChipTextActive]}>{q}</Text>
                    </Pressable>
                  ))}
                  <TextInput style={styles.bulkQuantityInput} value={bulkCount} onChangeText={setBulkCount} keyboardType="number-pad" placeholder="10" placeholderTextColor={theme.textMuted} editable={!bulkGenerating} />
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>{fr ? 'Utilisations max / code' : 'Max uses / code'}</Text>
                <TextInput style={styles.formInput} value={bulkMaxUses} onChangeText={setBulkMaxUses} placeholder="1" placeholderTextColor={theme.textMuted} keyboardType="number-pad" editable={!bulkGenerating} />
              </View>

              <View style={styles.formToggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>{fr ? "Date d'expiration" : 'Expiry date'}</Text>
                  <Text style={styles.formHint}>{fr ? 'Tous les codes expireront apres ce delai' : 'All codes will expire after this period'}</Text>
                </View>
                <Switch value={bulkHasExpiry} onValueChange={(v) => { if (!bulkGenerating) setBulkHasExpiry(v); }} trackColor={{ false: theme.border, true: theme.primary + '60' }} thumbColor={bulkHasExpiry ? theme.primary : theme.textMuted} />
              </View>

              {bulkHasExpiry ? (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>{fr ? 'Expire dans (jours)' : 'Expires in (days)'}</Text>
                  <TextInput style={styles.formInput} value={bulkExpiryDays} onChangeText={setBulkExpiryDays} placeholder="30" placeholderTextColor={theme.textMuted} keyboardType="number-pad" editable={!bulkGenerating} />
                </View>
              ) : null}

              <View style={styles.bulkSummary}>
                <MaterialIcons name="info-outline" size={16} color={theme.primary} />
                <Text style={styles.bulkSummaryText}>
                  {fr
                    ? `${parseInt(bulkCount) || 0} codes \u00d7 ${parseInt(bulkMaxUses) || 1} utilisation(s) = ${(parseInt(bulkCount) || 0) * (parseInt(bulkMaxUses) || 1)} activations premium max`
                    : `${parseInt(bulkCount) || 0} codes \u00d7 ${parseInt(bulkMaxUses) || 1} use(s) = ${(parseInt(bulkCount) || 0) * (parseInt(bulkMaxUses) || 1)} max premium activations`}
                </Text>
              </View>
            </ScrollView>

            {bulkGenerating ? (
              <View style={styles.bulkProgressContainer}>
                <View style={styles.bulkProgressTrack}>
                  <View style={[styles.bulkProgressFill, { width: `${bulkProgress.total > 0 ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%` }]} />
                </View>
                <Text style={styles.bulkProgressText}>
                  {bulkProgress.current}/{bulkProgress.total} {fr ? 'codes crees...' : 'codes created...'}
                </Text>
              </View>
            ) : null}

            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancelBtn} onPress={() => { if (!bulkGenerating) setShowBulkModal(false); }} disabled={bulkGenerating}>
                <Text style={[styles.modalCancelText, bulkGenerating && { opacity: 0.4 }]}>{fr ? 'Annuler' : 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={[styles.modalCreateBtn, { backgroundColor: theme.success }, (!(parseInt(bulkCount) > 0) || bulkGenerating) && { opacity: 0.5 }]}
                onPress={handleBulkGenerate}
                disabled={!(parseInt(bulkCount) > 0) || bulkGenerating}
              >
                {bulkGenerating ? <ActivityIndicator size="small" color="#FFF" /> : (
                  <><MaterialIcons name="auto-awesome" size={18} color="#FFF" /><Text style={styles.modalCreateText}>{fr ? `Generer ${parseInt(bulkCount) || 0} codes` : `Generate ${parseInt(bulkCount) || 0} codes`}</Text></>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Redemptions Modal */}
      <Modal visible={showRedemptionsModal} animationType="slide" transparent onRequestClose={() => setShowRedemptionsModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalHeaderIcon, { backgroundColor: theme.accent + '15' }]}>
                <MaterialIcons name="people" size={22} color={theme.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>{fr ? 'Utilisations' : 'Redemptions'}</Text>
                {selectedCode ? (
                  <Text style={styles.modalSubtitle}>{selectedCode.code} {"•"} {selectedCode.current_uses} / {selectedCode.max_uses}</Text>
                ) : null}
              </View>
              <Pressable style={styles.modalCloseBtn} onPress={() => setShowRedemptionsModal(false)}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ paddingHorizontal: 20 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
              {redemptions.length > 0 ? (
                redemptions.map((r, idx) => (
                  <View key={r.id} style={[styles.redemptionItem, idx === redemptions.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={styles.redemptionIcon}>
                      <MaterialIcons name="person" size={18} color={theme.accent} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.redemptionEmail}>{r.user_email}</Text>
                      <Text style={styles.redemptionDate}>
                        {new Date(r.redeemed_at).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                  <ActivityIndicator size="large" color={theme.primary} />
                  <Text style={{ fontSize: 13, color: theme.textSecondary, marginTop: 12 }}>
                    {fr ? 'Chargement...' : 'Loading...'}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  addBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },

  listContent: { paddingHorizontal: 16, paddingTop: 16 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, borderRadius: theme.borderRadius.lg, padding: 14,
    alignItems: 'center', gap: 6,
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { fontSize: 10, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Promo card
  promoCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl,
    padding: 18, marginBottom: 12, ...theme.shadows.card,
  },
  promoTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  promoCodeBadge: {
    backgroundColor: theme.primary + '12', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: theme.borderRadius.md, borderWidth: 1, borderColor: theme.primary + '25',
  },
  promoCodeText: { fontSize: 18, fontWeight: '800', color: theme.primary, letterSpacing: 2 },

  promoStatusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },

  usageSection: { marginBottom: 12 },
  usageLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  usageLabel: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  usageCount: { fontSize: 13, fontWeight: '700', color: theme.textPrimary },
  usageBarTrack: { height: 8, backgroundColor: theme.backgroundSecondary, borderRadius: 4, overflow: 'hidden' },
  usageBarFill: { height: '100%', borderRadius: 4 },

  promoMetaRow: { flexDirection: 'row', gap: 16, marginBottom: 10 },
  promoMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  promoMetaText: { fontSize: 12, color: theme.textMuted },

  viewRedemptionsBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: theme.primary + '10', paddingVertical: 10, borderRadius: theme.borderRadius.md,
    marginTop: 4,
  },
  viewRedemptionsBtnText: { fontSize: 13, fontWeight: '600', color: theme.primary },

  // Empty
  emptyContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyListContainer: { alignItems: 'center', paddingVertical: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginTop: 16 },
  emptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 6 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '80%', paddingBottom: 0,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  modalHeaderIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  modalSubtitle: { fontSize: 13, color: theme.textSecondary, marginTop: 2 },
  modalCloseBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: theme.backgroundSecondary,
    alignItems: 'center', justifyContent: 'center',
  },

  formGroup: { marginTop: 16 },
  formLabel: { fontSize: 13, fontWeight: '600', color: theme.textSecondary, marginBottom: 8 },
  formHint: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  formInput: {
    backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md,
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, fontWeight: '600',
    color: theme.textPrimary, borderWidth: 1, borderColor: theme.border,
  },
  formToggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20,
    backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 14,
  },

  modalActions: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: theme.border,
  },
  modalCancelBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14,
    borderRadius: theme.borderRadius.md, backgroundColor: theme.backgroundSecondary,
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  modalCreateBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: theme.borderRadius.md, backgroundColor: theme.primary,
  },
  modalCreateText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // Redemptions
  redemptionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  redemptionIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.accent + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  redemptionEmail: { fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  redemptionDate: { fontSize: 12, color: theme.textMuted, marginTop: 2 },

  // Bulk generate
  bulkPreview: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16,
    backgroundColor: theme.primary + '08', borderRadius: theme.borderRadius.md,
    padding: 12, borderWidth: 1, borderColor: theme.primary + '20',
  },
  bulkPreviewLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  bulkPreviewCode: { fontSize: 16, fontWeight: '800', color: theme.primary, letterSpacing: 1.5 },
  bulkQuantityRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  bulkQuantityChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: theme.borderRadius.md,
    backgroundColor: theme.backgroundSecondary, borderWidth: 1, borderColor: theme.border,
  },
  bulkQuantityChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  bulkQuantityChipText: { fontSize: 14, fontWeight: '700', color: theme.textSecondary },
  bulkQuantityChipTextActive: { color: '#FFF' },
  bulkQuantityInput: {
    flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md,
    paddingVertical: 10, paddingHorizontal: 14, fontSize: 16, fontWeight: '700',
    color: theme.textPrimary, borderWidth: 1, borderColor: theme.border, textAlign: 'center',
  },
  bulkSummary: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 16,
    backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md, padding: 12,
  },
  bulkSummaryText: { flex: 1, fontSize: 12, color: theme.textSecondary, lineHeight: 18 },
  bulkProgressContainer: { paddingHorizontal: 20, paddingBottom: 8 },
  bulkProgressTrack: { height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  bulkProgressFill: { height: '100%', backgroundColor: theme.success, borderRadius: 3 },
  bulkProgressText: { fontSize: 12, fontWeight: '600', color: theme.success, textAlign: 'center' },
});
