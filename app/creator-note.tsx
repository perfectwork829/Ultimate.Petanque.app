import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Linking,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { fetchCommunityStats, type CommunityStats } from '@/services/communityStatsService';
import { fetchSuspiciousPlayers, getTrustScoreColor } from '@/services/trustScoreService';

const CONTACT_EMAIL = 'ultimate.petanque.app@gmail.com';

// ============================================
// ANIMATED COUNTER
// ============================================
function AnimatedCounter({ target, duration = 1800, suffix = '' }: { target: number; duration?: number; suffix?: string }) {
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
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration]);

  const formatted = display >= 1000 ? `${(display / 1000).toFixed(display >= 10000 ? 0 : 1)}k` : `${display}`;
  return <Text style={st.counterValue}>{formatted}{suffix}</Text>;
}

interface CommunityStats {
  players: number;
  matches: number;
  terrains: number;
  tournaments: number;
  clubs: number;
  challenges: number;
}

export default function CreatorNoteScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const fr = language === 'fr';
  const [stats, setStats] = useState<CommunityStats>({ players: 0, matches: 0, terrains: 0, tournaments: 0, clubs: 0, challenges: 0 });
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [trustStats, setTrustStats] = useState<{ avg: number; verified: number; trusted: number; standard: number; total: number }>({ avg: 0, verified: 0, trusted: 0, standard: 0, total: 0 });

  useEffect(() => {
    fetchCommunityStats()
      .then(setStats)
      .finally(() => setStatsLoaded(true));
    fetchSuspiciousPlayers().then(({ players: tp }) => {
      const active = tp.filter(p => p.status !== 'banned');
      if (active.length === 0) return;
      const total = active.length;
      const avg = Math.round(active.reduce((sum: number, p: any) => sum + p.trustScore, 0) / total);
      let verified = 0, trusted = 0, standard = 0;
      active.forEach((p: any) => { if (p.trustScore >= 80) verified++; else if (p.trustScore >= 65) trusted++; else standard++; });
      setTrustStats({ avg, verified, trusted, standard, total });
    }).catch(() => {});
  }, []);

  return (
    <SafeAreaView edges={['top']} style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={st.headerTitle}>{fr ? 'Note du createur' : 'Creator note'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={st.scroll}
        contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== HERO ===== */}
        <LinearGradient
          colors={['#0F172A', '#1E3A5F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={st.hero}
        >
          <View style={st.heroDecoCircle1} />
          <View style={st.heroDecoCircle2} />
          <Text style={st.heroLine1}>
            {fr ? 'Je ne suis pas une entreprise.' : 'I am not a company.'}
          </Text>
          <Text style={st.heroLine2}>
            {fr
              ? 'Je suis un joueur de petanque, comme vous.'
              : 'I am a petanque player, just like you.'}
          </Text>
        </LinearGradient>

        {/* ===== THE STORY ===== */}
        <View style={st.card}>
          <Text style={st.bodyText}>
            {fr
              ? "J'ai decouvert ce sport en 2021... et comme beaucoup, j'ai appris sur le terrain.\nPuis j'ai essaye les applications existantes."
              : "I discovered this sport in 2021... and like many, I learned on the court.\nThen I tried the existing applications."}
          </Text>
        </View>

        {/* ===== THE PROBLEM ===== */}
        <View style={st.card}>
          <Text style={st.bodyText}>
            {fr
              ? "Elles permettent d'enregistrer des scores, de mesurer des distances par camera, de trouver des terrains... mais rapidement, une limite apparait :"
              : "They allow you to record scores, measure distances by camera, find courts... but quickly, a limit appears:"}
          </Text>
          <View style={st.problemList}>
            <View style={st.problemItem}>
              <View style={st.problemDot} />
              <Text style={st.problemText}>
                {fr ? "Aucun classement de l'ensemble de la communaute petanque au niveau local comme mondial" : 'No ranking of the entire petanque community at local or global level'}
              </Text>
            </View>
            <View style={st.problemItem}>
              <View style={st.problemDot} />
              <Text style={st.problemText}>
                {fr ? 'Statistiques peu avancees' : 'Limited statistics'}
              </Text>
            </View>
            <View style={st.problemItem}>
              <View style={st.problemDot} />
              <Text style={st.problemText}>
                {fr ? 'Listes de terrains inactifs' : 'Inactive court listings'}
              </Text>
            </View>
            <View style={st.problemItem}>
              <View style={st.problemDot} />
              <Text style={st.problemText}>
                {fr
                  ? "Impossible de vraiment analyser son jeu, de l'ameliorer et de savoir ou l\u2019on se situe"
                  : 'Impossible to truly analyze your game, improve it and know where you stand'}
              </Text>
            </View>
          </View>
        </View>

        {/* ===== THE SOLUTION ===== */}
        <View style={st.solutionCard}>
          <Text style={st.solutionText}>
            {fr
              ? "Alors j'ai cree l'outil que j'aurais aime avoir."
              : "So I created the tool I wished I had."}
          </Text>
        </View>

        {/* ===== AMBITION HEADER ===== */}
        <View style={st.ambitionHeader}>
          <MaterialIcons name="gps-fixed" size={20} color="#F59E0B" />
          <Text style={st.ambitionTitle}>
            {fr ? 'Une ambition simple' : 'A simple ambition'}
          </Text>
        </View>

        {/* ===== PILLAR 1: RANKING ===== */}
        <View style={[st.pillarCard, { borderLeftColor: '#2563EB' }]}>
          <View style={[st.pillarIconWrap, { backgroundColor: '#2563EB12' }]}>
            <MaterialIcons name="leaderboard" size={22} color="#2563EB" />
          </View>
          <Text style={st.pillarTitle}>
            {fr ? 'Un classement mondial juste et equitable' : 'A fair and equitable world ranking'}
          </Text>
          <View style={st.pillarBullets}>
            <PillarBullet
              icon="diamond"
              color="#8B5CF6"
              text={fr
                ? 'Systeme ELO pour refleter votre niveau reel'
                : 'ELO system to reflect your real level'}
            />
            <PillarBullet
              icon="verified-user"
              color="#22C55E"
              text={fr
                ? 'Trust Score pour garantir la fiabilite'
                : 'Trust Score to guarantee reliability'}
            />
            <PillarBullet
              icon="public"
              color="#3B82F6"
              text={fr
                ? 'Classement coherent du local au mondial'
                : 'Consistent ranking from local to global'}
            />
          </View>
          <View style={st.pillarFooter}>
            <MaterialIcons name="security" size={14} color="#2563EB" />
            <Text style={st.pillarFooterText}>
              {fr
                ? 'Un classement credible, transparent, difficile a manipuler.'
                : 'A credible, transparent ranking, hard to manipulate.'}
            </Text>
          </View>
        </View>

        {/* ===== PILLAR 2: PROGRESS ===== */}
        <View style={[st.pillarCard, { borderLeftColor: '#7C3AED' }]}>
          <View style={[st.pillarIconWrap, { backgroundColor: '#7C3AED12' }]}>
            <MaterialIcons name="trending-up" size={22} color="#7C3AED" />
          </View>
          <Text style={st.pillarTitle}>
            {fr ? 'Progresser pour de vrai' : 'Real progress'}
          </Text>
          <View style={st.pillarBullets}>
            <PillarBullet
              icon="analytics"
              color="#7C3AED"
              text={fr
                ? 'Analyse de vos bons coups... et de vos erreurs'
                : 'Analysis of your good shots... and your mistakes'}
            />
            <PillarBullet
              icon="tune"
              color="#EA580C"
              text={fr
                ? 'Performances selon terrain, boules, contexte'
                : 'Performance by court, boules, context'}
            />
            <PillarBullet
              icon="show-chart"
              color="#10B981"
              text={fr
                ? 'Suivi clair de votre progression'
                : 'Clear tracking of your progress'}
            />
          </View>
          <View style={st.pillarFooter}>
            <MaterialIcons name="lightbulb" size={14} color="#7C3AED" />
            <Text style={[st.pillarFooterText, { color: '#7C3AED' }]}>
              {fr ? 'Des donnees utiles. Pas du bruit.' : 'Useful data. Not noise.'}
            </Text>
          </View>
        </View>

        {/* ===== PILLAR 3: PLAY EVERYWHERE ===== */}
        <View style={[st.pillarCard, { borderLeftColor: '#10B981' }]}>
          <View style={[st.pillarIconWrap, { backgroundColor: '#10B98112' }]}>
            <MaterialIcons name="explore" size={22} color="#10B981" />
          </View>
          <Text style={st.pillarTitle}>
            {fr ? 'Jouer partout' : 'Play everywhere'}
          </Text>
          <View style={st.pillarBullets}>
            <PillarBullet
              icon="place"
              color="#10B981"
              text={fr
                ? 'Trouvez terrains et clubs facilement'
                : 'Find courts and clubs easily'}
            />
            <PillarBullet
              icon="schedule"
              color="#F59E0B"
              text={fr
                ? "Horaire d'affluence des terrains mis a jour automatiquement et instantanement : sachez ou jouer tout de suite"
                : 'Court peak hours updated automatically and instantly: know where to play right now'}
            />
            <PillarBullet
              icon="people"
              color="#3B82F6"
              text={fr
                ? 'Rencontrez des joueurs, meme en voyage'
                : 'Meet players, even while traveling'}
            />
          </View>
          <View style={st.pillarFooter}>
            <MaterialIcons name="flight" size={14} color="#10B981" />
            <Text style={[st.pillarFooterText, { color: '#10B981' }]}>
              {fr ? 'Jouer plus. Rencontrer plus. Partout.' : 'Play more. Meet more. Everywhere.'}
            </Text>
          </View>
        </View>

        {/* ===== BY PLAYERS FOR PLAYERS ===== */}
        <View style={st.mottoCard}>
          <LinearGradient
            colors={['#0F172A', '#1E293B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.mottoGradient}
          >
            <View style={st.mottoIconRow}>
              <MaterialIcons name="handshake" size={28} color="#F59E0B" />
            </View>
            <Text style={st.mottoTitle}>
              {fr ? 'Par les joueurs, pour les joueurs' : 'By players, for players'}
            </Text>
            <View style={st.mottoPoints}>
              <Text style={st.mottoLine}>{fr ? 'Des parties reelles.' : 'Real games.'}</Text>
              <Text style={st.mottoLine}>{fr ? 'Des joueurs actifs.' : 'Active players.'}</Text>
              <Text style={st.mottoLine}>{fr ? 'Des donnees fiables.' : 'Reliable data.'}</Text>
            </View>
            <View style={st.mottoDivider} />
            <Text style={st.mottoHighlight}>
              {fr ? 'Moins de volume. Plus de qualite.' : 'Less volume. More quality.'}
            </Text>
          </LinearGradient>
        </View>

        {/* ===== IF YOU WANT ===== */}
        <View style={st.card}>
          <Text style={st.sectionLabel}>
            {fr ? 'Si vous voulez :' : 'If you want to:'}
          </Text>
          <View style={st.checkList}>
            <CheckItem text={fr ? 'Connaitre votre vrai niveau' : 'Know your real level'} />
            <CheckItem text={fr ? 'Progresser concretement' : 'Make real progress'} />
            <CheckItem text={fr ? 'Jouer partout dans le monde' : 'Play everywhere in the world'} />
          </View>
          <View style={st.emphasisBlock}>
            <Text style={st.emphasisText}>
              {fr
                ? 'Alors cette application est faite pour vous.'
                : 'Then this application is made for you.'}
            </Text>
          </View>
        </View>

        {/* ===== COMMUNITY STATS ===== */}
        {statsLoaded ? (
          <View style={st.statsCard}>
            <View style={st.statsHeader}>
              <View style={st.statsSectionIcon}>
                <MaterialIcons name="public" size={18} color="#2563EB" />
              </View>
              <Text style={st.statsTitle}>
                {fr ? 'La communaute en chiffres' : 'The community in numbers'}
              </Text>
            </View>
            <View style={st.statsRow}>
              <View style={st.statItem}>
                <View style={[st.statIconWrap, { backgroundColor: '#2563EB12' }]}>
                  <MaterialIcons name="people" size={22} color="#2563EB" />
                </View>
                <AnimatedCounter target={stats.players} />
                <Text style={st.statLabel}>{fr ? 'Joueurs' : 'Players'}</Text>
              </View>
              <View style={st.statDivider} />
              <View style={st.statItem}>
                <View style={[st.statIconWrap, { backgroundColor: '#10B98112' }]}>
                  <MaterialIcons name="sports" size={22} color="#10B981" />
                </View>
                <AnimatedCounter target={stats.matches} />
                <Text style={st.statLabel}>{fr ? 'Matchs' : 'Matches'}</Text>
              </View>
              <View style={st.statDivider} />
              <View style={st.statItem}>
                <View style={[st.statIconWrap, { backgroundColor: '#F59E0B12' }]}>
                  <MaterialIcons name="place" size={22} color="#F59E0B" />
                </View>
                <AnimatedCounter target={stats.terrains} />
                <Text style={st.statLabel}>{fr ? 'Terrains' : 'Courts'}</Text>
              </View>
            </View>
            <View style={st.statsRowDivider} />
            <View style={st.statsRow}>
              <View style={st.statItem}>
                <View style={[st.statIconWrap, { backgroundColor: '#7C3AED12' }]}>
                  <MaterialIcons name="emoji-events" size={22} color="#7C3AED" />
                </View>
                <AnimatedCounter target={stats.tournaments} />
                <Text style={st.statLabel}>{fr ? 'Tournois' : 'Tournaments'}</Text>
              </View>
              <View style={st.statDivider} />
              <View style={st.statItem}>
                <View style={[st.statIconWrap, { backgroundColor: '#EC489912' }]}>
                  <MaterialIcons name="groups" size={22} color="#EC4899" />
                </View>
                <AnimatedCounter target={stats.clubs} />
                <Text style={st.statLabel}>{fr ? 'Clubs' : 'Clubs'}</Text>
              </View>
              <View style={st.statDivider} />
              <View style={st.statItem}>
                <View style={[st.statIconWrap, { backgroundColor: '#DC262612' }]}>
                  <MaterialIcons name="track-changes" size={22} color="#DC2626" />
                </View>
                <AnimatedCounter target={stats.challenges} />
                <Text style={st.statLabel}>{fr ? 'Defis' : 'Challenges'}</Text>
              </View>
            </View>
            <View style={st.statsFooter}>
              <MaterialIcons name="auto-awesome" size={12} color="#94A3B8" />
              <Text style={st.statsFooterText}>
                {fr ? 'Donnees en temps reel' : 'Real-time data'}
              </Text>
            </View>
          </View>
        ) : null}


        {/* ===== SUPPORT ===== */}
        <View style={[st.card, st.supportCard]}>
          <View style={st.supportIcon}>
            <MaterialIcons name="favorite" size={22} color="#EF4444" />
          </View>
          <Text style={st.supportTitle}>
            {fr ? 'Soutenir le projet' : 'Support the project'}
          </Text>
          <Text style={st.bodyText}>
            {fr
              ? "L'application restera gratuite."
              : "The application will remain free."}
          </Text>
          <Text style={[st.bodyText, { marginTop: 8 }]}>
            {fr
              ? "Pour soutenir le projet, vous pouvez simplement retirer les publicites. C'est la maniere la plus directe de faire grandir cet outil independant."
              : "To support the project, you can simply remove ads. It is the most direct way to grow this independent tool."}
          </Text>
          <Pressable
            style={({ pressed }) => [st.supportBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            onPress={() => router.push('/remove-ads' as any)}
          >
            <MaterialIcons name="favorite" size={18} color="#FFF" />
            <Text style={st.supportBtnText}>
              {fr ? 'Retirer les publicites' : 'Remove ads'}
            </Text>
          </Pressable>
        </View>

        {/* ===== CLOSING ===== */}
        <View style={st.closingCard}>
          <LinearGradient
            colors={['#0F172A', '#1E3A5F']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={st.closingGradient}
          >
            <MaterialIcons name="public" size={28} color="#60A5FA" />
            <Text style={st.closingLine1}>
              {fr ? 'Des millions de joueurs.' : 'Millions of players.'}
            </Text>
            <Text style={st.closingLine2}>
              {fr
                ? 'Tres peu savent ou ils se situent.'
                : 'Very few know where they stand.'}
            </Text>
            <View style={st.closingDivider} />
            <Text style={st.closingHighlight}>
              {fr ? 'Ici, ca change.' : 'Here, that changes.'}
            </Text>
          </LinearGradient>
        </View>

        {/* ===== THANK YOU ===== */}
        <View style={st.thanksCard}>
          <MaterialIcons name="favorite" size={20} color="#F87171" />
          <Text style={st.thanksText}>
            {fr
              ? "Merci de faire partie de l'aventure."
              : "Thank you for being part of the adventure."}
          </Text>
        </View>

        {/* ===== ROADMAP CTA ===== */}
        <Pressable
          style={({ pressed }) => [st.roadmapCta, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
          onPress={() => router.push('/roadmap' as any)}
        >
          <LinearGradient
            colors={['#2563EB', '#7C3AED']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={st.roadmapCtaGradient}
          >
            <MaterialIcons name="rocket-launch" size={22} color="#FFF" />
            <View style={st.roadmapCtaTextWrap}>
              <Text style={st.roadmapCtaTitle}>
                {fr ? 'Roadmap V2 — Votez !' : 'Roadmap V2 — Vote!'}
              </Text>
              <Text style={st.roadmapCtaSub}>
                {fr ? 'Orientez les prochaines fonctionnalites' : 'Shape the next features'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="rgba(255,255,255,0.7)" />
          </LinearGradient>
        </Pressable>

        {/* ===== CONTACT ===== */}
        <View style={st.contactCard}>
          <View style={st.contactIconWrap}>
            <MaterialIcons name="forum" size={24} color={theme.primary} />
          </View>
          <Text style={st.contactTitle}>
            {fr ? "Besoin d'aide ou une idee ?" : 'Need help or have an idea?'}
          </Text>
          <Text style={st.contactSub}>
            {fr ? 'Je ferai mon possible pour vous repondre au plus vite' : 'I will do my best to respond as quickly as possible'}
          </Text>
          <Pressable
            style={({ pressed }) => [st.contactBtn, pressed && { opacity: 0.85 }]}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Ultimate%20Petanque%20-%20Feedback`)}
          >
            <MaterialIcons name="email" size={18} color="#FFF" />
            <Text style={st.contactBtnText}>{CONTACT_EMAIL}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

function PillarBullet({ icon, color, text }: { icon: string; color: string; text: string }) {
  return (
    <View style={st.pillarBulletRow}>
      <View style={[st.pillarBulletIcon, { backgroundColor: color + '12' }]}>
        <MaterialIcons name={icon as any} size={15} color={color} />
      </View>
      <Text style={st.pillarBulletText}>{text}</Text>
    </View>
  );
}

function CheckItem({ text }: { text: string }) {
  return (
    <View style={st.checkRow}>
      <View style={st.checkBox}>
        <MaterialIcons name="check" size={14} color="#22C55E" />
      </View>
      <Text style={st.checkText}>{text}</Text>
    </View>
  );
}

// ============================================
// STYLES
// ============================================
const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#0F172A' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },

  // Hero
  hero: { borderRadius: 22, padding: 36, alignItems: 'center', marginTop: 16, marginBottom: 20, overflow: 'hidden', position: 'relative' },
  heroDecoCircle1: { position: 'absolute', top: -30, right: -20, width: 110, height: 110, borderRadius: 55, backgroundColor: 'rgba(255,255,255,0.04)' },
  heroDecoCircle2: { position: 'absolute', bottom: -20, left: -15, width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.03)' },
  heroLine1: { fontSize: 16, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 24, fontWeight: '500' },
  heroLine2: { fontSize: 22, fontWeight: '800', color: '#FFF', textAlign: 'center', marginTop: 10, lineHeight: 30, letterSpacing: -0.3 },

  // Cards
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  supportCard: { borderColor: '#EF444420', backgroundColor: '#FFF5F5', alignItems: 'center' as const },

  bodyText: { fontSize: 15, color: '#334155', lineHeight: 25 },

  // Problem list
  problemList: { marginTop: 16, gap: 10 },
  problemItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  problemDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  problemText: { fontSize: 14, color: '#64748B', fontWeight: '500', fontStyle: 'italic' },

  // Solution card
  solutionCard: { backgroundColor: '#0F172A', borderRadius: 16, padding: 24, marginBottom: 20, alignItems: 'center' },
  solutionText: { fontSize: 18, fontWeight: '700', color: '#FFF', textAlign: 'center', lineHeight: 26 },

  // Ambition header
  ambitionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14, paddingHorizontal: 4 },
  ambitionTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', letterSpacing: -0.3 },

  // Pillar cards
  pillarCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9', borderLeftWidth: 4 },
  pillarIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  pillarTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 14, lineHeight: 22 },
  pillarBullets: { gap: 10 },
  pillarBulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pillarBulletIcon: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  pillarBulletText: { flex: 1, fontSize: 14, color: '#475569', lineHeight: 22 },
  pillarFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  pillarFooterText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#2563EB', fontStyle: 'italic' },

  // Motto card
  mottoCard: { marginBottom: 12, borderRadius: 16, overflow: 'hidden' },
  mottoGradient: { padding: 28, alignItems: 'center', gap: 6 },
  mottoIconRow: { marginBottom: 8 },
  mottoTitle: { fontSize: 18, color: '#F59E0B', fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  mottoPoints: { gap: 4, marginBottom: 8 },
  mottoLine: { fontSize: 15, color: 'rgba(255,255,255,0.7)', fontWeight: '500', textAlign: 'center' },
  mottoDivider: { width: 40, height: 2, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 1, marginVertical: 10 },
  mottoHighlight: { fontSize: 16, color: '#FFF', fontWeight: '700', textAlign: 'center', fontStyle: 'italic' },

  // Section label
  sectionLabel: { fontSize: 15, fontWeight: '600', color: '#0F172A', marginBottom: 12 },

  // Checklist
  checkList: { gap: 10, marginBottom: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkBox: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#22C55E12', alignItems: 'center', justifyContent: 'center' },
  checkText: { flex: 1, fontSize: 15, fontWeight: '600', color: '#334155', lineHeight: 22 },

  // Emphasis
  emphasisBlock: { marginTop: 4, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  emphasisText: { fontSize: 15, fontWeight: '700', color: '#0F172A', fontStyle: 'italic', textAlign: 'center' },

  // Support
  supportIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#EF444412', alignItems: 'center', justifyContent: 'center', marginBottom: 12, borderWidth: 2, borderColor: '#EF444420' },
  supportTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', marginBottom: 10 },
  supportBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, backgroundColor: '#EF4444', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14 },
  supportBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },

  // Closing
  closingCard: { marginBottom: 12, borderRadius: 16, overflow: 'hidden' },
  closingGradient: { padding: 32, alignItems: 'center', gap: 8 },
  closingLine1: { fontSize: 16, color: 'rgba(255,255,255,0.7)', fontWeight: '500', textAlign: 'center', marginTop: 8 },
  closingLine2: { fontSize: 15, color: 'rgba(255,255,255,0.5)', textAlign: 'center', lineHeight: 22 },
  closingDivider: { width: 40, height: 2, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 1, marginVertical: 10 },
  closingHighlight: { fontSize: 20, fontWeight: '800', color: '#FFF', textAlign: 'center' },

  // Thanks
  thanksCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 24, marginBottom: 12 },
  thanksText: { fontSize: 16, fontWeight: '700', color: '#0F172A', fontStyle: 'italic' },

  // Roadmap CTA
  roadmapCta: { marginBottom: 12, borderRadius: 16, overflow: 'hidden' },
  roadmapCtaGradient: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 14 },
  roadmapCtaTextWrap: { flex: 1 },
  roadmapCtaTitle: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  roadmapCtaSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  // Contact
  contactCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  contactIconWrap: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#2563EB10', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  contactTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  contactSub: { fontSize: 13, color: '#94A3B8', marginBottom: 16 },
  contactBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2563EB', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  contactBtnText: { fontSize: 13, fontWeight: '600', color: '#FFF' },

  // Stats counter
  statsCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  statsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  statsSectionIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#2563EB10', alignItems: 'center', justifyContent: 'center' },
  statsTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A', letterSpacing: 0.2 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', flex: 1, gap: 6 },
  statIconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  counterValue: { fontSize: 28, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5 },
  statLabel: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  statDivider: { width: 1, height: 40, backgroundColor: '#F1F5F9' },
  statsRowDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 14, marginHorizontal: 12 },
  statsFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  statsFooterText: { fontSize: 11, color: '#94A3B8', fontWeight: '500' },
});
