import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Linking, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';

const CONTACT_EMAIL = 'ultimate.petanque.app@gmail.com';

interface TierFeature {
  icon: keyof typeof MaterialIcons.glyphMap;
  text: { fr: string; en: string };
  highlight?: boolean;
}

interface PartnerTier {
  key: string;
  name: { fr: string; en: string };
  price: { fr: string; en: string };
  gradient: [string, string];
  iconColor: string;
  borderColor: string;
  bgColor: string;
  badgeColor: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  features: TierFeature[];
}

const TIERS: PartnerTier[] = [
  {
    key: 'gold',
    name: { fr: 'Partenaire Or', en: 'Gold Partner' },
    price: { fr: 'Engagement annuel', en: 'Annual commitment' },
    gradient: ['#B45309', '#F59E0B'],
    iconColor: '#F59E0B',
    borderColor: '#F59E0B',
    bgColor: '#FFFBEB',
    badgeColor: '#78350F',
    icon: 'workspace-premium',
    features: [
      { icon: 'star', text: { fr: "Banniere exclusive sur l'accueil (slot dedie, non rotatif)", en: 'Exclusive home banner (dedicated slot, non-rotating)' }, highlight: true },
      { icon: 'campaign', text: { fr: 'Remplacement des AdBanners par votre branding (12 emplacements)', en: 'Replace AdBanners with your branding (12 placements)' }, highlight: true },
      { icon: 'phone-android', text: { fr: "Section dediee dans l'onboarding (ecran de bienvenue)", en: 'Dedicated onboarding section (welcome screen)' } },
      { icon: 'emoji-events', text: { fr: "Branding sur l'ecran de resultats de defis", en: 'Branding on challenge results screen' } },
      { icon: 'notifications-active', text: { fr: 'Notifications push illimitees pour evenements', en: 'Unlimited push notifications for events' } },
      { icon: 'analytics', text: { fr: 'Dashboard analytics detaille (impressions, clics, CTR, zones)', en: 'Detailed analytics dashboard (impressions, clicks, CTR, zones)' }, highlight: true },
      { icon: 'store', text: { fr: 'Mention dans les descriptions App Store / Play Store', en: 'Mention in App Store / Play Store descriptions' } },
      { icon: 'all-inclusive', text: { fr: 'Tous les avantages Argent inclus', en: 'All Silver benefits included' } },
    ],
  },
  {
    key: 'silver',
    name: { fr: 'Partenaire Argent', en: 'Silver Partner' },
    price: { fr: 'Abonnement mensuel', en: 'Monthly subscription' },
    gradient: ['#64748B', '#94A3B8'],
    iconColor: '#94A3B8',
    borderColor: '#94A3B8',
    bgColor: '#F8FAFC',
    badgeColor: '#334155',
    icon: 'shield',
    features: [
      { icon: 'view-carousel', text: { fr: "Banniere rotative sur le carrousel ambassadeurs de l'accueil", en: 'Rotating banner on home ambassador carousel' }, highlight: true },
      { icon: 'sports', text: { fr: 'Defis sponsorises illimites avec branding complet', en: 'Unlimited sponsored challenges with full branding' } },
      { icon: 'leaderboard', text: { fr: 'Placement prioritaire dans le classement Boules par marque', en: 'Priority placement in Boules brand ranking' } },
      { icon: 'place', text: { fr: 'Logo sur la carte interactive (marqueurs personnalises)', en: 'Logo on interactive map (custom markers)' } },
      { icon: 'notifications', text: { fr: '1 notification push par mois (rayon 200km)', en: '1 monthly push notification (200km radius)' } },
      { icon: 'all-inclusive', text: { fr: 'Tous les avantages Bronze inclus', en: 'All Bronze benefits included' } },
    ],
  },
  {
    key: 'bronze',
    name: { fr: 'Partenaire Bronze', en: 'Bronze Partner' },
    price: { fr: 'Gratuit / Symbolique', en: 'Free / Symbolic' },
    gradient: ['#92400E', '#D97706'],
    iconColor: '#D97706',
    borderColor: '#D97706',
    bgColor: '#FFF7ED',
    badgeColor: '#78350F',
    icon: 'verified',
    features: [
      { icon: 'people', text: { fr: 'Logo dans la page Partenaires', en: 'Logo on Partners page' } },
      { icon: 'format-list-numbered', text: { fr: 'Mention dans le classement Boules (si marque)', en: 'Mention in Boules ranking (if brand)' } },
      { icon: 'event', text: { fr: '1 defi sponsorise par mois (nom + photo)', en: '1 sponsored challenge per month (name + photo)' } },
      { icon: 'military-tech', text: { fr: "Badge Partenaire Bronze sur le profil ambassadeur", en: 'Bronze Partner badge on ambassador profile' } },
    ],
  },
];

export default function PartnershipsScreen() {
  const { language } = useLanguage();
  const [expandedTier, setExpandedTier] = useState<string>('gold');

  const handleContact = useCallback((tier: string) => {
    const subject = encodeURIComponent(`Partenariat ${tier} - Ultimate Petanque`);
    const body = encodeURIComponent(
      language === 'fr'
        ? `Bonjour,\n\nJe suis interesse(e) par le partenariat ${tier} pour Ultimate Petanque.\n\nMerci de me contacter pour discuter des conditions.\n\nCordialement`
        : `Hello,\n\nI am interested in the ${tier} partnership for Ultimate Petanque.\n\nPlease contact me to discuss the terms.\n\nBest regards`
    );
    Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`);
  }, [language]);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={22} color="#FFF" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{language === 'fr' ? 'Partenariats' : 'Partnerships'}</Text>
          <Text style={styles.headerSub}>{language === 'fr' ? 'Devenez partenaire officiel' : 'Become an official partner'}</Text>
        </View>
        <View style={styles.headerIcon}>
          <MaterialIcons name="handshake" size={24} color="#F59E0B" />
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Intro */}
        <Animated.View entering={FadeIn.duration(400)} style={styles.introCard}>
          <LinearGradient colors={['#1E3A8A', '#2563EB']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.introGradient}>
            <MaterialIcons name="trending-up" size={32} color="#60A5FA" />
            <Text style={styles.introTitle}>{language === 'fr' ? 'Touchez la communaute petanque' : 'Reach the petanque community'}</Text>
            <Text style={styles.introDesc}>
              {language === 'fr'
                ? "Rejoignez l'ecosysteme Ultimate Petanque et gagnez en visibilite aupres de milliers de joueurs passionnes."
                : 'Join the Ultimate Petanque ecosystem and gain visibility among thousands of passionate players.'}
            </Text>
            <View style={styles.introStats}>
              {[
                { value: '1000+', label: language === 'fr' ? 'Joueurs actifs' : 'Active players' },
                { value: '12', label: language === 'fr' ? 'Emplacements pub' : 'Ad placements' },
                { value: '24/7', label: language === 'fr' ? 'Visibilite' : 'Visibility' },
              ].map((s, i) => (
                <View key={i} style={styles.introStatItem}>
                  <Text style={styles.introStatValue}>{s.value}</Text>
                  <Text style={styles.introStatLabel}>{s.label}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Tiers */}
        {TIERS.map((tier, index) => {
          const isExpanded = expandedTier === tier.key;
          return (
            <Animated.View key={tier.key} entering={FadeInDown.delay(100 * (index + 1)).duration(400)}>
              <Pressable
                style={[styles.tierCard, { borderColor: tier.borderColor + '40', backgroundColor: tier.bgColor }]}
                onPress={() => setExpandedTier(isExpanded ? '' : tier.key)}
              >
                {/* Tier Header */}
                <View style={styles.tierHeader}>
                  <LinearGradient colors={tier.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tierIconBg}>
                    <MaterialIcons name={tier.icon} size={24} color="#FFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tierName, { color: tier.badgeColor }]}>{tier.name[language]}</Text>
                    <Text style={styles.tierPrice}>{tier.price[language]}</Text>
                  </View>
                  <MaterialIcons name={isExpanded ? 'expand-less' : 'expand-more'} size={24} color={tier.iconColor} />
                </View>

                {/* Features */}
                {isExpanded ? (
                  <View style={styles.tierFeatures}>
                    {tier.features.map((feat, fi) => (
                      <View key={fi} style={[styles.featureRow, feat.highlight && { backgroundColor: tier.borderColor + '0A' }]}>
                        <View style={[styles.featureIconBg, { backgroundColor: tier.borderColor + '15' }]}>
                          <MaterialIcons name={feat.icon} size={16} color={tier.iconColor} />
                        </View>
                        <Text style={[styles.featureText, feat.highlight && { fontWeight: '700', color: tier.badgeColor }]}>
                          {feat.text[language]}
                        </Text>
                        {feat.highlight ? (
                          <View style={[styles.highlightBadge, { backgroundColor: tier.borderColor + '18' }]}>
                            <Text style={[styles.highlightBadgeText, { color: tier.iconColor }]}>★</Text>
                          </View>
                        ) : null}
                      </View>
                    ))}

                    {/* CTA */}
                    <Pressable
                      style={({ pressed }) => [styles.tierCta, { opacity: pressed ? 0.85 : 1 }]}
                      onPress={() => handleContact(tier.name[language])}
                    >
                      <LinearGradient colors={tier.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tierCtaGradient}>
                        <MaterialIcons name="mail" size={18} color="#FFF" />
                        <Text style={styles.tierCtaText}>
                          {language === 'fr' ? 'Nous contacter' : 'Contact us'}
                        </Text>
                      </LinearGradient>
                    </Pressable>
                  </View>
                ) : null}
              </Pressable>
            </Animated.View>
          );
        })}

        {/* Comparison note */}
        <View style={styles.noteCard}>
          <MaterialIcons name="info-outline" size={18} color={theme.primary} />
          <Text style={styles.noteText}>
            {language === 'fr'
              ? "Le Bronze sert de porte d'entree pour decouvrir l'ecosysteme. Les partenaires Argent et Or beneficient d'un suivi personnalise et d'un dashboard analytique avance."
              : 'Bronze serves as an entry point to discover the ecosystem. Silver and Gold partners benefit from personalized support and an advanced analytics dashboard.'}
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0F172A',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#FFF' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  headerIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, maxWidth: 640, alignSelf: 'center' as const, width: '100%' },

  // Intro
  introCard: { borderRadius: 20, overflow: 'hidden', marginBottom: 20, ...Platform.select({ ios: { shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 }, android: { elevation: 6 }, default: {} }) },
  introGradient: { padding: 24, alignItems: 'center' },
  introTitle: { fontSize: 20, fontWeight: '800', color: '#FFF', textAlign: 'center', marginTop: 12, marginBottom: 8 },
  introDesc: { fontSize: 14, color: 'rgba(255,255,255,0.7)', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  introStats: { flexDirection: 'row', gap: 16 },
  introStatItem: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  introStatValue: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  introStatLabel: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },

  // Tier card
  tierCard: { borderRadius: 18, borderWidth: 1.5, marginBottom: 16, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  tierHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18 },
  tierIconBg: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  tierName: { fontSize: 18, fontWeight: '800' },
  tierPrice: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  tierFeatures: { paddingHorizontal: 16, paddingBottom: 18 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10, marginBottom: 4 },
  featureIconBg: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  featureText: { flex: 1, fontSize: 13, color: theme.textPrimary, lineHeight: 18 },
  highlightBadge: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  highlightBadgeText: { fontSize: 12, fontWeight: '800' },

  // CTA
  tierCta: { marginTop: 12, borderRadius: 14, overflow: 'hidden' },
  tierCtaGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  tierCtaText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // Note
  noteCard: { flexDirection: 'row', gap: 10, backgroundColor: '#EFF6FF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#BFDBFE' },
  noteText: { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 18 },
});
