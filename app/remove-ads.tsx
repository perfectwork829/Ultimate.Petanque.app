import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { getSupabaseClient } from '@/template';
import { useAuth, useAlert } from '@/template';
import { useAppUI, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { isIapAvailable, initIap, getRemoveAdsProduct, purchaseRemoveAds, restorePurchases, endIapConnection } from '@/services/iapService';
import theme from '@/constants/theme';

export default function RemoveAdsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { isPremium } = useAppUI();
  const { setIsPremium } = useAppActions();
  const { language } = useLanguage();
  const supabase = getSupabaseClient();

  const [promoCode, setPromoCode] = useState('');
  const [validating, setValidating] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [iapReady, setIapReady] = useState(false);
  const [productPrice, setProductPrice] = useState('8,99 $CAD');

  // Init IAP on mount
  useEffect(() => {
    const setup = async () => {
      if (!isIapAvailable()) return;
      const ok = await initIap();
      if (ok) {
        setIapReady(true);
        const product = await getRemoveAdsProduct();
        if (product) {
          setProductPrice(product.localizedPrice);
        }
      }
    };
    setup();
    return () => { endIapConnection(); };
  }, []);

  // Handle promo code validation
  const handleValidatePromo = useCallback(async () => {
    const code = promoCode.trim();
    if (!code) return;
    Haptics.selectionAsync();
    setValidating(true);

    try {
      const { data, error } = await supabase.functions.invoke('validate-promo-code', {
        body: { code },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const text = await error.context?.text();
            const parsed = text ? JSON.parse(text) : null;
            const errorCode = parsed?.error || '';
            if (errorCode === 'already_premium') msg = language === 'fr' ? 'Vous etes deja premium' : 'You are already premium';
            else if (errorCode === 'invalid_code') msg = language === 'fr' ? 'Code invalide' : 'Invalid code';
            else if (errorCode === 'expired_code') msg = language === 'fr' ? 'Code expire' : 'Expired code';
            else if (errorCode === 'max_uses_reached') msg = language === 'fr' ? 'Code deja utilise au maximum' : 'Code already fully used';
            else if (errorCode === 'already_redeemed') msg = language === 'fr' ? 'Vous avez deja utilise ce code' : 'You already used this code';
            else msg = text || msg;
          } catch { /* keep default */ }
        }
        showAlert(language === 'fr' ? 'Erreur' : 'Error', msg);
        setValidating(false);
        return;
      }

      // Success
      setIsPremium(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(
        language === 'fr' ? 'Felicitations !' : 'Congratulations!',
        language === 'fr' ? 'Les publicites ont ete supprimees de votre application.' : 'Ads have been removed from your app.'
      );
      setPromoCode('');
    } catch (e: any) {
      showAlert(language === 'fr' ? 'Erreur' : 'Error', e.message || 'Unknown error');
    } finally {
      setValidating(false);
    }
  }, [promoCode, language, supabase, showAlert, setIsPremium]);

  // Handle IAP purchase
  const handlePurchase = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPurchasing(true);

    try {
      const result = await purchaseRemoveAds();
      if (result.success) {
        setIsPremium(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert(
          language === 'fr' ? 'Felicitations !' : 'Congratulations!',
          language === 'fr' ? 'Les publicites ont ete supprimees de votre application.' : 'Ads have been removed from your app.'
        );
      } else if (result.error && result.error !== 'cancelled') {
        showAlert(language === 'fr' ? 'Erreur' : 'Error', result.error);
      }
    } catch (e: any) {
      showAlert(language === 'fr' ? 'Erreur' : 'Error', e.message || 'Purchase failed');
    } finally {
      setPurchasing(false);
    }
  }, [language, showAlert, setIsPremium]);

  // Handle restore purchases
  const handleRestore = useCallback(async () => {
    Haptics.selectionAsync();
    setRestoring(true);

    try {
      const result = await restorePurchases();
      if (result.hasPremium) {
        setIsPremium(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showAlert(
          language === 'fr' ? 'Achats restaures' : 'Purchases restored',
          language === 'fr' ? 'Votre achat premium a ete restaure.' : 'Your premium purchase has been restored.'
        );
      } else {
        showAlert(
          language === 'fr' ? 'Aucun achat' : 'No purchases',
          language === 'fr' ? 'Aucun achat precedent trouve.' : 'No previous purchases found.'
        );
      }
    } catch (e: any) {
      showAlert(language === 'fr' ? 'Erreur' : 'Error', e.message || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  }, [language, showAlert, setIsPremium]);

  // Already premium view
  if (isPremium) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>
            {language === 'fr' ? 'Supprimer les pubs' : 'Remove Ads'}
          </Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.premiumContainer}>
          <Animated.View entering={FadeIn.duration(600)} style={styles.premiumCard}>
            <View style={styles.premiumIconBg}>
              <MaterialIcons name="verified" size={56} color={theme.success} />
            </View>
            <Text style={styles.premiumTitle}>
              {language === 'fr' ? 'Vous etes Premium !' : 'You are Premium!'}
            </Text>
            <Text style={styles.premiumDesc}>
              {language === 'fr'
                ? 'Toutes les publicites ont ete supprimees de votre application. Merci pour votre soutien !'
                : 'All ads have been removed from your app. Thank you for your support!'}
            </Text>
            <View style={styles.premiumBadge}>
              <MaterialIcons name="star" size={16} color="#FFD700" />
              <Text style={styles.premiumBadgeText}>Premium</Text>
            </View>
          </Animated.View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {language === 'fr' ? 'Supprimer les pubs' : 'Remove Ads'}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.heroCard}>
          <View style={styles.heroIconBg}>
            <MaterialIcons name="block" size={40} color={theme.primary} />
          </View>
          <Text style={styles.heroTitle}>
            {language === 'fr' ? 'Profitez sans publicite' : 'Enjoy Ad-Free'}
          </Text>
          <Text style={styles.heroSubtitle}>
            {language === 'fr'
              ? 'Supprimez toutes les bannieres et interstitiels pour une experience fluide et sans interruption.'
              : 'Remove all banners and interstitials for a smooth, uninterrupted experience.'}
          </Text>
        </Animated.View>

        {/* Benefits */}
        <Animated.View entering={FadeInDown.duration(400).delay(80)} style={styles.benefitsCard}>
          {[
            { icon: 'visibility-off', color: theme.primary, text: language === 'fr' ? 'Aucune banniere publicitaire' : 'No ad banners' },
            { icon: 'skip-next', color: theme.success, text: language === 'fr' ? 'Aucun interstitiel apres les matchs' : 'No interstitials after matches' },
            { icon: 'speed', color: theme.accent, text: language === 'fr' ? 'Navigation plus fluide' : 'Smoother navigation' },
            { icon: 'favorite', color: theme.error, text: language === 'fr' ? 'Soutenez le developpement' : 'Support development' },
          ].map((b, i) => (
            <View key={i} style={styles.benefitRow}>
              <View style={[styles.benefitIcon, { backgroundColor: b.color + '15' }]}>
                <MaterialIcons name={b.icon as any} size={20} color={b.color} />
              </View>
              <Text style={styles.benefitText}>{b.text}</Text>
              <MaterialIcons name="check-circle" size={18} color={theme.success} />
            </View>
          ))}
        </Animated.View>

        {/* Donation Appeal */}
        <Animated.View entering={FadeInDown.duration(400).delay(120)} style={styles.donationCard}>
          <View style={styles.donationGlow} />
          <View style={styles.donationIconBg}>
            <MaterialIcons name="volunteer-activism" size={32} color="#F59E0B" />
          </View>
          <Text style={styles.donationTitle}>
            {language === 'fr' ? 'Aidez a faire vivre ce projet' : 'Help keep this project alive'}
          </Text>
          <Text style={styles.donationText}>
            {language === 'fr'
              ? 'Ultimate Petanque est le fruit d\'un investissement personnel, cree par un passionne pour la communaute. Aucun investisseur, aucune startup — juste l\'amour du jeu. Votre soutien finance directement le developpement, l\'hebergement et les nouvelles fonctionnalites.'
              : 'Ultimate Petanque is the result of a personal investment, created by a passionate player for the community. No investors, no startup — just the love of the game. Your support directly funds development, hosting and new features.'}
          </Text>
          <View style={styles.donationImpact}>
            {[
              { icon: 'code', text: language === 'fr' ? 'Developpement continu' : 'Ongoing development' },
              { icon: 'cloud', text: language === 'fr' ? 'Serveurs et hebergement' : 'Servers and hosting' },
              { icon: 'auto-awesome', text: language === 'fr' ? 'Nouvelles fonctionnalites' : 'New features' },
            ].map((item, i) => (
              <View key={i} style={styles.donationImpactRow}>
                <View style={styles.donationImpactIcon}>
                  <MaterialIcons name={item.icon as any} size={14} color="#F59E0B" />
                </View>
                <Text style={styles.donationImpactText}>{item.text}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.donationQuote}>
            {language === 'fr'
              ? '"Chaque contribution, aussi petite soit-elle, fait la difference."'
              : '"Every contribution, no matter how small, makes a difference."'}
          </Text>
        </Animated.View>

        {/* IAP Purchase Section */}
        <Animated.View entering={FadeInDown.duration(400).delay(160)} style={styles.purchaseCard}>
          <View style={styles.purchaseHeader}>
            <View style={[styles.purchaseIconBg, { backgroundColor: theme.success + '15' }]}>
              <MaterialIcons name={Platform.OS === 'ios' ? 'apple' : 'shop'} size={24} color={theme.success} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.purchaseTitle}>
                {language === 'fr' ? 'Achat unique' : 'One-time purchase'}
              </Text>
              <Text style={styles.purchaseSubtitle}>
                {Platform.OS === 'ios' ? 'App Store' : Platform.OS === 'android' ? 'Google Play' : language === 'fr' ? 'Disponible sur mobile' : 'Available on mobile'}
              </Text>
            </View>
            <View style={styles.priceTag}>
              <Text style={styles.priceText}>{productPrice}</Text>
            </View>
          </View>

          <Pressable
            testID="purchase-button"
            style={[styles.purchaseBtn, (!iapReady || purchasing) && styles.purchaseBtnDisabled]}
            onPress={handlePurchase}
            disabled={!iapReady || purchasing}
          >
            {purchasing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="shopping-cart" size={20} color="#FFF" />
                <Text style={styles.purchaseBtnText}>
                  {iapReady
                    ? (language === 'fr' ? 'Acheter' : 'Purchase')
                    : (language === 'fr' ? 'Non disponible' : 'Not available')}
                </Text>
              </>
            )}
          </Pressable>

          {/* Restore purchases */}
          <Pressable
            testID="restore-purchases-button"
            style={styles.restoreBtn}
            onPress={handleRestore}
            disabled={!iapReady || restoring}
          >
            {restoring ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={styles.restoreBtnText}>
                {language === 'fr' ? 'Restaurer mes achats' : 'Restore purchases'}
              </Text>
            )}
          </Pressable>
        </Animated.View>

        {/* Divider */}
        <Animated.View entering={FadeIn.duration(300).delay(240)} style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>
            {language === 'fr' ? 'ou' : 'or'}
          </Text>
          <View style={styles.dividerLine} />
        </Animated.View>

        {/* Promo Code Section */}
        <Animated.View entering={FadeInDown.duration(400).delay(280)} style={styles.promoCard}>
          <View style={styles.promoHeader}>
            <View style={[styles.promoIconBg, { backgroundColor: theme.carreauColor + '15' }]}>
              <MaterialIcons name="confirmation-number" size={22} color={theme.carreauColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.promoTitle}>
                {language === 'fr' ? 'Code promotionnel' : 'Promo Code'}
              </Text>
              <Text style={styles.promoSubtitle}>
                {language === 'fr' ? 'Entrez un code pour debloquer la version premium' : 'Enter a code to unlock premium'}
              </Text>
            </View>
          </View>

          <View style={styles.promoInputRow}>
            <TextInput
              testID="promo-code-input"
              style={styles.promoInput}
              value={promoCode}
              onChangeText={setPromoCode}
              placeholder={language === 'fr' ? 'Saisir le code...' : 'Enter code...'}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!validating}
            />
            <Pressable
              testID="promo-validate-button"
              style={[styles.promoValidateBtn, (!promoCode.trim() || validating) && styles.promoValidateBtnDisabled]}
              onPress={handleValidatePromo}
              disabled={!promoCode.trim() || validating}
            >
              {validating ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <MaterialIcons name="check" size={22} color="#FFF" />
              )}
            </Pressable>
          </View>
        </Animated.View>

        {/* Info footer */}
        <Animated.View entering={FadeIn.duration(300).delay(360)} style={styles.infoCard}>
          <MaterialIcons name="info-outline" size={18} color={theme.textMuted} />
          <Text style={styles.infoText}>
            {language === 'fr'
              ? "L'achat est definitif et lie a votre compte " + (Platform.OS === 'ios' ? 'App Store' : Platform.OS === 'android' ? 'Google Play' : 'boutique') + ". Utilisez \"Restaurer mes achats\" si vous changez d'appareil."
              : "The purchase is permanent and linked to your " + (Platform.OS === 'ios' ? 'App Store' : Platform.OS === 'android' ? 'Google Play' : 'store') + " account. Use \"Restore purchases\" if you change devices."}
          </Text>
        </Animated.View>
      </ScrollView>
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
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Hero
  heroCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl,
    padding: 28, alignItems: 'center', marginBottom: 16, ...theme.shadows.cardElevated,
  },
  heroIconBg: {
    width: 80, height: 80, borderRadius: 24, backgroundColor: theme.primary + '12',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: theme.textPrimary, marginBottom: 8, textAlign: 'center' },
  heroSubtitle: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, maxWidth: 320 },

  // Benefits
  benefitsCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg,
    padding: 16, marginBottom: 16, gap: 12, ...theme.shadows.card,
  },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  benefitIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  benefitText: { flex: 1, fontSize: 14, fontWeight: '500', color: theme.textPrimary },

  // Purchase
  purchaseCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl,
    padding: 20, marginBottom: 16, borderWidth: 2, borderColor: theme.success + '30',
    ...theme.shadows.cardElevated,
  },
  purchaseHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  purchaseIconBg: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  purchaseTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },
  purchaseSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  priceTag: {
    backgroundColor: theme.success + '15', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
  },
  priceText: { fontSize: 18, fontWeight: '800', color: theme.success },
  purchaseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: theme.success, paddingVertical: 16, borderRadius: theme.borderRadius.lg,
    ...theme.shadows.cardElevated,
  },
  purchaseBtnDisabled: { backgroundColor: theme.textMuted, opacity: 0.6 },
  purchaseBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  restoreBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  restoreBtnText: { fontSize: 14, fontWeight: '600', color: theme.primary },

  // Divider
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: theme.border },
  dividerText: { fontSize: 13, fontWeight: '600', color: theme.textMuted },

  // Promo
  promoCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl,
    padding: 20, marginBottom: 16, ...theme.shadows.card,
  },
  promoHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  promoIconBg: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  promoTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },
  promoSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  promoInputRow: { flexDirection: 'row', gap: 10 },
  promoInput: {
    flex: 1, backgroundColor: theme.backgroundSecondary, borderRadius: theme.borderRadius.md,
    paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, fontWeight: '600',
    color: theme.textPrimary, letterSpacing: 1.5, borderWidth: 1, borderColor: theme.border,
  },
  promoValidateBtn: {
    width: 52, height: 52, borderRadius: theme.borderRadius.md,
    backgroundColor: theme.carreauColor, alignItems: 'center', justifyContent: 'center',
  },
  promoValidateBtnDisabled: { backgroundColor: theme.textMuted, opacity: 0.5 },

  // Donation
  donationCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl,
    padding: 24, alignItems: 'center' as const, marginBottom: 16, position: 'relative' as const, overflow: 'hidden' as const,
    borderWidth: 2, borderColor: '#F59E0B30',
    ...theme.shadows.cardElevated,
  },
  donationGlow: {
    position: 'absolute' as const, top: -40, right: -40, width: 120, height: 120,
    borderRadius: 60, backgroundColor: '#F59E0B08',
  },
  donationIconBg: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: '#F59E0B12',
    alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 14,
    borderWidth: 1, borderColor: '#F59E0B20',
  },
  donationTitle: { fontSize: 18, fontWeight: '800' as const, color: '#92400E', marginBottom: 10, textAlign: 'center' as const },
  donationText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center' as const, lineHeight: 21, marginBottom: 16, maxWidth: 340 },
  donationImpact: { width: '100%' as any, gap: 8, marginBottom: 16 },
  donationImpactRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12 },
  donationImpactIcon: {
    width: 32, height: 32, borderRadius: 10, backgroundColor: '#F59E0B10',
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  donationImpactText: { flex: 1, fontSize: 13, fontWeight: '500' as const, color: theme.textPrimary },
  donationQuote: { fontSize: 13, fontStyle: 'italic' as const, color: '#92400E', textAlign: 'center' as const, lineHeight: 19, opacity: 0.8 },

  // Info
  infoCard: {
    flexDirection: 'row', gap: 10, backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.md, padding: 14, marginBottom: 8,
  },
  infoText: { flex: 1, fontSize: 12, color: theme.textMuted, lineHeight: 17 },

  // Premium state
  premiumContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  premiumCard: {
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl,
    padding: 32, alignItems: 'center', width: '100%', ...theme.shadows.cardElevated,
  },
  premiumIconBg: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: theme.success + '12',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  premiumTitle: { fontSize: 24, fontWeight: '800', color: theme.success, marginBottom: 10 },
  premiumDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  premiumBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFD700' + '15', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: theme.borderRadius.full,
  },
  premiumBadgeText: { fontSize: 14, fontWeight: '700', color: '#FFD700' },
});
