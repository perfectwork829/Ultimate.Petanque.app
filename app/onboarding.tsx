import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Linking,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth, useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import theme from '@/constants/theme';
import config, { PlayerRole } from '@/constants/config';
import { useAppActions, useAppData } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { LEAGUE_TIERS } from '@/services/globalRankingService';
import { fetchAmbassadors, Ambassador, generateReferralCode } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import { trackOnboardingStep } from '@/services/onboardingAnalyticsService';
import LocationPicker, { LocationData } from '@/components/ui/LocationPicker';
import { getPlayerCity, hasRequiredPlayerCity } from '@/utils/playerLocationRequirement';

// ============================================
// TYPES — Step order:
// 0: Splash
// 1: Language
// 2: Promise ("Votre vrai niveau")
// 3: Sponsor / Ambassador
// 4: ELO Leagues
// 5: TrustScore & Anti-triche (NEW)
// 6: Features ("Tout pour ta pétanque")
// 7: Map ("Des joueurs près de chez toi")
// 8: Login CTA ("Prêt à jouer?")
// 9: Express Profile
// 10: Referral
// ============================================
type Step = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const ONBOARDING_KEY = 'hasSeenOnboarding';
const TOTAL_DOTS = 7; // visible dots for steps 2-8

const STEP_NAMES: Record<number, string> = {
  0: 'splash', 1: 'language', 2: 'promise', 3: 'sponsor',
  4: 'leagues', 5: 'trustscore', 6: 'features', 7: 'map',
  8: 'login_cta', 9: 'profile', 10: 'referral',
};

// Map step → progress dot index (steps 2-8 → dots 0-6)
const DOT_INDEX: Record<number, number> = { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6 };

// ============================================
// PROGRESS DOTS
// ============================================
function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <View style={s.progressDots}>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            s.progressDot,
            i === current ? s.progressDotActive : null,
            i < current ? s.progressDotDone : null,
          ]}
        />
      ))}
    </View>
  );
}

// ============================================
// MAIN ONBOARDING SCREEN
// ============================================
export default function OnboardingScreen() {
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { updatePlayer } = useAppActions();
  const { selfPlayer } = useAppData();
  const supabase = getSupabaseClient();
  const { t, language, setLanguage } = useLanguage();
  const fr = language === 'fr';

  const [step, setStep] = useState<Step>(0);
  const [saving, setSaving] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  // Profile state
  const [username, setUsername] = useState('');
  const [role, setRole] = useState<PlayerRole | null>(null);
  const [profileLocation, setProfileLocation] = useState<LocationData>({
    address: '', city: '', country: 'France', latitude: 0, longitude: 0,
  });

  // Sponsor
  const [goldSponsor, setGoldSponsor] = useState<Ambassador | null>(null);
  const [eliteAmbassador, setEliteAmbassador] = useState<Ambassador | null>(null);
  const [sponsorLoaded, setSponsorLoaded] = useState(false);

  // Referral
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralLoading, setReferralLoading] = useState(false);

  // Tracking
  const [trackingSessionId] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    fetchAmbassadors().then(({ ambassadors }) => {
      const gold = ambassadors.find(a => a.badgeType === 'gold_sponsor');
      if (gold) setGoldSponsor(gold);
      else {
        const sp = ambassadors.find(a => a.badgeType === 'sponsor' && a.isFeatured);
        if (sp) setGoldSponsor(sp);
      }
      const elite = ambassadors.find(a => a.badgeType === 'ambassador' && a.ambassadorLevel === 'elite' && a.isFeatured);
      if (elite) setEliteAmbassador(elite);
      setSponsorLoaded(true);
    }).catch(() => setSponsorLoaded(true));
  }, []);

  // Splash timer
  useEffect(() => {
    if (user) { setSplashDone(true); return; }
    const timer = setTimeout(() => setSplashDone(true), 2500);
    return () => clearTimeout(timer);
  }, []);

  // Auto-advance from splash
  useEffect(() => {
    if (splashDone && step === 0) {
      if (user) setStep(9 as Step);
      else setStep(1);
    }
  }, [splashDone, user]);

  // If user logs in while on earlier step, skip to profile
  useEffect(() => {
    if (user && step >= 1 && step < 9) setStep(9 as Step);
  }, [user]);

  // Track step transitions
  useEffect(() => {
    trackOnboardingStep({
      sessionId: trackingSessionId,
      userId: user?.id,
      stepNumber: step,
      stepName: STEP_NAMES[step] || `step_${step}`,
      action: 'enter',
    });
  }, [step, trackingSessionId]);

  // Load referral code on step 10
  useEffect(() => {
    if (step === 10 && user?.id && !referralCode) loadOrCreateReferralCode();
  }, [step, user?.id]);

  // Pre-fill express profile when returning (e.g. username set but city missing)
  useEffect(() => {
    if (step !== 9 || !user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ data: profile }, { data: player }] = await Promise.all([
          supabase.from('user_profiles').select('username, role').eq('id', user.id).maybeSingle(),
          supabase.from('players').select('name, city, location, country, role').eq('user_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
        ]);
        if (cancelled) return;
        const name = profile?.username?.trim() || player?.name?.trim();
        if (name && !username.trim()) setUsername(name);
        if (player?.role && !role) setRole(player.role as PlayerRole);
        const city = getPlayerCity(player);
        if (city && !profileLocation.city?.trim()) {
          setProfileLocation(prev => ({
            ...prev,
            city,
            country: player?.country || prev.country || 'France',
            latitude: player?.location?.latitude ?? prev.latitude,
            longitude: player?.location?.longitude ?? prev.longitude,
          }));
        }
      } catch { /* non-blocking */ }
    })();
    return () => { cancelled = true; };
  }, [step, user?.id]);

  const loadOrCreateReferralCode = useCallback(async () => {
    if (!user?.id) return;
    setReferralLoading(true);
    try {
      const { data: amb } = await supabase.from('ambassadors').select('id, referral_code').eq('user_id', user.id).maybeSingle();
      if (amb?.referral_code) { setReferralCode(amb.referral_code); }
      else {
        const initials = (username || 'UP').replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase() || 'UP';
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let suffix = '';
        for (let i = 0; i < 4; i++) suffix += chars.charAt(Math.floor(Math.random() * chars.length));
        const code = `${initials}-${suffix}`;
        setReferralCode(code);
        if (amb?.id) await generateReferralCode(amb.id, username || 'User');
      }
    } catch {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let code = 'UP-';
      for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
      setReferralCode(code);
    } finally { setReferralLoading(false); }
  }, [user?.id, username]);

  const handleShareReferral = useCallback(async () => {
    const code = referralCode || 'UP-APP';
    const shareUrl = `https://ultimatepetanque.app/?ref=${code}`;
    const message = fr
      ? `Rejoins-moi sur Ultimate Petanque ! Suis tes matchs, progresse et trouve des joueurs. Utilise mon code : ${code}\n${shareUrl}`
      : `Join me on Ultimate Petanque! Track your matches, improve and find players. Use my code: ${code}\n${shareUrl}`;
    try { await Share.share({ message, url: shareUrl }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch { /* cancelled */ }
  }, [referralCode, fr]);

  // ============================================
  // NAVIGATION
  // ============================================
  const trackComplete = () => {
    trackOnboardingStep({ sessionId: trackingSessionId, userId: user?.id, stepNumber: step, stepName: STEP_NAMES[step] || `step_${step}`, action: 'complete' });
  };

  const featuredEntity = goldSponsor || eliteAmbassador;

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    trackComplete();
    // Skip sponsor step if no sponsor
    if (step === 2 && !featuredEntity) { setStep(4 as Step); return; }
    setStep(prev => Math.min(10, prev + 1) as Step);
  };

  const goBack = () => {
    Haptics.selectionAsync();
    // Skip sponsor step if no sponsor
    if (step === 4 && !featuredEntity) { setStep(2 as Step); return; }
    setStep(prev => Math.max(1, prev - 1) as Step);
  };

  const goTo = (s: Step) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); trackComplete(); setStep(s); };

  // ============================================
  // HANDLE COMPLETE (POST-LOGIN PROFILE SAVE)
  // ============================================
  const handleComplete = async () => {
    if (!username.trim()) {
      showAlert(t('common', 'error'), t('onboarding', 'nameRequired'));
      return;
    }
    if (!hasRequiredPlayerCity({ city: profileLocation.city, location: profileLocation })) {
      showAlert(t('common', 'error'), t('onboarding', 'cityRequiredMessage'));
      return;
    }
    setSaving(true);
    try {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({ username: username.trim(), role: role || 'Milieu', level: 'Intermédiaire' })
        .eq('id', user?.id);
      if (profileError) throw profileError;

      let playerId = selfPlayer?.id;
      if (!playerId && user?.id) {
        const { data } = await supabase
          .from('players')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        playerId = data?.id;
      }

      if (playerId) {
        await updatePlayer(playerId, {
          name: username.trim(),
          role: role || 'Milieu',
          level: 'Intermédiaire',
          city: profileLocation.city.trim(),
          country: profileLocation.country || 'France',
          location: {
            city: profileLocation.city.trim(),
            latitude: profileLocation.latitude,
            longitude: profileLocation.longitude,
          },
          isPublic: true,
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setStep(10 as Step);
    } catch (error: any) { showAlert(t('common', 'error'), error.message || 'Unable to save profile'); }
    finally { setSaving(false); }
  };

  const handleFinalComplete = async () => { await AsyncStorage.setItem(ONBOARDING_KEY, 'true'); router.replace('/consent'); };

  const entityType: 'sponsor' | 'ambassador' = goldSponsor ? 'sponsor' : 'ambassador';

  // ============================================
  // STEP 0: ANIMATED SPLASH
  // ============================================
  if (step === 0) {
    return (
      <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.fullScreen}>
        <SafeAreaView style={s.fullScreen}>
          <View style={s.splashContainer}>
            <Image source={require('@/assets/images/logo-ultimate-petanque.png')} style={s.splashImage} contentFit="contain" transition={300} />

            <ActivityIndicator color="#60A5FA" size="small" style={{ marginTop: 24 }} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================
  // STEP 1: LANGUAGE SELECTION
  // ============================================
  if (step === 1) {
    return (
      <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.fullScreen}>
        <SafeAreaView style={s.fullScreen}>
          <View style={s.langContent}>
            <View style={s.langHeader}>
              <Image source={require('@/assets/images/logo-ultimate-petanque.png')} style={s.langLogo} contentFit="contain" transition={300} />
              <View style={{ height: 16 }} />
              <MaterialIcons name="translate" size={32} color="#60A5FA" />
              <Text style={s.langTitle}>Choose your language</Text>
              <Text style={s.langSubtitle}>Choisissez votre langue</Text>
            </View>
            <View style={s.langOptions}>
              {([['fr', '🇫🇷', 'Français', 'Langue de Moliere et de la petanque'] as const, ['en', '🇬🇧', 'English', 'For the international community'] as const]).map(([lang, flag, title, desc]) => (
                <Pressable key={lang} style={({ pressed }) => [s.langOption, language === lang && s.langOptionActive, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={() => { Haptics.selectionAsync(); setLanguage(lang); }}>
                  <Text style={s.langFlag}>{flag}</Text>
                  <View style={s.langOptionInfo}>
                    <Text style={[s.langOptionTitle, language === lang && s.langOptionTitleActive]}>{title}</Text>
                    <Text style={s.langOptionDesc}>{desc}</Text>
                  </View>
                  {language === lang ? <View style={s.langCheck}><MaterialIcons name="check" size={16} color="#FFF" /></View> : null}
                </Pressable>
              ))}
            </View>
            <View style={s.ctaContainer}>
              <Pressable style={({ pressed }) => [s.ctaPrimary, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={goNext}>
                <Text style={s.ctaPrimaryText}>{fr ? 'Continuer' : 'Continue'}</Text>
                <MaterialIcons name="arrow-forward" size={20} color="#0F172A" />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================
  // STEP 2: PROMISE ("Votre vrai niveau, enfin")
  // ============================================
  if (step === 2) {
    return (
      <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.fullScreen}>
        <SafeAreaView style={s.fullScreen}>
          <View style={s.pageContainer}>
            <Image source={require('@/assets/images/logo-ultimate-petanque.png')} style={s.promiseLogo} contentFit="contain" transition={200} />
            <Text style={s.promiseTitle}>{fr ? 'Votre vrai niveau, enfin.' : 'Your real level, finally.'}</Text>
            <Text style={s.promiseSubtitle}>
              {fr ? "La petanque, ce n'est pas juste un score.\nC'est des parties reelles, des rencontres, et du plaisir." : "Petanque is not just a score.\nIt is real games, encounters, and fun."}
            </Text>
            <View style={s.promiseHighlight}>
              <MaterialIcons name="gps-fixed" size={16} color="#FCD34D" />
              <Text style={s.promiseHighlightText}>
                {fr ? "Enfin un outil pour evaluer votre niveau reel, a l'echelle locale comme mondiale." : 'Finally a tool to evaluate your real level, from local to global scale.'}
              </Text>
            </View>
            {[
              { icon: 'diamond', color: '#8B5CF6', title: 'ELO + Trust Score', items: [fr ? 'Classement equitable et coherent' : 'Fair and consistent ranking', fr ? 'Chaque partie compte' : 'Every game counts'] },
              { icon: 'people', color: '#10B981', title: fr ? 'La communaute lui donne vie' : 'The community brings it to life', items: [fr ? 'Joueurs actifs et parties reelles' : 'Active players and real games', fr ? 'Donnees qui ont du sens' : 'Data that matters'] },
            ].map((p, i) => (
              <View key={i} style={[s.pillar, { borderLeftColor: p.color }]}>
                <View style={s.pillarHeader}>
                  <View style={[s.pillarIcon, { backgroundColor: p.color + '20' }]}><MaterialIcons name={p.icon as any} size={16} color={p.color} /></View>
                  <Text style={[s.pillarTitle, { color: p.color }]}>{p.title}</Text>
                </View>
                {p.items.map((item, j) => (
                  <View key={j} style={s.pillarItem}><MaterialIcons name="check" size={12} color={p.color} /><Text style={s.pillarItemText}>{item}</Text></View>
                ))}
              </View>
            ))}
            <View style={s.ctaContainer}>
              <Pressable style={({ pressed }) => [s.ctaPrimary, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={goNext}>
                <Text style={s.ctaPrimaryText}>{fr ? "Decouvrir l'application" : 'Discover the app'}</Text>
                <MaterialIcons name="arrow-forward" size={20} color="#0F172A" />
              </Pressable>
              {user ? null : (
                <Pressable style={s.ctaSecondary} onPress={async () => { await AsyncStorage.setItem(ONBOARDING_KEY, 'true'); router.replace('/login'); }}>
                  <Text style={s.ctaSecondaryText}>{fr ? "J'ai deja un compte" : 'I already have an account'}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================
  // STEP 3: SPONSOR / AMBASSADOR
  // ============================================
  if (step === 3 && featuredEntity) {
    const entity = featuredEntity;
    const isSponsor = entityType === 'sponsor';
    const accentColor = isSponsor ? '#F59E0B' : '#A78BFA';
    const gradientColors = isSponsor ? ['#FFFBEB', '#FEF3C7'] : ['#EDE9FE', '#DDD6FE'];
    const darkAccent = isSponsor ? '#78350F' : '#4C1D95';
    const labelText = isSponsor ? (fr ? 'PARTENAIRE OFFICIEL' : 'OFFICIAL PARTNER') : (fr ? 'AMBASSADEUR ELITE' : 'ELITE AMBASSADOR');
    const badgeIcon = isSponsor ? 'workspace-premium' : 'military-tech';
    const messageText = isSponsor
      ? (fr ? `${entity.displayName} soutient la communaute des joueurs de petanque et rend cette application possible. Merci !` : `${entity.displayName} supports the petanque community and makes this app possible. Thank you!`)
      : (fr ? `${entity.displayName} est un ambassadeur Elite de la communaute. Suivez-le pour des defis, conseils et contenus exclusifs !` : `${entity.displayName} is an Elite ambassador of the community. Follow for challenges, tips and exclusive content!`);
    const socials: { icon: string; color: string; label: string; url: string; platform: string }[] = [];
    if (entity.websiteUrl) socials.push({ icon: 'language', color: '#60A5FA', label: fr ? 'Site web' : 'Website', url: entity.websiteUrl, platform: 'website' });
    if (entity.youtubeUrl) socials.push({ icon: 'play-circle-filled', color: '#FF0000', label: 'YouTube', url: entity.youtubeUrl, platform: 'youtube' });
    if (entity.instagramHandle) socials.push({ icon: 'camera-alt', color: '#E4405F', label: 'Instagram', url: `https://instagram.com/${entity.instagramHandle}`, platform: 'instagram' });
    if (entity.tiktokUrl) socials.push({ icon: 'music-note', color: '#000', label: 'TikTok', url: entity.tiktokUrl, platform: 'tiktok' });

    return (
      <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.fullScreen}>
        <SafeAreaView style={s.fullScreen}>
          <View style={s.screenHeader}>
            <Pressable onPress={goBack} hitSlop={12}><MaterialIcons name="arrow-back" size={24} color="#94A3B8" /></Pressable>
            <ProgressDots current={DOT_INDEX[3] ?? 1} total={TOTAL_DOTS} />
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={s.sponsorLabelRow}>
              <View style={[s.sponsorLabelLine, { backgroundColor: accentColor + '40' }]} />
              <View style={[s.sponsorLabelBadge, { backgroundColor: accentColor + '20', borderColor: accentColor + '40' }]}>
                <MaterialIcons name={badgeIcon as any} size={14} color={accentColor} />
                <Text style={[s.sponsorLabelText, { color: accentColor }]}>{labelText}</Text>
              </View>
              <View style={[s.sponsorLabelLine, { backgroundColor: accentColor + '40' }]} />
            </View>
            <View style={[s.sponsorCard, { borderColor: accentColor + '30' }]}>
              <View style={s.sponsorCardTop}>
                <View style={[s.sponsorPhotoWrap, { borderColor: accentColor }]}>
                  {entity.photo ? (
                    <Image source={{ uri: entity.photo }} style={s.sponsorPhoto} contentFit="cover" transition={300} />
                  ) : (
                    <LinearGradient colors={isSponsor ? ['#B45309', '#F59E0B'] : ['#7C3AED', '#9333EA']} style={s.sponsorPhotoFallback}><MaterialIcons name={badgeIcon as any} size={32} color="#FFF" /></LinearGradient>
                  )}
                </View>
                <View style={s.sponsorCardNameCol}>
                  <Text style={s.sponsorCardName}>{entity.displayName}</Text>
                  {entity.bio ? <Text style={s.sponsorCardBio} numberOfLines={2}>{entity.bio}</Text> : null}
                </View>
              </View>
              <LinearGradient colors={gradientColors as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.sponsorMsgBox}>
                <View style={[s.sponsorMsgAccent, { backgroundColor: accentColor }]} />
                <MaterialIcons name="format-quote" size={16} color={accentColor} style={{ opacity: 0.4 }} />
                <Text style={[s.sponsorMsgText, { color: darkAccent }]}>{messageText}</Text>
              </LinearGradient>
              {socials.length > 0 ? (
                <View style={s.sponsorSocialsRow}>
                  {socials.map((sc, i) => (
                    <Pressable key={i} style={({ pressed }) => [s.sponsorSocialBtn, pressed && { opacity: 0.8 }]} onPress={() => { trackAmbassadorEvent(entity.id, 'social_click', sc.platform, { sourcePage: 'onboarding' }); Linking.openURL(sc.url); }}>
                      <MaterialIcons name={sc.icon as any} size={16} color={sc.color} /><Text style={s.sponsorSocialLabel}>{sc.label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={s.ctaContainer}>
              <Pressable style={({ pressed }) => [s.ctaPrimary, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={() => { trackAmbassadorEvent(entity.id, 'banner_impression', undefined, { sourcePage: 'onboarding' }); goNext(); }}>
                <Text style={s.ctaPrimaryText}>{fr ? 'Continuer' : 'Continue'}</Text><MaterialIcons name="arrow-forward" size={20} color="#0F172A" />
              </Pressable>
              <Pressable style={s.ctaSecondary} onPress={goNext}><Text style={s.ctaSecondaryText}>{fr ? 'Passer' : 'Skip'}</Text></Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================
  // STEP 4: ELO LEAGUES SYSTEM
  // ============================================
  if (step === 4) {
    const tiersToShow = [...LEAGUE_TIERS].reverse(); // Bronze first
    return (
      <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.fullScreen}>
        <SafeAreaView style={s.fullScreen}>
          <View style={s.screenHeader}>
            <Pressable onPress={goBack} hitSlop={12}><MaterialIcons name="arrow-back" size={24} color="#94A3B8" /></Pressable>
            <ProgressDots current={DOT_INDEX[4] ?? 2} total={TOTAL_DOTS} />
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: '#9333EA18', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <MaterialIcons name="leaderboard" size={28} color="#9333EA" />
              </View>
              <Text style={s.pageTitle}>{fr ? 'Systeme de Ligues ELO' : 'ELO League System'}</Text>
              <Text style={s.pageSubtitle}>{fr ? 'Chaque match fait varier ton ELO. Progresse a travers 6 ligues.' : 'Every match changes your ELO. Progress through 6 leagues.'}</Text>
            </View>
            <View style={[s.infoTeaser, { borderColor: '#F59E0B25' }]}>
              <MaterialIcons name="science" size={14} color="#F59E0B" />
              <Text style={s.infoTeaserText}>{fr ? 'Tes 10 premiers matchs sont une phase de calibration. Ton ELO varie plus vite.' : 'Your first 10 matches are a calibration phase. Your ELO changes faster.'}</Text>
            </View>
            <View style={{ gap: 6, marginBottom: 12 }}>
              {tiersToShow.map((tier) => {
                const rangeLabel = tier.maxElo === Infinity ? `${tier.minElo}+` : `${tier.minElo} - ${tier.maxElo}`;
                return (
                  <View key={tier.id} style={[s.featureRow, { borderLeftWidth: 3, borderLeftColor: tier.color, paddingVertical: 10 }]}>
                    <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: tier.color + '15' }}>
                      <Text style={{ fontSize: 18 }}>{tier.emblem}</Text>
                    </View>
                    <View style={s.featureInfo}>
                      <Text style={[s.featureTitle, { color: tier.color }]}>{fr ? tier.name.fr : tier.name.en}</Text>
                      <Text style={s.featureDesc}>{rangeLabel} ELO</Text>
                    </View>
                  </View>
                );
              })}
            </View>
            <View style={s.ctaContainer}>
              <Pressable style={({ pressed }) => [s.ctaPrimary, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={goNext}>
                <Text style={s.ctaPrimaryText}>{fr ? 'Continuer' : 'Continue'}</Text><MaterialIcons name="arrow-forward" size={20} color="#0F172A" />
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================
  // STEP 5: TRUSTSCORE & ANTI-TRICHE (NEW)
  // ============================================
  if (step === 5) {
    return (
      <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.fullScreen}>
        <SafeAreaView style={s.fullScreen}>
          <View style={s.screenHeader}>
            <Pressable onPress={goBack} hitSlop={12}><MaterialIcons name="arrow-back" size={24} color="#94A3B8" /></Pressable>
            <ProgressDots current={DOT_INDEX[5] ?? 3} total={TOTAL_DOTS} />
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: 'center', marginBottom: 12 }}>
              <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: '#22C55E18', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                <MaterialIcons name="verified-user" size={28} color="#22C55E" />
              </View>
              <Text style={s.pageTitle}>{fr ? 'TrustScore & Anti-triche' : 'TrustScore & Anti-cheat'}</Text>
              <Text style={s.pageSubtitle}>{fr ? 'Un systeme avance qui garantit un classement fiable et equitable pour tous.' : 'An advanced system ensuring a reliable and fair ranking for everyone.'}</Text>
            </View>

            {/* Reassurance card */}
            <View style={[s.trustCard, { borderColor: '#22C55E25' }]}>
              <View style={s.trustCardHeader}>
                <MaterialIcons name="shield" size={18} color="#22C55E" />
                <Text style={s.trustCardTitle}>{fr ? 'Comment ca fonctionne ?' : 'How does it work?'}</Text>
              </View>
              <Text style={s.trustCardDesc}>
                {fr
                  ? 'Chaque joueur a un score de confiance (0-100). Plus il est eleve, plus les resultats sont fiables. Les tricheurs sont automatiquement detectes.'
                  : 'Every player has a trust score (0-100). The higher it is, the more reliable the results. Cheaters are automatically detected.'}
              </Text>
            </View>

            {/* Trust factors */}
            {[
              { icon: 'people', color: '#3B82F6', title: fr ? 'Temoins de matchs' : 'Match witnesses', desc: fr ? 'Invite tes adversaires a confirmer les resultats' : 'Invite opponents to confirm results' },
              { icon: 'trending-up', color: '#F59E0B', title: fr ? 'Coherence des stats' : 'Stats consistency', desc: fr ? 'Des performances credibles et constantes' : 'Credible and consistent performances' },
              { icon: 'devices', color: '#8B5CF6', title: fr ? 'Detection multi-comptes' : 'Multi-account detection', desc: fr ? 'Un joueur = un compte, garanti' : 'One player = one account, guaranteed' },
              { icon: 'lock', color: '#10B981', title: fr ? 'Donnees protegees' : 'Protected data', desc: fr ? 'Aucune manipulation possible des resultats' : 'No manipulation of results possible' },
            ].map((item, i) => (
              <View key={i} style={s.featureRow}>
                <View style={[s.featureIconWrap, { backgroundColor: item.color + '18' }]}>
                  <MaterialIcons name={item.icon as any} size={20} color={item.color} />
                </View>
                <View style={s.featureInfo}>
                  <Text style={s.featureTitle}>{item.title}</Text>
                  <Text style={s.featureDesc}>{item.desc}</Text>
                </View>
              </View>
            ))}

            {/* Reassurance */}
            <View style={[s.infoTeaser, { borderColor: '#22C55E25', backgroundColor: '#22C55E08' }]}>
              <MaterialIcons name="emoji-events" size={14} color="#22C55E" />
              <Text style={[s.infoTeaserText, { color: '#86EFAC' }]}>
                {fr ? 'Resultat : un classement ou chaque joueur a sa vraie place, et ou la triche est impossible.' : 'Result: a ranking where every player has their real position, and cheating is impossible.'}
              </Text>
            </View>

            <View style={s.ctaContainer}>
              <Pressable style={({ pressed }) => [s.ctaPrimary, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={goNext}>
                <Text style={s.ctaPrimaryText}>{fr ? 'Continuer' : 'Continue'}</Text><MaterialIcons name="arrow-forward" size={20} color="#0F172A" />
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================
  // STEP 6: FEATURES ("Tout pour ta pétanque")
  // ============================================
  if (step === 6) {
    return (
      <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.fullScreen}>
        <SafeAreaView style={s.fullScreen}>
          <View style={s.screenHeader}>
            <Pressable onPress={goBack} hitSlop={12}><MaterialIcons name="arrow-back" size={24} color="#94A3B8" /></Pressable>
            <ProgressDots current={DOT_INDEX[6] ?? 4} total={TOTAL_DOTS} />
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={s.pageTitle}>{fr ? 'Tout pour ta petanque' : 'Everything for your game'}</Text>
            <Text style={s.pageSubtitle}>{fr ? 'Une app complete pour suivre, progresser et partager.' : 'A complete app to track, improve and share.'}</Text>

            {/* Core features */}
            {[
              { icon: 'sports', color: '#60A5FA', title: fr ? 'Enregistre tes matchs' : 'Record your matches', desc: fr ? 'Score, tirs, carreaux et stats detaillees.' : 'Score, shots, carreaux and detailed stats.' },
              { icon: 'bar-chart', color: '#10B981', title: fr ? 'Analyse ta progression' : 'Track your progress', desc: fr ? 'Taux de tir, win rate, evolution semaine par semaine.' : 'Shot rate, win rate, weekly evolution.' },
              { icon: 'emoji-events', color: '#F59E0B', title: fr ? 'Gagne des badges & XP' : 'Earn badges & XP', desc: fr ? 'Debloque des badges et entre dans le classement.' : 'Unlock badges and enter the leaderboard.' },
            ].map((f, i) => (
              <View key={i} style={s.featureRow}>
                <View style={[s.featureIconWrap, { backgroundColor: f.color + '18' }]}><MaterialIcons name={f.icon as any} size={20} color={f.color} /></View>
                <View style={s.featureInfo}><Text style={s.featureTitle}>{f.title}</Text><Text style={s.featureDesc}>{f.desc}</Text></View>
              </View>
            ))}

            {/* Sharing distinction: teammates vs social */}
            <View style={s.sharingSection}>
              <Text style={s.sharingSectionTitle}>{fr ? 'Deux facons de partager' : 'Two ways to share'}</Text>
              <View style={[s.sharingCard, { borderLeftColor: '#3B82F6' }]}>
                <View style={[s.sharingCardIcon, { backgroundColor: '#3B82F615' }]}><MaterialIcons name="group-add" size={18} color="#3B82F6" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sharingCardTitle, { color: '#93C5FD' }]}>{fr ? 'Partage equipiers' : 'Teammate sharing'}</Text>
                  <Text style={s.sharingCardDesc}>
                    {fr ? 'Tes partenaires acceptent en 1 tap. Les stats de tout le monde sont mises a jour automatiquement.' : 'Partners accept in 1 tap. Everyone stats are updated automatically.'}
                  </Text>
                </View>
              </View>
              <View style={[s.sharingCard, { borderLeftColor: '#EC4899' }]}>
                <View style={[s.sharingCardIcon, { backgroundColor: '#EC489915' }]}><MaterialIcons name="camera-alt" size={18} color="#EC4899" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.sharingCardTitle, { color: '#F9A8D4' }]}>{fr ? 'Reseaux sociaux' : 'Social media'}</Text>
                  <Text style={s.sharingCardDesc}>
                    {fr ? 'Partage tes bons coups avec la communaute : cartes visuelles pour Instagram, TikTok, etc.' : 'Share your best plays with the community: visual cards for Instagram, TikTok, etc.'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={s.ctaContainer}>
              <Pressable style={({ pressed }) => [s.ctaPrimary, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={goNext}>
                <Text style={s.ctaPrimaryText}>{fr ? 'Continuer' : 'Continue'}</Text><MaterialIcons name="arrow-forward" size={20} color="#0F172A" />
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================
  // STEP 7: MAP ("Des joueurs près de chez toi")
  // ============================================
  if (step === 7) {
    const mapFeatures = [
      { icon: 'place', color: '#10B981', label: fr ? 'Terrains pres de toi' : 'Courts near you' },
      { icon: 'local-fire-department', color: '#EF4444', label: fr ? 'Terrains actifs maintenant' : 'Active courts right now' },
      { icon: 'people', color: '#3B82F6', label: fr ? 'Joueurs a proximite' : 'Nearby players' },
      { icon: 'location-city', color: '#F59E0B', label: fr ? 'Clubs de ta region' : 'Local clubs' },
      { icon: 'event', color: '#EC4899', label: fr ? 'Rencontres & meetups' : 'Meetups & events' },
    ];
    return (
      <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.fullScreen}>
        <SafeAreaView style={s.fullScreen}>
          <View style={s.screenHeader}>
            <Pressable onPress={goBack} hitSlop={12}><MaterialIcons name="arrow-back" size={24} color="#94A3B8" /></Pressable>
            <ProgressDots current={DOT_INDEX[7] ?? 5} total={TOTAL_DOTS} />
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <Text style={s.pageTitle}>{fr ? 'Des joueurs pres de chez toi' : 'Players near you'}</Text>
            <Text style={s.pageSubtitle}>{fr ? "L'application a besoin de sa communaute ! Plus tu partages, plus tu trouves." : 'The app needs its community! The more you share, the more you find.'}</Text>

            <View style={s.mapCard}>
              <View style={s.mapCardInner}>
                <View style={s.mapIconRow}>
                  <View style={s.mapMainIcon}><MaterialIcons name="map" size={44} color="#1E3A8A" /></View>
                  <View style={s.mapPinFloat1}><MaterialIcons name="place" size={16} color="#10B981" /></View>
                  <View style={s.mapPinFloat2}><MaterialIcons name="person-pin" size={14} color="#3B82F6" /></View>
                  <View style={s.mapPinFloat3}><MaterialIcons name="flag" size={12} color="#F59E0B" /></View>
                </View>
              </View>
            </View>

            <View style={s.mapFeaturesList}>
              {mapFeatures.map((f, i) => (
                <View key={i} style={s.mapFeatureItem}>
                  <View style={[s.mapFeatureIcon, { backgroundColor: f.color + '18' }]}><MaterialIcons name={f.icon as any} size={16} color={f.color} /></View>
                  <Text style={s.mapFeatureLabel}>{f.label}</Text>
                </View>
              ))}
            </View>

            <View style={s.communityCallCard}>
              <View style={s.communityCallHeader}>
                <MaterialIcons name="volunteer-activism" size={16} color="#F59E0B" />
                <Text style={s.communityCallTitle}>{fr ? 'Aide la communaute' : 'Help the community'}</Text>
              </View>
              <View style={s.communityTipsList}>
                {[
                  { icon: 'person', color: '#3B82F6', text: fr ? 'Rends ta fiche joueur publique' : 'Make your player card public' },
                  { icon: 'place', color: '#10B981', text: fr ? 'Partage tes terrains avec adresse precise' : 'Share your courts with exact address' },
                  { icon: 'groups', color: '#F59E0B', text: fr ? 'Ajoute ton club avec toutes les infos' : 'Add your club with all details' },
                ].map((tip, i) => (
                  <View key={i} style={s.communityTipRow}>
                    <View style={[s.communityTipIcon, { backgroundColor: tip.color + '18' }]}><MaterialIcons name={tip.icon as any} size={13} color={tip.color} /></View>
                    <Text style={s.communityTipText}>{tip.text}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={s.ctaContainer}>
              <Pressable style={({ pressed }) => [s.ctaPrimary, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={goNext}>
                <Text style={s.ctaPrimaryText}>{fr ? 'Continuer' : 'Continue'}</Text><MaterialIcons name="arrow-forward" size={20} color="#0F172A" />
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================
  // STEP 8: LOGIN CTA ("Prêt à jouer?")
  // ============================================
  if (step === 8) {
    return (
      <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.fullScreen}>
        <SafeAreaView style={s.fullScreen}>
          <View style={s.screenHeader}>
            <Pressable onPress={goBack} hitSlop={12}><MaterialIcons name="arrow-back" size={24} color="#94A3B8" /></Pressable>
            <ProgressDots current={DOT_INDEX[8] ?? 6} total={TOTAL_DOTS} />
            <View style={{ width: 24 }} />
          </View>
          <View style={s.pageContainer}>
            <View style={{ alignItems: 'center' }}>
              <MaterialIcons name="rocket-launch" size={36} color="#60A5FA" style={{ marginBottom: 10 }} />
              <Text style={s.pageTitle}>{fr ? 'Pret a jouer ?' : 'Ready to play?'}</Text>
              <Text style={s.pageSubtitle}>{fr ? 'Cree ton compte gratuit pour sauvegarder tes stats et rejoindre la communaute.' : 'Create your free account to save your stats and join the community.'}</Text>
            </View>
            <View style={s.benefitsList}>
              {[
                { icon: 'save', text: fr ? 'Garder ton historique de matchs' : 'Keep your match history' },
                { icon: 'leaderboard', text: fr ? 'Apparaitre dans le classement' : 'Appear in the leaderboard' },
                { icon: 'group-add', text: fr ? 'Recevoir les matchs partages' : 'Receive shared matches' },
                { icon: 'map', text: fr ? 'Trouver des joueurs pres de toi' : 'Find players near you' },
                { icon: 'military-tech', text: fr ? 'Debloquer des badges et XP' : 'Unlock badges and XP' },
              ].map((b, i) => (
                <View key={i} style={s.benefitItem}>
                  <View style={s.benefitIconWrap}><MaterialIcons name={b.icon as any} size={14} color="#10B981" /></View>
                  <Text style={s.benefitText}>{b.text}</Text>
                </View>
              ))}
            </View>
            <View style={s.ctaContainer}>
              {user ? (
                <Pressable style={({ pressed }) => [s.ctaPrimary, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={() => goTo(9 as Step)}>
                  <MaterialIcons name="person" size={20} color="#0F172A" /><Text style={s.ctaPrimaryText}>{fr ? 'Terminer mon profil' : 'Complete my profile'}</Text>
                </Pressable>
              ) : (
                <Pressable style={({ pressed }) => [s.ctaPrimary, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={() => router.replace('/login')}>
                  <MaterialIcons name="email" size={20} color="#0F172A" /><Text style={s.ctaPrimaryText}>{fr ? 'Creer mon compte' : 'Create my account'}</Text>
                </Pressable>
              )}
              <Pressable style={s.ctaSecondary} onPress={async () => {
                await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
                showAlert(fr ? 'Bienvenue !' : 'Welcome!', fr ? 'Vous pouvez creer un compte plus tard depuis votre profil.' : 'You can create an account later from your profile.');
                router.replace('/(tabs)');
              }}>
                <Text style={s.ctaSecondaryText}>{fr ? 'Pas maintenant' : 'Not now'}</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================
  // STEP 9: EXPRESS PROFILE
  // ============================================
  if (step === 9) {
    const roles = [
      { id: 'Tireur' as PlayerRole, icon: 'gps-fixed', label: fr ? 'Tireur' : 'Shooter' },
      { id: 'Pointeur' as PlayerRole, icon: 'adjust', label: fr ? 'Pointeur' : 'Pointer' },
      { id: 'Milieu' as PlayerRole, icon: 'swap-horiz', label: fr ? 'Milieu' : 'Middle' },
    ];
    const emailName = user?.email ? user.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) : '';
    if (!username && emailName) setUsername(emailName);

    return (
      <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.fullScreen}>
        <SafeAreaView style={s.fullScreen}>
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.screenHeader}>
              <Pressable onPress={() => goTo(8 as Step)} hitSlop={12}><MaterialIcons name="arrow-back" size={24} color="#94A3B8" /></Pressable>
              <ProgressDots current={6} total={TOTAL_DOTS} />
              <View style={{ width: 24 }} />
            </View>
            <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.pageTitle}>{fr ? 'Derniere touche' : 'Final touch'}</Text>
              <Text style={s.pageSubtitle}>{fr ? 'Ton nom, ta ville et ton poste de jeu.' : 'Your name, city, and play position.'}</Text>

              <View style={s.expressSection}>
                <Text style={s.expressLabel}>{fr ? 'TON NOM' : 'YOUR NAME'}</Text>
                <TextInput style={s.expressInput} value={username} onChangeText={setUsername} placeholder={fr ? 'Ton nom ou pseudo' : 'Your name or nickname'} placeholderTextColor="#475569" autoFocus autoCapitalize="words" autoCorrect={false} maxLength={30} />
              </View>

              <View style={s.expressSection}>
                <Text style={s.expressLabel}>{t('onboarding', 'cityRequired')}</Text>
                <View style={s.locationPickerWrap}>
                  <LocationPicker label="" value={profileLocation} onChange={setProfileLocation} placeholder={fr ? 'Rechercher ta ville...' : 'Search your city...'} showCityOnly />
                </View>
                {profileLocation.city ? (
                  <View style={s.locationConfirm}><MaterialIcons name="check-circle" size={14} color="#10B981" /><Text style={s.locationConfirmText}>{profileLocation.city}{profileLocation.country && profileLocation.country !== 'France' ? `, ${profileLocation.country}` : ''}</Text></View>
                ) : (
                  <Text style={s.locationHint}>{t('onboarding', 'cityRequiredHint')}</Text>
                )}
              </View>

              <View style={s.expressSection}>
                <Text style={s.expressLabel}>{fr ? 'TU ES PLUTOT' : 'YOU ARE'}</Text>
                <View style={s.roleRow}>
                  {roles.map(r => (
                    <Pressable key={r.id} style={[s.roleBtn, role === r.id && s.roleBtnActive]} onPress={() => { Haptics.selectionAsync(); setRole(r.id); }}>
                      <MaterialIcons name={r.icon as any} size={24} color={role === r.id ? '#FFF' : '#94A3B8'} />
                      <Text style={[s.roleBtnText, role === r.id && s.roleBtnTextActive]}>{r.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={s.ctaContainer}>
                <Pressable
                  style={[s.ctaPrimary, (!username.trim() || username.trim().length < 2 || !profileLocation.city?.trim()) && { opacity: 0.4 }]}
                  onPress={handleComplete}
                  disabled={!username.trim() || username.trim().length < 2 || !profileLocation.city?.trim() || saving}
                >
                  {saving ? <ActivityIndicator color="#0F172A" /> : (
                    <><MaterialIcons name="arrow-forward" size={20} color="#0F172A" /><Text style={s.ctaPrimaryText}>{fr ? 'Continuer' : 'Continue'}</Text></>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // ============================================
  // STEP 10: REFERRAL
  // ============================================
  if (step === 10) {
    return (
      <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.fullScreen}>
        <SafeAreaView style={s.fullScreen}>
          <View style={s.screenHeader}>
            <Pressable onPress={() => goTo(9 as Step)} hitSlop={12}><MaterialIcons name="arrow-back" size={24} color="#94A3B8" /></Pressable>
            <ProgressDots current={6} total={TOTAL_DOTS} />
            <View style={{ width: 24 }} />
          </View>
          <ScrollView contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={{ alignItems: 'center' }}>
              <View style={s.referralIconWrap}><MaterialIcons name="group-add" size={36} color="#EC4899" /></View>
              <Text style={s.pageTitle}>{fr ? 'Invite tes amis !' : 'Invite your friends!'}</Text>
              <Text style={s.pageSubtitle}>{fr ? 'Partage ton code et gagne des XP pour chaque ami.' : 'Share your code and earn XP for every friend.'}</Text>
            </View>

            <View style={s.referralCard}>
              <Text style={s.referralCardLabel}>{fr ? 'TON CODE DE PARRAINAGE' : 'YOUR REFERRAL CODE'}</Text>
              {referralLoading ? <ActivityIndicator color="#EC4899" style={{ marginVertical: 16 }} /> : (
                <View style={s.referralCodeBox}><Text style={s.referralCodeText}>{referralCode || '...'}</Text></View>
              )}
              <View style={s.referralRewards}>
                {[
                  { icon: 'star', color: '#F59E0B', text: fr ? '+50 XP par ami invite' : '+50 XP per invited friend' },
                  { icon: 'emoji-events', color: '#7C3AED', text: fr ? 'Debloquer le badge Parrain' : 'Unlock the Referrer badge' },
                  { icon: 'trending-up', color: '#10B981', text: fr ? 'Monter dans le classement' : 'Climb the leaderboard' },
                ].map((r, i) => (
                  <View key={i} style={s.referralRewardItem}><MaterialIcons name={r.icon as any} size={14} color={r.color} /><Text style={s.referralRewardText}>{r.text}</Text></View>
                ))}
              </View>
            </View>

            <View style={s.ctaContainer}>
              <Pressable style={({ pressed }) => [s.referralShareBtn, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={handleShareReferral}>
                <MaterialIcons name="share" size={18} color="#FFF" /><Text style={s.referralShareBtnText}>{fr ? 'Partager mon code' : 'Share my code'}</Text>
              </Pressable>
              <Pressable style={({ pressed }) => [s.ctaPrimary, { marginTop: 8 }, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]} onPress={handleFinalComplete}>
                <MaterialIcons name="rocket-launch" size={20} color="#0F172A" /><Text style={s.ctaPrimaryText}>{fr ? "C'est parti !" : "Let's go!"}</Text>
              </Pressable>
              <Pressable style={s.ctaSecondary} onPress={handleFinalComplete}><Text style={s.ctaSecondaryText}>{fr ? 'Plus tard' : 'Later'}</Text></Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return null;
}

// ============================================
// STYLES
// ============================================
const s = StyleSheet.create({
  fullScreen: { flex: 1 },

  // Splash
  splashContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  splashImage: { width: 260, height: 260 },
  splashTitle: { fontSize: 26, fontWeight: '700', color: '#FFF', marginTop: 16, letterSpacing: 1 },
  splashTitleHidden: { display: 'none' },

  // Progress dots
  progressDots: { flexDirection: 'row', gap: 6 },
  progressDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#334155' },
  progressDotActive: { backgroundColor: '#F59E0B', width: 20 },
  progressDotDone: { backgroundColor: '#60A5FA' },

  // Screen header
  screenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },

  // Shared scroll content
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 },

  // Page container (non-scrollable pages)
  pageContainer: { flex: 1, paddingHorizontal: 24, paddingBottom: 32, paddingTop: 8 },

  // Page titles
  pageTitle: { fontSize: 22, fontWeight: '700', color: '#FFF', textAlign: 'center', marginBottom: 6 },
  pageSubtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 19, marginBottom: 16 },

  // CTA
  ctaContainer: { width: '100%', marginTop: 'auto' as any, paddingTop: 12 },
  ctaPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#F59E0B', paddingVertical: 16, borderRadius: 14, marginBottom: 8 },
  ctaPrimaryText: { fontSize: 16, fontWeight: '700', color: '#0F172A' },
  ctaSecondary: { paddingVertical: 12, alignItems: 'center' },
  ctaSecondaryText: { fontSize: 14, color: '#64748B', fontWeight: '500' },

  // Language
  langContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 32, paddingTop: 32 },
  langLogo: { width: 360, height: 360, marginBottom: 8 },
  langHeader: { alignItems: 'center', marginBottom: 32, gap: 8 },
  langTitle: { fontSize: 24, fontWeight: '700', color: '#FFF', textAlign: 'center' },
  langSubtitle: { fontSize: 15, color: '#94A3B8', textAlign: 'center' },
  langOptions: { width: '100%', gap: 12, marginBottom: 32 },
  langOption: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 16, padding: 16, gap: 14, borderWidth: 2, borderColor: 'transparent' },
  langOptionActive: { borderColor: '#60A5FA', backgroundColor: '#60A5FA10' },
  langFlag: { fontSize: 32 },
  langOptionInfo: { flex: 1 },
  langOptionTitle: { fontSize: 18, fontWeight: '700', color: '#CBD5E1', marginBottom: 2 },
  langOptionTitleActive: { color: '#FFF' },
  langOptionDesc: { fontSize: 12, color: '#64748B' },
  langCheck: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#60A5FA', alignItems: 'center', justifyContent: 'center' },

  // Promise
  promiseLogo: { width: 180, height: 180, marginBottom: 8, alignSelf: 'center' },
  promiseTitle: { fontSize: 24, fontWeight: '800', color: '#FFF', textAlign: 'center', marginBottom: 6 },
  promiseSubtitle: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 19, marginBottom: 12, paddingHorizontal: 8 },
  promiseHighlight: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F59E0B10', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, width: '100%', borderWidth: 1, borderColor: '#F59E0B25' },
  promiseHighlightText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#FCD34D', lineHeight: 17 },
  pillar: { width: '100%', backgroundColor: '#1E293B', borderRadius: 12, padding: 12, marginBottom: 8, borderLeftWidth: 3 },
  pillarHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  pillarIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pillarTitle: { fontSize: 13, fontWeight: '700' },
  pillarItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2 },
  pillarItemText: { fontSize: 12, color: '#CBD5E1', fontWeight: '500' },

  // Sponsor
  sponsorLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 16 },
  sponsorLabelLine: { width: 28, height: 1 },
  sponsorLabelBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  sponsorLabelText: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  sponsorCard: { width: '100%', backgroundColor: '#1E293B', borderRadius: 20, padding: 18, borderWidth: 1, marginBottom: 20, gap: 14 },
  sponsorCardTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sponsorPhotoWrap: { position: 'relative', width: 64, height: 64, borderRadius: 20, borderWidth: 2, overflow: 'hidden' },
  sponsorPhoto: { width: '100%', height: '100%' },
  sponsorPhotoFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  sponsorCardNameCol: { flex: 1 },
  sponsorCardName: { fontSize: 18, fontWeight: '800', color: '#FFF', marginBottom: 3 },
  sponsorCardBio: { fontSize: 12, color: '#94A3B8', lineHeight: 16 },
  sponsorMsgBox: { borderRadius: 12, padding: 12, gap: 4, position: 'relative', overflow: 'hidden' },
  sponsorMsgAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  sponsorMsgText: { fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
  sponsorSocialsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sponsorSocialBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#0F172A', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#334155' },
  sponsorSocialLabel: { fontSize: 12, fontWeight: '600', color: '#CBD5E1' },

  // Feature rows (shared)
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#1E293B', borderRadius: 12, padding: 12, gap: 10, marginBottom: 6 },
  featureIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  featureInfo: { flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: '700', color: '#FFF', marginBottom: 2 },
  featureDesc: { fontSize: 11, color: '#94A3B8', lineHeight: 16 },

  // Info teaser
  infoTeaser: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F59E0B10', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, gap: 8, width: '100%', borderWidth: 1 },
  infoTeaserText: { fontSize: 11, color: '#FCD34D', flex: 1, lineHeight: 16 },

  // TrustScore
  trustCard: { width: '100%', backgroundColor: '#1E293B', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1 },
  trustCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  trustCardTitle: { fontSize: 14, fontWeight: '700', color: '#86EFAC' },
  trustCardDesc: { fontSize: 12, color: '#94A3B8', lineHeight: 18 },

  // Sharing section (Features page)
  sharingSection: { marginTop: 8, marginBottom: 8 },
  sharingSectionTitle: { fontSize: 13, fontWeight: '700', color: '#60A5FA', letterSpacing: 0.3, marginBottom: 8 },
  sharingCard: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#1E293B', borderRadius: 12, padding: 12, gap: 10, marginBottom: 6, borderLeftWidth: 3 },
  sharingCardIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sharingCardTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  sharingCardDesc: { fontSize: 11, color: '#94A3B8', lineHeight: 16 },

  // Map
  mapCard: { width: '100%', backgroundColor: '#1E293B', borderRadius: 18, padding: 2, marginBottom: 12, overflow: 'hidden' },
  mapCardInner: { backgroundColor: '#0F172A20', borderRadius: 16, paddingVertical: 20, alignItems: 'center' },
  mapIconRow: { width: 90, height: 70, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  mapMainIcon: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#60A5FA15', alignItems: 'center', justifyContent: 'center' },
  mapPinFloat1: { position: 'absolute', top: 0, right: 0, width: 28, height: 28, borderRadius: 8, backgroundColor: '#10B98118', alignItems: 'center', justifyContent: 'center' },
  mapPinFloat2: { position: 'absolute', bottom: 2, left: 0, width: 26, height: 26, borderRadius: 8, backgroundColor: '#3B82F618', alignItems: 'center', justifyContent: 'center' },
  mapPinFloat3: { position: 'absolute', top: 6, left: 8, width: 24, height: 24, borderRadius: 7, backgroundColor: '#F59E0B18', alignItems: 'center', justifyContent: 'center' },
  mapFeaturesList: { width: '100%', gap: 6, marginBottom: 10 },
  mapFeatureItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1E293B', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  mapFeatureIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  mapFeatureLabel: { fontSize: 13, fontWeight: '600', color: '#E2E8F0', flex: 1 },

  // Community tips
  communityCallCard: { width: '100%', backgroundColor: '#1E293B', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#F59E0B30' },
  communityCallHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  communityCallTitle: { fontSize: 13, fontWeight: '700', color: '#FCD34D' },
  communityTipsList: { gap: 6 },
  communityTipRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  communityTipIcon: { width: 26, height: 26, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  communityTipText: { fontSize: 12, fontWeight: '600', color: '#E2E8F0', flex: 1 },

  // Benefits (login step)
  benefitsList: { width: '100%', marginBottom: 12, gap: 6 },
  benefitItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#1E293B', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  benefitIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#10B98118', alignItems: 'center', justifyContent: 'center' },
  benefitText: { fontSize: 13, color: '#E2E8F0', fontWeight: '500', flex: 1 },

  // Express profile
  expressSection: { width: '100%', marginBottom: 16 },
  expressLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', letterSpacing: 1, marginBottom: 8 },
  expressInput: { width: '100%', backgroundColor: '#1E293B', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16, fontSize: 17, fontWeight: '500', color: '#E2E8F0' },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: '#1E293B', alignItems: 'center', gap: 4, borderWidth: 2, borderColor: 'transparent' },
  roleBtnActive: { borderColor: '#60A5FA', backgroundColor: '#60A5FA15' },
  roleBtnText: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  roleBtnTextActive: { color: '#60A5FA' },

  // Location picker
  locationPickerWrap: { backgroundColor: '#1E293B', borderRadius: 12, overflow: 'hidden' as const },
  locationConfirm: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginTop: 8 },
  locationConfirmText: { fontSize: 13, fontWeight: '600' as const, color: '#10B981' },
  locationHint: { fontSize: 11, color: '#64748B', marginTop: 6, fontStyle: 'italic' as const },

  // Referral
  referralIconWrap: { width: 64, height: 64, borderRadius: 18, backgroundColor: '#EC489918', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  referralCard: { width: '100%', backgroundColor: '#1E293B', borderRadius: 18, padding: 18, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#EC489930' },
  referralCardLabel: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 1.2, marginBottom: 12 },
  referralCodeBox: { backgroundColor: '#0F172A', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 28, borderWidth: 1.5, borderColor: '#EC489940', borderStyle: 'dashed' as any, marginBottom: 16 },
  referralCodeText: { fontSize: 22, fontWeight: '800', color: '#EC4899', letterSpacing: 2 },
  referralRewards: { width: '100%', gap: 6 },
  referralRewardItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  referralRewardText: { fontSize: 12, color: '#CBD5E1', fontWeight: '500', flex: 1 },
  referralShareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#EC4899', paddingVertical: 16, borderRadius: 14, marginBottom: 4 },
  referralShareBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
});
