import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useAuth, useAlert, getSupabaseClient } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';
import { invalidateAmbassadorCache } from '@/services/ambassadorService';

type Tier = 'partner' | 'sponsor' | 'gold_sponsor';

const TIERS: { id: Tier; color: string; gradient: [string, string]; icon: string; labelFr: string; labelEn: string; descFr: string; descEn: string; features: { fr: string; en: string }[] }[] = [
  {
    id: 'partner', color: '#A1887F', gradient: ['#78350F', '#D97706'],
    icon: 'workspace-premium', labelFr: 'Partenaire Bronze', labelEn: 'Bronze Partner',
    descFr: 'Acces de base au portail partenaires.',
    descEn: 'Basic access to the partner portal.',
    features: [
      { fr: 'Stats de base (impressions, clics)', en: 'Basic stats (impressions, clicks)' },
      { fr: '1 defi sponsorise / mois', en: '1 sponsored challenge / month' },
      { fr: 'Profil partenaire', en: 'Partner profile' },
    ],
  },
  {
    id: 'sponsor', color: '#78909C', gradient: ['#475569', '#94A3B8'],
    icon: 'workspace-premium', labelFr: 'Partenaire Argent', labelEn: 'Silver Partner',
    descFr: 'Analytics avances et notifications push.',
    descEn: 'Advanced analytics and push notifications.',
    features: [
      { fr: 'Analytics detailles (CTR, portee, tendances)', en: 'Detailed analytics (CTR, reach, trends)' },
      { fr: '1 notification push / mois', en: '1 push notification / month' },
      { fr: 'Branding personnalise', en: 'Custom branding' },
      { fr: 'Marqueurs carte', en: 'Map markers' },
    ],
  },
  {
    id: 'gold_sponsor', color: '#D4A017', gradient: ['#B45309', '#F59E0B'],
    icon: 'star', labelFr: 'Partenaire Or', labelEn: 'Gold Partner',
    descFr: 'Acces complet a toutes les fonctionnalites.',
    descEn: 'Full access to all features.',
    features: [
      { fr: 'Push illimitees + test A/B', en: 'Unlimited push + A/B testing' },
      { fr: 'Banniere sur l\'accueil et onboarding', en: 'Home and onboarding banner' },
      { fr: 'Benchmark concurrents', en: 'Competitor benchmark' },
      { fr: 'Export PDF/CSV complet', en: 'Full PDF/CSV export' },
      { fr: 'CRM parrainages', en: 'Referral CRM' },
      { fr: 'Kit de marque exportable', en: 'Exportable brand kit' },
    ],
  },
];

export default function SponsorPreviewScreen() {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { language } = useLanguage();
  const fr = language === 'fr';
  const supabase = getSupabaseClient();

  const [creating, setCreating] = useState(false);
  const [selectedTier, setSelectedTier] = useState<Tier | null>(null);

  const handleActivatePreview = useCallback(async (tier: Tier) => {
    if (!user?.id) {
      showAlert(fr ? 'Erreur' : 'Error', fr ? 'Connectez-vous d\'abord' : 'Please log in first');
      return;
    }
    setCreating(true);
    setSelectedTier(tier);
    try {
      // Check if entry already exists
      const { data: existingRows } = await supabase
        .from('ambassadors')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1);
      const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;

      if (existing) {
        await supabase
          .from('ambassadors')
          .update({
            badge_type: tier,
            is_active: true,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('username, email')
          .eq('id', user.id)
          .single();

        await supabase.from('ambassadors').insert({
          user_id: user.id,
          display_name: profile?.username || profile?.email?.split('@')[0] || 'Preview Partner',
          badge_type: tier,
          is_active: true,
          is_featured: false,
          ambassador_level: 'decouverte',
          sort_order: 999,
        });
      }

      invalidateAmbassadorCache();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Small delay to ensure DB write is committed before navigation
      await new Promise(resolve => setTimeout(resolve, 400));

      // Replace current screen with portal — fresh mount ensures data is loaded
      router.replace('/sponsor-portal' as any);
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
    }
    setCreating(false);
  }, [user?.id, fr, supabase]);

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{fr ? 'Apercu Portail' : 'Portal Preview'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)} style={s.intro}>
          <View style={s.introIcon}>
            <MaterialIcons name="preview" size={32} color="#7C3AED" />
          </View>
          <Text style={s.introTitle}>
            {fr ? 'Mode apercu partenaire' : 'Partner preview mode'}
          </Text>
          <Text style={s.introDesc}>
            {fr
              ? 'Selectionnez un tier pour activer un apercu temporaire du portail partenaires. Vous pourrez ensuite changer de tier depuis cette page.'
              : 'Select a tier to activate a temporary preview of the partner portal. You can switch tiers from this page afterwards.'}
          </Text>
        </Animated.View>

        {TIERS.map((tier, idx) => (
          <Animated.View key={tier.id} entering={FadeInDown.duration(400).delay(100 + idx * 80)}>
            <Pressable
              style={({ pressed }) => [
                s.tierCard,
                { borderColor: tier.color + '40' },
                pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] },
              ]}
              onPress={() => handleActivatePreview(tier.id)}
              disabled={creating}
            >
              <LinearGradient
                colors={tier.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.tierHeader}
              >
                <View style={s.tierHeaderContent}>
                  <MaterialIcons name={tier.icon as any} size={28} color="#FFF" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.tierLabel}>{fr ? tier.labelFr : tier.labelEn}</Text>
                    <Text style={s.tierDesc}>{fr ? tier.descFr : tier.descEn}</Text>
                  </View>
                  {creating && selectedTier === tier.id ? (
                    <ActivityIndicator size="small" color="#FFF" />
                  ) : (
                    <MaterialIcons name="arrow-forward" size={22} color="rgba(255,255,255,0.7)" />
                  )}
                </View>
              </LinearGradient>

              <View style={s.tierFeatures}>
                {tier.features.map((f, i) => (
                  <View key={i} style={s.tierFeatureRow}>
                    <MaterialIcons name="check-circle" size={16} color={tier.color} />
                    <Text style={s.tierFeatureText}>{fr ? f.fr : f.en}</Text>
                  </View>
                ))}
              </View>

              <View style={[s.tierCta, { backgroundColor: tier.color + '12' }]}>
                <MaterialIcons name="visibility" size={16} color={tier.color} />
                <Text style={[s.tierCtaText, { color: tier.color }]}>
                  {fr ? 'Activer cet apercu' : 'Activate this preview'}
                </Text>
              </View>
            </Pressable>
          </Animated.View>
        ))}

        <Animated.View entering={FadeInDown.duration(300).delay(400)} style={s.infoCard}>
          <MaterialIcons name="info-outline" size={16} color="#6366F1" />
          <Text style={s.infoText}>
            {fr
              ? 'L\'apercu cree une entree temporaire dans la table partenaires. Vous pouvez revenir ici pour changer de tier a tout moment.'
              : 'The preview creates a temporary entry in the partners table. You can come back here to switch tiers anytime.'}
          </Text>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, maxWidth: 600, alignSelf: 'center' as const, width: '100%' },
  intro: { alignItems: 'center', marginBottom: 28 },
  introIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  introTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 8 },
  introDesc: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 21, paddingHorizontal: 8 },
  tierCard: { backgroundColor: '#FFF', borderRadius: 20, marginBottom: 16, borderWidth: 2, overflow: 'hidden' },
  tierHeader: { paddingVertical: 18, paddingHorizontal: 18 },
  tierHeaderContent: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  tierLabel: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  tierDesc: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  tierFeatures: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 8, gap: 10 },
  tierFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tierFeatureText: { flex: 1, fontSize: 13, fontWeight: '500', color: '#334155', lineHeight: 18 },
  tierCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 18, marginBottom: 18, paddingVertical: 12, borderRadius: 14 },
  tierCtaText: { fontSize: 14, fontWeight: '700' },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#EEF2FF', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#C7D2FE' },
  infoText: { flex: 1, fontSize: 12, color: '#4338CA', lineHeight: 18 },
});
