import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { AMBASSADOR_LEVELS, AmbassadorLevel } from '@/services/ambassadorService';

interface LevelConfig {
  id: AmbassadorLevel;
  nameFr: string;
  nameEn: string;
  descFr: string;
  descEn: string;
  color: string;
  icon: string;
  criteriaFr: string[];
  criteriaEn: string[];
  benefitsFr: string[];
  benefitsEn: string[];
}

const LEVELS: LevelConfig[] = [
  {
    id: 'decouverte',
    nameFr: 'Decouverte',
    nameEn: 'Discovery',
    descFr: 'Premiers pas dans le programme ambassadeur',
    descEn: 'First steps in the ambassador program',
    color: '#3B82F6',
    icon: 'explore',
    criteriaFr: ['Etre inscrit sur Ultimate Petanque', 'Avoir un profil public actif', 'Partager son code parrainage'],
    criteriaEn: ['Be registered on Ultimate Petanque', 'Have an active public profile', 'Share your referral code'],
    benefitsFr: ['Badge ambassadeur dans le profil', 'Code de parrainage personnel', 'Acces aux statistiques de base', 'Creation de 2 defis sponsorises/mois', 'Apparition dans la liste des ambassadeurs'],
    benefitsEn: ['Ambassador badge on profile', 'Personal referral code', 'Access to basic statistics', 'Create 2 sponsored challenges/month', 'Listed in ambassadors page'],
  },
  {
    id: 'confirme',
    nameFr: 'Confirme',
    nameEn: 'Confirmed',
    descFr: 'Ambassadeur actif avec une communaute engagee',
    descEn: 'Active ambassador with an engaged community',
    color: '#7C3AED',
    icon: 'trending-up',
    criteriaFr: ['5+ parrainages valides', '3+ defis sponsorises organises', '500+ impressions cumulees'],
    criteriaEn: ['5+ validated referrals', '3+ organized sponsored challenges', '500+ cumulative impressions'],
    benefitsFr: ['Tous les avantages Decouverte', 'Banniere rotative sur la page d\'accueil', 'Dashboard analytics personnel complet', 'Defis sponsorises illimites', 'Suivi des parrainages en temps reel', 'Badge "Confirme" distinctif violet'],
    benefitsEn: ['All Discovery benefits', 'Rotating banner on home page', 'Full personal analytics dashboard', 'Unlimited sponsored challenges', 'Real-time referral tracking', 'Distinctive purple "Confirmed" badge'],
  },
  {
    id: 'elite',
    nameFr: 'Elite',
    nameEn: 'Elite',
    descFr: 'Ambassadeur de reference, figure incontournable de la communaute',
    descEn: 'Reference ambassador, key community figure',
    color: '#F59E0B',
    icon: 'military-tech',
    criteriaFr: ['20+ parrainages valides', '10+ defis sponsorises organises', '2000+ impressions cumulees'],
    criteriaEn: ['20+ validated referrals', '10+ organized sponsored challenges', '2000+ cumulative impressions'],
    benefitsFr: ['Tous les avantages Confirme', 'Banniere permanente sur l\'accueil', 'Section dediee dans l\'onboarding', 'Notifications push illimitees', 'Analytics avances avec export', 'Badge "Elite" dore exclusif', 'Priorite dans les classements ambassadeurs', 'Acces anticipate aux nouvelles fonctionnalites'],
    benefitsEn: ['All Confirmed benefits', 'Permanent banner on home page', 'Dedicated section in onboarding', 'Unlimited push notifications', 'Advanced analytics with export', 'Exclusive gold "Elite" badge', 'Priority in ambassador rankings', 'Early access to new features'],
  },
];

export default function AmbassadorProgramScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const fr = language === 'fr';
  const [expandedLevel, setExpandedLevel] = useState<AmbassadorLevel | null>('decouverte');
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const cardPositions = useRef<Map<string, number>>(new Map());

  const toggleLevel = useCallback((id: AmbassadorLevel) => {
    Haptics.selectionAsync();
    const isExpanding = expandedLevel !== id;
    setExpandedLevel(prev => prev === id ? null : id);
    if (isExpanding) {
      setTimeout(() => {
        const y = cardPositions.current.get(id);
        if (y !== undefined && scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ y: Math.max(0, y - 80), animated: true });
        }
      }, 100);
    }
  }, [expandedLevel]);

  const toggleFaq = useCallback((idx: number) => {
    Haptics.selectionAsync();
    setExpandedFaq(prev => prev === idx ? null : idx);
  }, []);

  const faqs = [
    {
      q: fr ? 'Comment devenir ambassadeur ?' : 'How to become an ambassador?',
      a: fr ? 'Contactez notre equipe via la page partenaires ou utilisez le formulaire de candidature dans l\'application.' : 'Contact our team via the partners page or use the application form in the app.',
    },
    {
      q: fr ? 'Comment fonctionne le parrainage ?' : 'How does referral work?',
      a: fr ? 'Partagez votre code unique. Quand un nouveau joueur s\'inscrit avec votre code, vous gagnez 50 XP et votre compteur augmente.' : 'Share your unique code. When a new player signs up with your code, you earn 50 XP and your counter increases.',
    },
    {
      q: fr ? 'Quelle est la difference avec les sponsors ?' : 'What is the difference with sponsors?',
      a: fr ? 'Les ambassadeurs sont des joueurs passionnes qui representent la communaute. Les sponsors sont des partenaires commerciaux avec des offres de visibilite business (Bronze/Argent/Or).' : 'Ambassadors are passionate players representing the community. Sponsors are business partners with commercial visibility offers (Bronze/Silver/Gold).',
    },
    {
      q: fr ? 'La promotion est-elle automatique ?' : 'Is promotion automatic?',
      a: fr ? 'Oui ! Des que vous atteignez les criteres du niveau superieur, votre badge est automatiquement mis a jour et vous debloquez les nouveaux avantages.' : 'Yes! As soon as you meet the criteria for the next level, your badge is automatically updated and you unlock new benefits.',
    },
  ];

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.headerWrap}>
        <LinearGradient colors={['#0F172A', '#1E293B']} style={s.headerGradient}>
          <View style={s.headerDeco1} />
          <View style={s.headerDeco2} />
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={22} color="#FFF" />
          </Pressable>
          <View style={s.headerContent}>
            <View style={s.headerTitleRow}>
              <MaterialIcons name="stars" size={28} color="#F59E0B" />
              <View style={{ flex: 1 }}>
                <Text style={s.headerTitle}>{fr ? 'Programme Ambassadeurs' : 'Ambassador Program'}</Text>
                <Text style={s.headerSub}>{fr ? '3 niveaux de visibilite et avantages' : '3 levels of visibility and benefits'}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={{ flex: 1 }}
        contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Introduction */}
        <Animated.View entering={FadeInDown.duration(300)} style={s.introCard}>
          <View style={s.introIconBg}>
            <MaterialIcons name="campaign" size={20} color="#7C3AED" />
          </View>
          <Text style={s.introText}>
            {fr
              ? 'Devenez ambassadeur et representez la communaute petanque. Progressez dans les niveaux en parrainant de nouveaux joueurs et en organisant des defis.'
              : 'Become an ambassador and represent the petanque community. Progress through levels by referring new players and organizing challenges.'}
          </Text>
        </Animated.View>

        {/* Progression visual */}
        <Animated.View entering={FadeInDown.duration(300).delay(50)} style={s.progressionCard}>
          <Text style={s.progressionTitle}>{fr ? 'Votre progression' : 'Your progression'}</Text>
          <View style={s.progressionTrack}>
            {LEVELS.map((level, idx) => {
              const isActive = expandedLevel === level.id;
              const activeIdx = LEVELS.findIndex(l => l.id === expandedLevel);
              const isPast = activeIdx >= 0 && idx < activeIdx;
              return (
                <React.Fragment key={level.id}>
                  {idx > 0 ? (
                    <View style={[s.progressionConnector, isPast && { backgroundColor: LEVELS[idx - 1].color }]} />
                  ) : null}
                  <Pressable style={s.progressionStep} onPress={() => toggleLevel(level.id)}>
                    <View style={[
                      s.progressionCircle,
                      { backgroundColor: level.color + '20', borderColor: level.color },
                      isActive && { backgroundColor: level.color, transform: [{ scale: 1.1 }] },
                      isPast && { backgroundColor: level.color + '40' },
                    ]}>
                      <MaterialIcons name={level.icon as any} size={20} color={isActive ? '#FFF' : level.color} />
                    </View>
                    <Text style={[s.progressionLabel, { color: level.color }, isActive && { fontWeight: '800' }]}>
                      {fr ? level.nameFr : level.nameEn}
                    </Text>
                  </Pressable>
                </React.Fragment>
              );
            })}
          </View>
        </Animated.View>

        {/* Section Divider */}
        <View style={s.sectionDivider}>
          <View style={s.sectionDividerLine} />
          <Text style={s.sectionDividerText}>{fr ? 'NIVEAUX' : 'LEVELS'}</Text>
          <View style={s.sectionDividerLine} />
        </View>

        {/* Level Cards */}
        {LEVELS.map((level, idx) => {
          const isExpanded = expandedLevel === level.id;
          const criteria = fr ? level.criteriaFr : level.criteriaEn;
          const benefits = fr ? level.benefitsFr : level.benefitsEn;
          const levelConf = AMBASSADOR_LEVELS[level.id];
          const isPopular = level.id === 'confirme';

          return (
            <View
              key={level.id}
              onLayout={(e) => { cardPositions.current.set(level.id, e.nativeEvent.layout.y + 200); }}
            >
              <View style={[
                s.levelCard,
                isExpanded && { borderColor: level.color + '40', borderWidth: 2 },
              ]}>
                {/* Popular badge */}
                {isPopular ? (
                  <View style={[s.popularBadge, { backgroundColor: level.color }]}>
                    <MaterialIcons name="local-fire-department" size={10} color="#FFF" />
                    <Text style={s.popularBadgeText}>{fr ? 'POPULAIRE' : 'POPULAR'}</Text>
                  </View>
                ) : null}

                {/* Level Header */}
                <Pressable
                  style={({ pressed }) => [s.levelHeader, pressed && { opacity: 0.8 }]}
                  onPress={() => toggleLevel(level.id)}
                >
                  <LinearGradient colors={[level.color, level.color + 'CC']} style={s.levelIconBg}>
                    <MaterialIcons name={level.icon as any} size={24} color="#FFF" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <View style={s.levelNameRow}>
                      <Text style={[s.levelName, { color: level.color }]}>
                        {fr ? level.nameFr : level.nameEn}
                      </Text>
                      <View style={[s.levelBadge, { backgroundColor: level.color }]}>
                        <Text style={s.levelBadgeText}>{fr ? `Niveau ${idx + 1}` : `Level ${idx + 1}`}</Text>
                      </View>
                    </View>
                    <Text style={s.levelDesc}>{fr ? level.descFr : level.descEn}</Text>
                    {/* Summary chips */}
                    <View style={s.levelSummaryRow}>
                      <View style={[s.levelSummaryChip, { backgroundColor: level.color + '10', borderColor: level.color + '20' }]}>
                        <MaterialIcons name="checklist" size={11} color={level.color} />
                        <Text style={[s.levelSummaryChipText, { color: level.color }]}>{criteria.length} {fr ? 'criteres' : 'criteria'}</Text>
                      </View>
                      <View style={[s.levelSummaryChip, { backgroundColor: level.color + '10', borderColor: level.color + '20' }]}>
                        <MaterialIcons name="card-giftcard" size={11} color={level.color} />
                        <Text style={[s.levelSummaryChipText, { color: level.color }]}>{benefits.length} {fr ? 'avantages' : 'benefits'}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={[s.chevronCircle, isExpanded && { backgroundColor: level.color + '15' }]}>
                    <MaterialIcons
                      name={isExpanded ? 'expand-less' : 'expand-more'}
                      size={24}
                      color={level.color}
                    />
                  </View>
                </Pressable>

                {/* Expanded Content */}
                {isExpanded ? (
                  <Animated.View entering={FadeIn.duration(250)} style={s.levelExpanded}>
                    {/* Criteria */}
                    <View style={s.levelSection}>
                      <View style={s.levelSectionHeader}>
                        <MaterialIcons name="checklist" size={16} color={theme.textSecondary} />
                        <Text style={s.levelSectionTitle}>{fr ? 'Criteres requis' : 'Required criteria'}</Text>
                      </View>
                      {criteria.map((c, i) => (
                        <View key={i} style={s.criteriaRow}>
                          <View style={[s.criteriaCircle, { borderColor: level.color, backgroundColor: level.color + '08' }]}>
                            {idx === 0 ? (
                              <MaterialIcons name="check" size={10} color={level.color} />
                            ) : (
                              <Text style={[s.criteriaNumber, { color: level.color }]}>{i + 1}</Text>
                            )}
                          </View>
                          <Text style={s.criteriaText}>{c}</Text>
                        </View>
                      ))}
                      {/* Threshold summary for Confirme/Elite */}
                      {idx > 0 ? (
                        <View style={[s.thresholdCard, { backgroundColor: level.color + '06', borderColor: level.color + '18' }]}>
                          <View style={s.thresholdRow}>
                            <MaterialIcons name="people" size={14} color={level.color} />
                            <Text style={s.thresholdText}>{levelConf.minReferrals} {fr ? 'parrainages' : 'referrals'}</Text>
                          </View>
                          <View style={s.thresholdRow}>
                            <MaterialIcons name="campaign" size={14} color={level.color} />
                            <Text style={s.thresholdText}>{levelConf.minEvents} {fr ? 'evenements' : 'events'}</Text>
                          </View>
                          <View style={s.thresholdRow}>
                            <MaterialIcons name="visibility" size={14} color={level.color} />
                            <Text style={s.thresholdText}>{levelConf.minImpressions.toLocaleString()} impressions</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>

                    {/* Benefits */}
                    <View style={s.levelSection}>
                      <View style={s.levelSectionHeader}>
                        <MaterialIcons name="card-giftcard" size={16} color={level.color} />
                        <Text style={[s.levelSectionTitle, { color: level.color }]}>{fr ? 'Avantages' : 'Benefits'}</Text>
                      </View>
                      {benefits.map((b, i) => (
                        <View key={i} style={s.benefitRow}>
                          <View style={[s.benefitDot, { backgroundColor: level.color }]} />
                          <Text style={s.benefitText}>{b}</Text>
                        </View>
                      ))}
                    </View>
                  </Animated.View>
                ) : null}
              </View>
            </View>
          );
        })}

        {/* Section Divider */}
        <View style={s.sectionDivider}>
          <View style={s.sectionDividerLine} />
          <Text style={s.sectionDividerText}>XP</Text>
          <View style={s.sectionDividerLine} />
        </View>

        {/* XP System Info */}
        <Animated.View entering={FadeInDown.duration(300).delay(350)} style={s.xpCard}>
          <View style={s.xpHeader}>
            <View style={s.xpIconBg}>
              <MaterialIcons name="bolt" size={22} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.xpTitle}>{fr ? 'Systeme XP Parrainage' : 'Referral XP System'}</Text>
              <Text style={s.xpSubtitle}>{fr ? 'Gagnez des XP a chaque action' : 'Earn XP with every action'}</Text>
            </View>
          </View>
          <View style={s.xpTable}>
            {[
              { action: fr ? 'Parrainage valide' : 'Valid referral', xp: '+50 XP', icon: 'person-add' as const, color: '#10B981' },
              { action: fr ? 'Defi sponsorise cree' : 'Sponsored challenge created', xp: '+25 XP', icon: 'emoji-events' as const, color: '#7C3AED' },
              { action: fr ? '100 impressions' : '100 impressions', xp: '+10 XP', icon: 'visibility' as const, color: '#3B82F6' },
            ].map((item, i) => (
              <View key={i} style={s.xpTableRow}>
                <View style={[s.xpTableIcon, { backgroundColor: item.color + '12' }]}>
                  <MaterialIcons name={item.icon} size={16} color={item.color} />
                </View>
                <Text style={s.xpTableAction}>{item.action}</Text>
                <View style={[s.xpTableBadge, { backgroundColor: '#F59E0B12' }]}>
                  <Text style={s.xpTableValue}>{item.xp}</Text>
                </View>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* CTA */}
        <Animated.View entering={FadeInDown.duration(300).delay(400)}>
          <Pressable
            style={({ pressed }) => [s.ctaBtn, pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push('/ambassador-dashboard' as any);
            }}
          >
            <LinearGradient
              colors={['#7C3AED', '#9333EA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.ctaGradient}
            >
              <MaterialIcons name="dashboard" size={22} color="#FFF" />
              <Text style={s.ctaText}>{fr ? 'Acceder au portail ambassadeur' : 'Access ambassador portal'}</Text>
              <MaterialIcons name="arrow-forward" size={20} color="rgba(255,255,255,0.7)" />
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* Section Divider */}
        <View style={s.sectionDivider}>
          <View style={s.sectionDividerLine} />
          <Text style={s.sectionDividerText}>FAQ</Text>
          <View style={s.sectionDividerLine} />
        </View>

        {/* FAQ Section - Collapsible */}
        <Animated.View entering={FadeInDown.duration(300).delay(450)} style={s.faqCard}>
          <View style={s.faqHeader}>
            <MaterialIcons name="help-outline" size={20} color="#7C3AED" />
            <Text style={s.faqTitle}>{fr ? 'Questions frequentes' : 'FAQ'}</Text>
          </View>
          {faqs.map((faq, i) => {
            const isOpen = expandedFaq === i;
            return (
              <Pressable
                key={i}
                style={[s.faqItem, isOpen && s.faqItemOpen]}
                onPress={() => toggleFaq(i)}
              >
                <View style={s.faqQRow}>
                  <View style={[s.faqQIcon, isOpen && { backgroundColor: '#7C3AED12' }]}>
                    <MaterialIcons name={isOpen ? 'remove' : 'add'} size={16} color="#7C3AED" />
                  </View>
                  <Text style={[s.faqQ, isOpen && { color: '#7C3AED' }]}>{faq.q}</Text>
                </View>
                {isOpen ? (
                  <Animated.View entering={FadeIn.duration(200)}>
                    <Text style={s.faqA}>{faq.a}</Text>
                  </Animated.View>
                ) : null}
              </Pressable>
            );
          })}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  // Header
  headerWrap: { backgroundColor: '#0F172A', borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  headerGradient: { paddingTop: 12, paddingBottom: 20, paddingHorizontal: 16, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, overflow: 'hidden', position: 'relative' },
  headerDeco1: { position: 'absolute', top: -30, right: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.04)' },
  headerDeco2: { position: 'absolute', bottom: -15, left: -15, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.03)' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  headerContent: {},
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 3 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, maxWidth: 640, alignSelf: 'center' as const, width: '100%' },
  // Intro
  introCard: { flexDirection: 'row', gap: 12, backgroundColor: '#7C3AED06', borderRadius: 16, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#7C3AED12' },
  introIconBg: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center' },
  introText: { flex: 1, fontSize: 14, color: theme.textSecondary, lineHeight: 21 },
  // Progression
  progressionCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 8, borderWidth: 1, borderColor: '#E8EDF2', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 }, android: { elevation: 1 }, default: {} }) },
  progressionTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, marginBottom: 16 },
  progressionTrack: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  progressionStep: { alignItems: 'center', gap: 8 },
  progressionConnector: { width: 40, height: 3, backgroundColor: '#E2E8F0', borderRadius: 2, marginHorizontal: 4, marginBottom: 24 },
  progressionCircle: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
  progressionLabel: { fontSize: 12, fontWeight: '700' },
  // Section Divider
  sectionDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16, paddingHorizontal: 4 },
  sectionDividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  sectionDividerText: { fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5 },
  // Level Cards
  levelCard: { backgroundColor: '#FFF', borderRadius: 18, marginBottom: 14, borderWidth: 1.5, borderColor: '#E8EDF2', overflow: 'hidden' as const, position: 'relative' as const, ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  popularBadge: { position: 'absolute', top: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, zIndex: 2 },
  popularBadgeText: { fontSize: 8, fontWeight: '900', color: '#FFF', letterSpacing: 0.5 },
  levelHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  levelIconBg: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  levelNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  levelName: { fontSize: 18, fontWeight: '800' },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  levelBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  levelDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 3 },
  levelSummaryRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  levelSummaryChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  levelSummaryChipText: { fontSize: 10, fontWeight: '700' },
  chevronCircle: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  levelExpanded: { paddingHorizontal: 16, paddingBottom: 18, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  levelSection: { marginTop: 14 },
  levelSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  levelSectionTitle: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  // Criteria
  criteriaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  criteriaCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  criteriaNumber: { fontSize: 10, fontWeight: '800' },
  criteriaText: { flex: 1, fontSize: 14, color: theme.textPrimary, lineHeight: 20 },
  thresholdCard: { borderRadius: 12, padding: 12, marginTop: 8, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  thresholdRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  thresholdText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  // Benefits
  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  benefitDot: { width: 6, height: 6, borderRadius: 3, marginTop: 7 },
  benefitText: { flex: 1, fontSize: 14, color: theme.textPrimary, lineHeight: 20 },
  // XP Card
  xpCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#E8EDF2', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 }, android: { elevation: 1 }, default: {} }) },
  xpHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  xpIconBg: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#F59E0B12', alignItems: 'center', justifyContent: 'center' },
  xpTitle: { fontSize: 16, fontWeight: '800', color: theme.textPrimary },
  xpSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  xpTable: { gap: 8 },
  xpTableRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFC', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  xpTableIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  xpTableAction: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  xpTableBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  xpTableValue: { fontSize: 13, fontWeight: '800', color: '#F59E0B' },
  // CTA
  ctaBtn: { marginBottom: 8, borderRadius: 16, overflow: 'hidden' },
  ctaGradient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 18, borderRadius: 16 },
  ctaText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  // FAQ
  faqCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 16, borderWidth: 1, borderColor: '#E8EDF2' },
  faqHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  faqTitle: { fontSize: 16, fontWeight: '800', color: theme.textPrimary },
  faqItem: { marginBottom: 4, borderRadius: 12, padding: 12, backgroundColor: '#FAFBFC', borderWidth: 1, borderColor: '#F1F5F9' },
  faqItemOpen: { backgroundColor: '#7C3AED04', borderColor: '#7C3AED15' },
  faqQRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  faqQIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  faqQ: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  faqA: { fontSize: 13, color: theme.textSecondary, lineHeight: 20, paddingLeft: 38, marginTop: 10 },
});
