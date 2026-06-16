import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { getSupabaseClient } from '@/template';
import { fetchCommunityStats } from '@/services/communityStatsService';

const GOAL = 1000;

interface FeatureDef {
  id: string;
  icon: string;
  color: string;
  labelFr: string;
  labelEn: string;
  descFr: string;
  descEn: string;
}

const FEATURES: FeatureDef[] = [
  {
    id: 'ai_coach',
    icon: 'psychology',
    color: '#7C3AED',
    labelFr: 'Coach IA',
    labelEn: 'AI Coach',
    descFr: 'Analyse de vos stats et conseils personnalises pour progresser.',
    descEn: 'Analysis of your stats and personalized advice to improve.',
  },
  {
    id: 'live_match',
    icon: 'live-tv',
    color: '#DC2626',
    labelFr: 'Match Live',
    labelEn: 'Live Match',
    descFr: 'Suivi en temps reel des matchs pour les spectateurs a distance.',
    descEn: 'Real-time match tracking for remote spectators.',
  },
  {
    id: 'messaging',
    icon: 'chat',
    color: '#10B981',
    labelFr: 'Messagerie',
    labelEn: 'Messaging',
    descFr: 'Chat direct entre joueurs et groupes de club integre.',
    descEn: 'Direct chat between players and integrated club groups.',
  },
  {
    id: 'training_programs',
    icon: 'fitness-center',
    color: '#EA580C',
    labelFr: "Programmes d'entrainement",
    labelEn: 'Training Programs',
    descFr: 'Plans sur 4-8 semaines avec defis quotidiens progressifs.',
    descEn: '4-8 week plans with progressive daily challenges.',
  },

];

// ============================================
// ANIMATED COUNTER (reused pattern)
// ============================================
function AnimatedCounter({ target, duration = 1200 }: { target: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<any>(null);

  useEffect(() => {
    if (target <= 0) { setDisplay(0); return; }
    startTimeRef.current = null;
    const step = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * target));
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  return <Text style={st.progressCount}>{display}</Text>;
}

// ============================================
// FEATURE CARD
// ============================================
const FeatureCard = React.memo(function FeatureCard({
  feature,
  fr,
  votes,
  hasVoted,
  onToggle,
  loading,
}: {
  feature: FeatureDef;
  fr: boolean;
  votes: number;
  hasVoted: boolean;
  onToggle: () => void;
  loading: boolean;
}) {
  return (
    <View style={st.featureCard}>
      <View style={st.featureTop}>
        <View style={[st.featureIconWrap, { backgroundColor: feature.color + '14' }]}>
          <MaterialIcons name={feature.icon as any} size={24} color={feature.color} />
        </View>
        <View style={st.featureInfo}>
          <Text style={st.featureName}>{fr ? feature.labelFr : feature.labelEn}</Text>
          <Text style={st.featureDesc}>{fr ? feature.descFr : feature.descEn}</Text>
        </View>
      </View>
      <View style={st.featureBottom}>
        <View style={st.voteCountWrap}>
          <MaterialIcons name="how-to-vote" size={14} color="#64748B" />
          <Text style={st.voteCountText}>
            {votes} {votes === 1 ? 'vote' : 'votes'}
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            st.voteBtn,
            hasVoted && st.voteBtnActive,
            pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
          ]}
          onPress={onToggle}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color={hasVoted ? '#FFF' : '#2563EB'} />
          ) : (
            <>
              <MaterialIcons
                name={hasVoted ? 'thumb-up' : 'thumb-up-off-alt'}
                size={16}
                color={hasVoted ? '#FFF' : '#2563EB'}
              />
              <Text style={[st.voteBtnText, hasVoted && st.voteBtnTextActive]}>
                {hasVoted ? (fr ? 'Vote' : 'Voted') : (fr ? 'Voter' : 'Vote')}
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
});

// ============================================
// MAIN PAGE
// ============================================
export default function RoadmapScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const fr = language === 'fr';
  const { user } = useAuth();

  const [playerCount, setPlayerCount] = useState(0);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [userVotes, setUserVotes] = useState<Set<string>>(new Set());
  const [loadingFeature, setLoadingFeature] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  // Fetch community stats + votes
  useEffect(() => {
    const supabase = getSupabaseClient();

    // Player count
    fetchCommunityStats().then((s) => setPlayerCount(s.players)).catch(() => {});

    // All vote counts
    supabase
      .from('feature_votes')
      .select('feature_id')
      .then(({ data, error }: any) => {
        if (!error && data) {
          const counts: Record<string, number> = {};
          (data as { feature_id: string }[]).forEach((v) => {
            counts[v.feature_id] = (counts[v.feature_id] || 0) + 1;
          });
          setVoteCounts(counts);
        }
      });

    // User votes
    if (user?.id) {
      supabase
        .from('feature_votes')
        .select('feature_id')
        .eq('user_id', user.id)
        .then(({ data, error }: any) => {
          if (!error && data) {
            setUserVotes(new Set((data as { feature_id: string }[]).map((v) => v.feature_id)));
          }
          setInitialLoading(false);
        });
    } else {
      setInitialLoading(false);
    }
  }, [user?.id]);

  const toggleVote = useCallback(async (featureId: string) => {
    if (!user?.id) {
      router.push('/login' as any);
      return;
    }
    setLoadingFeature(featureId);
    const supabase = getSupabaseClient();
    const alreadyVoted = userVotes.has(featureId);

    try {
      if (alreadyVoted) {
        await supabase
          .from('feature_votes')
          .delete()
          .eq('user_id', user.id)
          .eq('feature_id', featureId);

        setUserVotes((prev) => {
          const next = new Set(prev);
          next.delete(featureId);
          return next;
        });
        setVoteCounts((prev) => ({ ...prev, [featureId]: Math.max(0, (prev[featureId] || 0) - 1) }));
      } else {
        await supabase
          .from('feature_votes')
          .insert({ user_id: user.id, feature_id: featureId });

        setUserVotes((prev) => new Set(prev).add(featureId));
        setVoteCounts((prev) => ({ ...prev, [featureId]: (prev[featureId] || 0) + 1 }));
      }
    } catch (e) {
      console.error('[Roadmap] Vote error:', e);
    }
    setLoadingFeature(null);
  }, [user?.id, userVotes]);

  const progressPercent = Math.min((playerCount / GOAL) * 100, 100);
  const totalVotes = Object.values(voteCounts).reduce((a, b) => a + b, 0);

  // Sort features by vote count descending
  const sortedFeatures = [...FEATURES].sort(
    (a, b) => (voteCounts[b.id] || 0) - (voteCounts[a.id] || 0)
  );

  return (
    <SafeAreaView edges={['top']} style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>Roadmap V2</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero progress */}
        <LinearGradient
          colors={['#0F172A', '#1E3A5F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={st.hero}
        >
          <View style={st.heroDecoCircle1} />
          <View style={st.heroDecoCircle2} />

          <View style={st.heroIconWrap}>
            <MaterialIcons name="rocket-launch" size={28} color="#F59E0B" />
          </View>
          <Text style={st.heroTitle}>
            {fr ? 'Objectif Version 2' : 'Version 2 Goal'}
          </Text>
          <Text style={st.heroSubtitle}>
            {fr
              ? `La V2 demarrera a partir de ${GOAL} joueurs actifs`
              : `V2 development starts at ${GOAL} active players`}
          </Text>

          {/* Progress bar */}
          <View style={st.progressBarOuter}>
            <LinearGradient
              colors={['#2563EB', '#7C3AED']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[st.progressBarInner, { width: `${Math.max(progressPercent, 2)}%` as any }]}
            />
          </View>
          <View style={st.progressLabels}>
            <AnimatedCounter target={playerCount} />
            <Text style={st.progressSlash}>/</Text>
            <Text style={st.progressGoal}>{GOAL}</Text>
            <Text style={st.progressUnit}>{fr ? 'joueurs' : 'players'}</Text>
          </View>
          <Text style={st.progressPercent}>{Math.round(progressPercent)}%</Text>
        </LinearGradient>

        {/* Intro */}
        <View style={st.introCard}>
          <MaterialIcons name="how-to-vote" size={20} color="#2563EB" />
          <Text style={st.introText}>
            {fr
              ? `Votez pour orienter les priorites de la Version 2 ! ${totalVotes} vote${totalVotes !== 1 ? 's' : ''} au total.`
              : `Vote to shape Version 2 priorities! ${totalVotes} total vote${totalVotes !== 1 ? 's' : ''}.`}
          </Text>
        </View>

        {!user?.id ? (
          <Pressable
            style={({ pressed }) => [st.loginPrompt, pressed && { opacity: 0.85 }]}
            onPress={() => router.push('/login' as any)}
          >
            <MaterialIcons name="lock-open" size={18} color="#2563EB" />
            <Text style={st.loginPromptText}>
              {fr ? 'Connectez-vous pour voter' : 'Log in to vote'}
            </Text>
          </Pressable>
        ) : null}

        {/* Feature list */}
        {initialLoading ? (
          <View style={st.loadingWrap}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          sortedFeatures.map((f, idx) => (
            <FeatureCard
              key={f.id}
              feature={f}
              fr={fr}
              votes={voteCounts[f.id] || 0}
              hasVoted={userVotes.has(f.id)}
              onToggle={() => toggleVote(f.id)}
              loading={loadingFeature === f.id}
            />
          ))
        )}

        {/* Footer */}
        <View style={st.footerCard}>
          <MaterialIcons name="info-outline" size={16} color="#94A3B8" />
          <Text style={st.footerText}>
            {fr
              ? 'Les resultats de ce sondage guideront les priorites de developpement de la V2. Chaque joueur peut voter une fois par feature.'
              : 'The results of this poll will guide V2 development priorities. Each player can vote once per feature.'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#0F172A' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  // Hero
  hero: {
    borderRadius: 22, padding: 28, alignItems: 'center',
    marginTop: 16, marginBottom: 16, overflow: 'hidden', position: 'relative',
  },
  heroDecoCircle1: {
    position: 'absolute', top: -30, right: -20,
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  heroDecoCircle2: {
    position: 'absolute', bottom: -20, left: -15,
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  heroIconWrap: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: 'rgba(245,158,11,0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
    borderWidth: 2, borderColor: 'rgba(245,158,11,0.25)',
  },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', textAlign: 'center', letterSpacing: -0.3 },
  heroSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.55)', textAlign: 'center', marginTop: 6, lineHeight: 19 },

  // Progress bar
  progressBarOuter: {
    width: '100%', height: 12, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 6, marginTop: 20, overflow: 'hidden',
  },
  progressBarInner: { height: '100%', borderRadius: 6 },
  progressLabels: {
    flexDirection: 'row', alignItems: 'baseline', gap: 4,
    marginTop: 12,
  },
  progressCount: { fontSize: 32, fontWeight: '800', color: '#FFF', letterSpacing: -1 },
  progressSlash: { fontSize: 18, fontWeight: '500', color: 'rgba(255,255,255,0.35)' },
  progressGoal: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.5)' },
  progressUnit: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.4)', marginLeft: 4 },
  progressPercent: { fontSize: 13, fontWeight: '700', color: '#F59E0B', marginTop: 4 },

  // Intro
  introCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#EFF6FF', borderRadius: 14, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: '#DBEAFE',
  },
  introText: { flex: 1, fontSize: 14, color: '#1E40AF', lineHeight: 20, fontWeight: '500' },

  // Login prompt
  loginPrompt: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFF', borderRadius: 12, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#DBEAFE',
  },
  loginPromptText: { fontSize: 14, fontWeight: '600', color: '#2563EB' },

  // Feature card
  featureCard: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 16,
    marginBottom: 10, borderWidth: 1, borderColor: '#F1F5F9',
  },
  featureTop: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  featureIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  featureInfo: { flex: 1 },
  featureName: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 3 },
  featureDesc: { fontSize: 13, color: '#64748B', lineHeight: 19 },
  featureBottom: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F8FAFC',
  },
  voteCountWrap: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  voteCountText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  voteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#DBEAFE',
  },
  voteBtnActive: {
    backgroundColor: '#2563EB', borderColor: '#2563EB',
  },
  voteBtnText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
  voteBtnTextActive: { color: '#FFF' },

  // Loading
  loadingWrap: { paddingVertical: 40, alignItems: 'center' },

  // Footer
  footerCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    padding: 16, marginTop: 8, marginBottom: 12,
  },
  footerText: { flex: 1, fontSize: 12, color: '#94A3B8', lineHeight: 18 },
});
