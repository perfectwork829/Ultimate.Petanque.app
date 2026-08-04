import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  SectionList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/template';
import { useAppData } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { useBadges } from '@/hooks/useBadges';
import {
  BADGES,
  getBadgeName,
  getBadgeDescription,
  getBadgeCategoryLabel,
  XP_LEVELS,
  getLevelFromXp,
  getXpProgress,
  getNextLevel,
  XP_PER_MATCH,
  XP_PER_CARREAU,
  XP_PER_SHARE_ACCEPTED,
  XP_PER_BADGE,
  BadgeDefinition,
} from '@/services/badgeService';
import { fetchTrustScore } from '@/services/trustScoreService';
import { getEloRank, ELO_INITIAL } from '@/services/eloService';
import XPBar from '@/components/ui/XPBar';
import theme from '@/constants/theme';

// ============================================
// Badge categories — driven by badgeService.ts category field
// ============================================
type BadgeCategory = 'all' | 'tournament' | 'performance' | 'community' | 'geographic' | 'elo';

const CATEGORY_META: Record<Exclude<BadgeCategory, 'all'>, { icon: string; color: string }> = {
  tournament: { icon: 'emoji-events', color: '#F59E0B' },
  performance: { icon: 'sports', color: '#3B82F6' },
  community: { icon: 'people', color: '#EC4899' },
  geographic: { icon: 'public', color: '#14B8A6' },
  elo: { icon: 'diamond', color: '#8B5CF6' },
};

const CATEGORY_ORDER: BadgeCategory[] = ['all', 'tournament', 'performance', 'community', 'geographic', 'elo'];

// ============================================
// MAIN COMPONENT
// ============================================
export default function BadgesScreen() {
  const { user } = useAuth();
  const { matches, challenges, userStats, sharedMatchIds, selfPlayer, boulesSets } = useAppData();
  const { language } = useLanguage();
  const { badges: userBadges, xp, loading, totalBadges } = useBadges();
  const isFr = language === 'fr';
  const lang = isFr ? 'fr' : 'en';

  const [activeCategory, setActiveCategory] = useState<BadgeCategory>('all');
  const [selectedBadgeId, setSelectedBadgeId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const toggleSection = useCallback((key: string) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const eloData = useMemo(() => {
    if (!selfPlayer) return { eloRating: ELO_INITIAL, eloTireur: ELO_INITIAL, eloPointeur: ELO_INITIAL, eloMilieu: ELO_INITIAL };
    return { eloRating: selfPlayer.eloRating || ELO_INITIAL, eloTireur: selfPlayer.eloTireur || ELO_INITIAL, eloPointeur: selfPlayer.eloPointeur || ELO_INITIAL, eloMilieu: selfPlayer.eloMilieu || ELO_INITIAL };
  }, [selfPlayer]);

  const [trustScoreValue, setTrustScoreValue] = useState<number | null>(null);
  const [witnessCount, setWitnessCount] = useState(0);
  const [profileCompleteness, setProfileCompleteness] = useState(0);

  React.useEffect(() => {
    if (!user?.id) return;
    const loadExtras = async () => {
      try {
        const supabase = (await import('@/template')).getSupabaseClient();
        const { data: playerData } = await supabase.from('players').select('id').eq('user_id', user.id).eq('is_public', true).limit(1).single();
        if (playerData?.id) { const ts = await fetchTrustScore(playerData.id); if (ts) setTrustScoreValue(ts.score); }
      } catch {}
      try {
        const supabase = (await import('@/template')).getSupabaseClient();
        const { data: attestations } = await supabase.from('match_witness_requests').select('id').eq('witness_user_id', user.id).eq('status', 'attested');
        setWitnessCount(attestations?.length || 0);
      } catch {}
      try {
        const supabase = (await import('@/template')).getSupabaseClient();
        const { data: profData } = await supabase.from('user_profiles').select('avatar, club, federation_card_url').eq('id', user.id).single();
        let filled = 0; const total = 6;
        if (profData?.avatar) filled++; if (profData?.club || selfPlayer?.club) filled++; if (selfPlayer?.terrainId) filled++;
        if (selfPlayer?.location && (selfPlayer.location.latitude || selfPlayer.location.longitude)) filled++;
        if (boulesSets.length > 0 || (selfPlayer?.boules && (selfPlayer.boules.name || selfPlayer.boules.diameter || selfPlayer.boules.weight))) filled++;
        if (profData?.federation_card_url) filled++;
        setProfileCompleteness(Math.round((filled / total) * 100));
      } catch {}
    };
    loadExtras();
  }, [user?.id, selfPlayer?.id, boulesSets.length]);

  // Build category stats from actual BADGES array
  const categoryStats = useMemo(() => {
    const categories = ['tournament', 'performance', 'community', 'geographic', 'elo'] as const;
    return categories.map(cat => {
      const badgesInCat = BADGES.filter(b => b.category === cat);
      const unlockedInCat = badgesInCat.filter(b => userBadges.find(ub => ub.badgeId === b.id));
      const meta = CATEGORY_META[cat];
      return {
        id: cat as BadgeCategory,
        labelFr: getBadgeCategoryLabel(cat, 'fr'),
        labelEn: getBadgeCategoryLabel(cat, 'en'),
        icon: meta.icon,
        color: meta.color,
        total: badgesInCat.length,
        unlocked: unlockedInCat.length,
        percent: badgesInCat.length > 0 ? Math.round((unlockedInCat.length / badgesInCat.length) * 100) : 0,
      };
    });
  }, [userBadges]);

  // Filter badges by category
  const filteredBadges = useMemo(() => {
    if (activeCategory === 'all') return BADGES;
    return BADGES.filter(b => b.category === activeCategory);
  }, [activeCategory]);

  // Split into unlocked and locked
  const { unlockedBadges, lockedBadges } = useMemo(() => {
    const unlocked: (BadgeDefinition & { unlockedAt: string })[] = [];
    const locked: BadgeDefinition[] = [];
    filteredBadges.forEach(badge => {
      const ub = userBadges.find(b => b.badgeId === badge.id);
      if (ub) unlocked.push({ ...badge, unlockedAt: ub.unlockedAt });
      else locked.push(badge);
    });
    unlocked.sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime());
    return { unlockedBadges: unlocked, lockedBadges: locked };
  }, [filteredBadges, userBadges]);

  // Recently unlocked (last 30 days)
  const recentlyUnlocked = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    return userBadges.filter(ub => new Date(ub.unlockedAt).getTime() > cutoff).sort((a, b) => new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime());
  }, [userBadges]);

  const level = getLevelFromXp(xp);
  const progress = getXpProgress(xp);

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loadingBox}><ActivityIndicator size="large" color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  const activeCatStats = activeCategory !== 'all' ? categoryStats.find(c => c.id === activeCategory) : null;

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.headerBack} onPress={() => router.back()} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{isFr ? 'Badges & Progression' : 'Badges & Progress'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <BadgesSectionList
        xp={xp}
        language={language}
        isFr={isFr}
        lang={lang}
        userBadges={userBadges}
        totalBadges={totalBadges}
        categoryStats={categoryStats}
        activeCategory={activeCategory}
        setActiveCategory={setActiveCategory}
        activeCatStats={activeCatStats}
        recentlyUnlocked={recentlyUnlocked}
        unlockedBadges={unlockedBadges}
        lockedBadges={lockedBadges}
        level={level}
        setSelectedBadgeId={setSelectedBadgeId}
        collapsedSections={collapsedSections}
        toggleSection={toggleSection}
      />

      {/* Badge Detail Modal */}
      <BadgeDetailModal
        badgeId={selectedBadgeId}
        visible={!!selectedBadgeId}
        onClose={() => setSelectedBadgeId(null)}
        language={lang}
        isUnlocked={!!selectedBadgeId && !!userBadges.find(ub => ub.badgeId === selectedBadgeId)}
        unlockedAt={selectedBadgeId ? userBadges.find(ub => ub.badgeId === selectedBadgeId)?.unlockedAt || null : null}
      />
    </SafeAreaView>
  );
}

// ============================================
// Virtualized Badge SectionList Component
// ============================================
const BadgeItem = React.memo(function BadgeItem({ badge, lang, isFr, isUnlocked, unlockedAt, onPress }: {
  badge: BadgeDefinition;
  lang: 'fr' | 'en';
  isFr: boolean;
  isUnlocked: boolean;
  unlockedAt: string | null;
  onPress: () => void;
}) {
  if (isUnlocked && unlockedAt) {
    return (
      <Pressable onPress={onPress} hitSlop={6} android_ripple={{ color: badge.color + '16', borderless: false }}>
        <View style={[s.badgeCard, { borderLeftWidth: 3, borderLeftColor: badge.color }]}>
          <View style={s.badgeCardTop}>
            <View style={[s.badgeCardIcon, { backgroundColor: badge.color + '20' }]}>
              <MaterialIcons name={badge.icon as any} size={28} color={badge.color} />
              <View style={[s.badgeCheckmark, { backgroundColor: badge.color }]}>
                <MaterialIcons name="check" size={10} color="#FFF" />
              </View>
            </View>
            <View style={s.badgeCardInfo}>
              <View style={s.badgeCardNameRow}>
                <Text style={s.badgeCardName} numberOfLines={2}>{getBadgeName(badge.id, lang)}</Text>
                <View style={[s.badgeXpChip, { backgroundColor: badge.color + '15' }]}>
                  <MaterialIcons name="bolt" size={12} color={badge.color} />
                  <Text style={[s.badgeXpText, { color: badge.color }]}>+{badge.xpReward}</Text>
                </View>
              </View>
              <Text style={s.badgeCardDesc} numberOfLines={2}>{getBadgeDescription(badge.id, lang)}</Text>
              <View style={s.badgeUnlockDate}>
                <MaterialIcons name="check-circle" size={14} color={badge.color} />
                <Text style={[s.badgeUnlockDateText, { color: badge.color }]}>
                  {isFr ? 'Debloque le' : 'Unlocked'}{' '}
                  {new Date(unlockedAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={onPress} hitSlop={6} android_ripple={{ color: theme.textMuted + '14', borderless: false }}>
      <View style={[s.badgeCard, { opacity: 0.7 }]}>
        <View style={s.badgeCardTop}>
          <View style={[s.badgeCardIcon, { backgroundColor: theme.backgroundSecondary }]}>
            <MaterialIcons name={badge.icon as any} size={28} color={theme.textMuted + '60'} />
          </View>
          <View style={s.badgeCardInfo}>
            <View style={s.badgeCardNameRow}>
              <Text style={[s.badgeCardName, { color: theme.textSecondary }]} numberOfLines={2}>{getBadgeName(badge.id, lang)}</Text>
              <View style={s.badgeXpChip}>
                <MaterialIcons name="bolt" size={12} color={theme.textMuted} />
                <Text style={s.badgeXpText}>+{badge.xpReward}</Text>
              </View>
            </View>
            <Text style={s.badgeCardDesc} numberOfLines={2}>{getBadgeDescription(badge.id, lang)}</Text>
            <View style={s.badgeProgressSection}>
              <View style={s.badgeProgressBarOuter}>
                <View style={[s.badgeProgressBarInner, { width: '2%', backgroundColor: badge.color + '40' }]} />
              </View>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
});

function BadgesSectionList({ xp, language, isFr, lang, userBadges, totalBadges, categoryStats, activeCategory, setActiveCategory, activeCatStats, recentlyUnlocked, unlockedBadges, lockedBadges, level, setSelectedBadgeId, collapsedSections, toggleSection }: {
  xp: number;
  language: string;
  isFr: boolean;
  lang: 'fr' | 'en';
  userBadges: any[];
  totalBadges: number;
  categoryStats: any[];
  activeCategory: BadgeCategory;
  setActiveCategory: (cat: BadgeCategory) => void;
  activeCatStats: any;
  recentlyUnlocked: any[];
  unlockedBadges: any[];
  lockedBadges: BadgeDefinition[];
  level: any;
  setSelectedBadgeId: (id: string) => void;
  collapsedSections: Record<string, boolean>;
  toggleSection: (key: string) => void;
}) {
  type SectionItem = { type: 'header' } | { type: 'badge'; badge: any; isUnlocked: boolean; unlockedAt: string | null };
  type Section = { key: string; title: string; data: SectionItem[] };

  const sections = useMemo<Section[]>(() => {
    const result: Section[] = [];

    // Header section (non-collapsible): XP, progress, categories, filters
    result.push({ key: 'header', title: '', data: [{ type: 'header' }] });

    // Unlocked section
    if (unlockedBadges.length > 0) {
      const isCollapsed = collapsedSections['unlocked'];
      const items: SectionItem[] = isCollapsed ? [] : unlockedBadges.map(b => ({ type: 'badge' as const, badge: b, isUnlocked: true, unlockedAt: b.unlockedAt }));
      result.push({ key: 'unlocked', title: `${isFr ? 'Debloques' : 'Unlocked'} (${unlockedBadges.length})`, data: items });
    }

    // Locked section
    if (lockedBadges.length > 0) {
      const isCollapsed = collapsedSections['locked'];
      const items: SectionItem[] = isCollapsed ? [] : lockedBadges.map(b => ({ type: 'badge' as const, badge: b, isUnlocked: false, unlockedAt: null }));
      result.push({ key: 'locked', title: `${isFr ? 'A debloquer' : 'Locked'} (${lockedBadges.length})`, data: items });
    }

    // Footer section: XP sources + levels
    result.push({ key: 'footer', title: '', data: [{ type: 'header' }] });

    return result;
  }, [unlockedBadges, lockedBadges, collapsedSections, isFr]);

  const renderItem = useCallback(({ item, section }: { item: SectionItem; section: Section }) => {
    if (section.key === 'header' && item.type === 'header') {
      return (
        <View style={s.scrollContent}>
          <XPBar xp={xp} language={language} />
          <LinearGradient colors={['#1E3A8A', '#3B82F6']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.progressHero}>
            <View style={s.progressHeroDecoCircle} />
            <View style={s.progressHeroTop}>
              <View style={s.progressHeroLeft}>
                <Text style={s.progressHeroCount}>{userBadges.length}</Text>
                <Text style={s.progressHeroMax}>/{totalBadges}</Text>
              </View>
              <View style={s.progressHeroRight}>
                <Text style={s.progressHeroLabel}>{isFr ? 'Badges debloques' : 'Badges unlocked'}</Text>
                <View style={s.progressHeroBarTrack}>
                  <View style={[s.progressHeroBarFill, { width: `${Math.max(4, Math.round((userBadges.length / totalBadges) * 100))}%` }]} />
                </View>
                <Text style={s.progressHeroPercent}>{Math.round((userBadges.length / totalBadges) * 100)}%</Text>
              </View>
            </View>
          </LinearGradient>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catProgressScroll}>
            {categoryStats.map((cat: any) => (
              <Pressable key={cat.id} style={[s.catProgressCard, activeCategory === cat.id && { borderColor: cat.color, borderWidth: 2.5 }]} onPress={() => setActiveCategory(activeCategory === cat.id ? 'all' : cat.id)}>
                <View style={[s.catProgressIcon, { backgroundColor: cat.color + '15' }]}><MaterialIcons name={cat.icon as any} size={20} color={cat.color} /></View>
                <Text style={s.catProgressLabel} numberOfLines={2}>{isFr ? cat.labelFr : cat.labelEn}</Text>
                <Text style={[s.catProgressCount, { color: cat.color }]}>{cat.unlocked}/{cat.total}</Text>
                <View style={s.catProgressBarTrack}><View style={[s.catProgressBarFill, { width: `${Math.max(4, cat.percent)}%`, backgroundColor: cat.color }]} /></View>
              </Pressable>
            ))}
          </ScrollView>
          {recentlyUnlocked.length > 0 && activeCategory === 'all' ? (
            <View style={s.recentSection}>
              <View style={s.recentHeader}><MaterialIcons name="new-releases" size={16} color="#F59E0B" /><Text style={s.recentTitle}>{isFr ? 'Recemment debloques' : 'Recently unlocked'}</Text></View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingRight: 4 }}>
                {recentlyUnlocked.slice(0, 6).map(ub => {
                  const badge = BADGES.find(b => b.id === ub.badgeId);
                  if (!badge) return null;
                  return (
                    <Pressable key={badge.id} onPress={() => setSelectedBadgeId(badge.id)} style={[s.recentBadge, { borderColor: badge.color + '30' }]}>
                      <View style={[s.recentBadgeIcon, { backgroundColor: badge.color + '20' }]}><MaterialIcons name={badge.icon as any} size={22} color={badge.color} /></View>
                      <Text style={[s.recentBadgeName, { color: badge.color }]} numberOfLines={2}>{getBadgeName(badge.id, lang)}</Text>
                      <Text style={s.recentBadgeDate}>{new Date(ub.unlockedAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' })}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
          <View style={s.filterRow}>
            {CATEGORY_ORDER.map(catId => {
              const isActive = activeCategory === catId;
              const meta = catId === 'all' ? { icon: 'grid-view', color: theme.primary } : CATEGORY_META[catId];
              const label = catId === 'all' ? (isFr ? 'Tous' : 'All') : getBadgeCategoryLabel(catId, lang);
              const count = catId === 'all' ? BADGES.length : BADGES.filter(b => b.category === catId).length;
              return (
                <Pressable key={catId} style={[s.filterChip, isActive && { backgroundColor: meta.color, borderColor: meta.color }]} onPress={() => setActiveCategory(catId)}>
                  <MaterialIcons name={meta.icon as any} size={13} color={isActive ? '#FFF' : meta.color} />
                  <Text style={[s.filterChipText, isActive && { color: '#FFF' }]}>{label}</Text>
                  <View style={[s.filterChipCount, isActive && { backgroundColor: 'rgba(255,255,255,0.25)' }]}><Text style={[s.filterChipCountText, isActive && { color: '#FFF' }]}>{count}</Text></View>
                </Pressable>
              );
            })}
          </View>
          {activeCatStats ? (
            <View style={[s.catSummaryCard, { borderLeftColor: activeCatStats.color, borderLeftWidth: 4 }]}>
              <View style={s.catSummaryTop}>
                <View style={[s.catSummaryIcon, { backgroundColor: activeCatStats.color + '15' }]}><MaterialIcons name={activeCatStats.icon as any} size={22} color={activeCatStats.color} /></View>
                <View style={{ flex: 1 }}><Text style={s.catSummaryTitle}>{isFr ? activeCatStats.labelFr : activeCatStats.labelEn}</Text><Text style={s.catSummarySub}>{activeCatStats.unlocked} / {activeCatStats.total} {isFr ? 'debloques' : 'unlocked'}</Text></View>
                <Text style={[s.catSummaryPercent, { color: activeCatStats.color }]}>{activeCatStats.percent}%</Text>
              </View>
              <View style={s.catSummaryBarTrack}><View style={[s.catSummaryBarFill, { width: `${Math.max(3, activeCatStats.percent)}%`, backgroundColor: activeCatStats.color }]} /></View>
            </View>
          ) : null}
        </View>
      );
    }

    if (section.key === 'footer' && item.type === 'header') {
      return (
        <View style={s.scrollContent}>
          <View style={s.xpCard}>
            <View style={s.xpCardHeader}><MaterialIcons name="bolt" size={18} color="#F59E0B" /><Text style={s.xpCardTitle}>{isFr ? "Sources d'XP" : 'XP Sources'}</Text></View>
            <View style={s.xpGrid}>
              {[
                { icon: 'sports', color: '#3B82F6', label: isFr ? 'Matchs' : 'Matches', value: `+${XP_PER_MATCH}` },
                { icon: 'star', color: '#F59E0B', label: 'Carreaux', value: `+${XP_PER_CARREAU}` },
                { icon: 'share', color: '#EC4899', label: isFr ? 'Partages' : 'Shares', value: `+${XP_PER_SHARE_ACCEPTED}` },
                { icon: 'military-tech', color: '#10B981', label: 'Badges', value: `+${XP_PER_BADGE}` },
              ].map((it, i) => (
                <View key={i} style={s.xpGridItem}><View style={[s.xpGridIcon, { backgroundColor: it.color + '15' }]}><MaterialIcons name={it.icon as any} size={16} color={it.color} /></View><Text style={s.xpGridLabel}>{it.label}</Text><Text style={[s.xpGridValue, { color: it.color }]}>{it.value}</Text></View>
              ))}
            </View>
          </View>
          <View style={s.milestonesCard}>
            <Text style={s.sectionLabel}>{isFr ? 'NIVEAUX' : 'LEVELS'}</Text>
            <View style={s.milestoneTrack}>
              {XP_LEVELS.map((lvl, i) => {
                const reached = xp >= lvl.minXp;
                const isCurrent = level.name === lvl.name;
                const colors = ['#10B981', '#3B82F6', '#F59E0B', '#F97316', '#EF4444', '#8B5CF6', '#EC4899', '#FFD700'];
                const lvlColor = colors[i % colors.length];
                return (
                  <View key={lvl.name} style={s.milestoneItem}>
                    {i > 0 ? <View style={[s.milestoneConnector, reached && { backgroundColor: lvlColor + '60' }]} /> : null}
                    <View style={[s.milestoneCircle, reached && { backgroundColor: lvlColor + '20', borderColor: lvlColor }, isCurrent && { backgroundColor: lvlColor, borderColor: lvlColor }]}><MaterialIcons name={lvl.icon as any} size={16} color={isCurrent ? '#FFF' : reached ? lvlColor : theme.textMuted} /></View>
                    <Text style={[s.milestoneName, isCurrent && { color: lvlColor, fontWeight: '700' }, reached && !isCurrent && { color: theme.textPrimary }]} numberOfLines={1}>{isFr ? lvl.name : lvl.nameEn}</Text>
                    <Text style={[s.milestoneXp, reached && { color: lvlColor }]}>{lvl.minXp}</Text>
                  </View>
                );
              })}
            </View>
          </View>
          <View style={{ height: 40 }} />
        </View>
      );
    }

    if (item.type === 'badge') {
      return (
        <View style={s.scrollContent}>
          <BadgeItem badge={item.badge} lang={lang} isFr={isFr} isUnlocked={item.isUnlocked} unlockedAt={item.unlockedAt} onPress={() => setSelectedBadgeId(item.badge.id)} />
        </View>
      );
    }
    return null;
  }, [xp, language, isFr, lang, userBadges.length, totalBadges, categoryStats, activeCategory, activeCatStats, recentlyUnlocked, level]);

  const renderSectionHeader = useCallback(({ section }: { section: Section }) => {
    if (section.key === 'header' || section.key === 'footer') return null;
    const isCollapsed = collapsedSections[section.key === 'unlocked' ? 'unlocked' : 'locked'];
    const isUnlockedSection = section.key === 'unlocked';
    return (
      <Pressable style={[s.scrollContent, s.collapsibleHeader]} onPress={() => toggleSection(section.key === 'unlocked' ? 'unlocked' : 'locked')}>
        <View style={s.listSectionHeader}>
          <MaterialIcons name={isUnlockedSection ? 'check-circle' : 'lock-outline'} size={16} color={isUnlockedSection ? theme.success : theme.textMuted} />
          <Text style={[s.listSectionTitle, !isUnlockedSection && { color: theme.textMuted }]}>{section.title}</Text>
          <View style={{ flex: 1 }} />
          <MaterialIcons name={isCollapsed ? 'expand-more' : 'expand-less'} size={20} color={theme.textMuted} />
        </View>
      </Pressable>
    );
  }, [collapsedSections, toggleSection]);

  const keyExtractor = useCallback((item: SectionItem, index: number) => {
    if (item.type === 'badge') return item.badge.id;
    return `section-${index}`;
  }, []);

  return (
    <SectionList
      sections={sections}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      initialNumToRender={10}
      maxToRenderPerBatch={8}
      windowSize={5}
      removeClippedSubviews={Platform.OS !== 'web'}
      style={s.scroll}
    />
  );
}

// ============================================
// Badge Detail Modal Component
// ============================================
function BadgeDetailModal({ badgeId, visible, onClose, language, isUnlocked, unlockedAt }: {
  badgeId: string | null;
  visible: boolean;
  onClose: () => void;
  language: 'fr' | 'en';
  isUnlocked: boolean;
  unlockedAt: string | null;
}) {
  const badge = BADGES.find(b => b.id === badgeId);
  const isFr = language === 'fr';
  if (!badge || !badgeId) return null;

  const catLabel = getBadgeCategoryLabel(badge.category, language);
  const catMeta = CATEGORY_META[badge.category];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={dm.container}>
        <View style={dm.header}>
          <Pressable style={dm.closeBtn} onPress={onClose} hitSlop={12}>
            <MaterialIcons name="close" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={dm.headerTitle}>{isFr ? 'Detail du badge' : 'Badge Detail'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={dm.content} showsVerticalScrollIndicator={false}>
          {/* Hero */}
          <LinearGradient
            colors={[badge.color + '18', badge.color + '06', theme.surface]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={dm.hero}
          >
            <View style={[dm.iconOuter, { backgroundColor: badge.color + '15' }]}>
              <View style={[dm.iconInner, { backgroundColor: isUnlocked ? badge.color : badge.color + '30' }]}>
                <MaterialIcons name={badge.icon as any} size={48} color="#FFF" />
              </View>
              {isUnlocked ? (
                <View style={[dm.checkBadge, { backgroundColor: '#22C55E' }]}>
                  <MaterialIcons name="check" size={14} color="#FFF" />
                </View>
              ) : null}
            </View>

            <Text style={[dm.badgeName, { color: isUnlocked ? badge.color : theme.textPrimary }]}>
              {getBadgeName(badgeId, language)}
            </Text>

            <View style={[dm.catChip, { backgroundColor: catMeta.color + '12' }]}>
              <MaterialIcons name={catMeta.icon as any} size={12} color={catMeta.color} />
              <Text style={[dm.catChipText, { color: catMeta.color }]}>{catLabel}</Text>
            </View>

            <View style={[dm.xpRow, { borderColor: badge.color + '25' }]}>
              <MaterialIcons name="bolt" size={18} color="#F59E0B" />
              <Text style={dm.xpText}>+{badge.xpReward} XP</Text>
            </View>
          </LinearGradient>

          {/* Description */}
          <View style={dm.section}>
            <View style={dm.sectionHeader}>
              <MaterialIcons name="info-outline" size={16} color={theme.textSecondary} />
              <Text style={dm.sectionTitle}>{isFr ? 'Description' : 'Description'}</Text>
            </View>
            <Text style={dm.descText}>{getBadgeDescription(badgeId, language)}</Text>
          </View>

          {/* Status */}
          <View style={dm.section}>
            <View style={dm.sectionHeader}>
              <MaterialIcons name={isUnlocked ? 'check-circle' : 'lock-outline'} size={16} color={isUnlocked ? '#22C55E' : theme.textMuted} />
              <Text style={dm.sectionTitle}>{isFr ? 'Statut' : 'Status'}</Text>
            </View>
            {isUnlocked && unlockedAt ? (
              <View style={dm.unlockedRow}>
                <MaterialIcons name="celebration" size={16} color={badge.color} />
                <Text style={[dm.unlockedText, { color: badge.color }]}>
                  {isFr ? 'Debloque le' : 'Unlocked on'}{' '}
                  {new Date(unlockedAt).toLocaleDateString(isFr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' })}
                </Text>
              </View>
            ) : (
              <Text style={dm.lockedText}>{isFr ? 'Ce badge n\'est pas encore debloque. Continuez a jouer pour progresser.' : 'This badge is not yet unlocked. Keep playing to progress.'}</Text>
            )}
          </View>

          {/* Unlocked celebration */}
          {isUnlocked ? (
            <View style={[dm.celebrationCard, { borderColor: badge.color + '25' }]}>
              <MaterialIcons name="emoji-events" size={28} color={badge.color} />
              <Text style={[dm.celebrationTitle, { color: badge.color }]}>
                {isFr ? 'Felicitations !' : 'Congratulations!'}
              </Text>
              <Text style={dm.celebrationText}>
                {isFr
                  ? `Vous avez debloque le badge "${getBadgeName(badgeId, language)}" et gagne ${badge.xpReward} XP.`
                  : `You unlocked the "${getBadgeName(badgeId, language)}" badge and earned ${badge.xpReward} XP.`}
              </Text>
              <Pressable
                style={dm.shareCardBtn}
                onPress={() => { onClose(); router.push({ pathname: '/share-card', params: { type: 'badge', badgeId } } as any); }}
              >
                <MaterialIcons name="image" size={18} color="#8B5CF6" />
                <Text style={dm.shareCardBtnText}>{isFr ? 'Partager sur les reseaux' : 'Share on Social Media'}</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ============================================
// Badge Detail Modal Styles
// ============================================
const dm = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  hero: { borderRadius: 24, padding: 28, alignItems: 'center', marginBottom: 20, ...theme.shadows.card },
  iconOuter: { width: 120, height: 120, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16, position: 'relative' },
  iconInner: { width: 88, height: 88, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 16 }, android: { elevation: 10 } }) },
  checkBadge: { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: theme.surface },
  badgeName: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 8, letterSpacing: -0.3 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, marginBottom: 12 },
  catChipText: { fontSize: 12, fontWeight: '600' },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F59E0B10', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  xpText: { fontSize: 16, fontWeight: '800', color: '#F59E0B' },
  section: { backgroundColor: theme.surface, borderRadius: 18, padding: 16, marginBottom: 14, ...theme.shadows.card },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, flex: 1 },
  descText: { fontSize: 15, color: theme.textSecondary, lineHeight: 22 },
  lockedText: { fontSize: 14, color: theme.textMuted, lineHeight: 20 },
  unlockedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12 },
  unlockedText: { fontSize: 13, fontWeight: '600' },
  celebrationCard: { backgroundColor: theme.surface, borderRadius: 18, padding: 24, alignItems: 'center', gap: 8, borderWidth: 1, ...theme.shadows.card },
  celebrationTitle: { fontSize: 18, fontWeight: '800' },
  celebrationText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20 },
  shareCardBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, backgroundColor: '#8B5CF6' + '12', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1.5, borderColor: '#8B5CF6' + '25' },
  shareCardBtnText: { fontSize: 13, fontWeight: '700', color: '#8B5CF6' },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerBack: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },
  collapsibleHeader: { paddingTop: 6, paddingBottom: 0 },
  sectionLabel: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, letterSpacing: 1, marginBottom: 14 },

  // Progress Hero
  progressHero: { borderRadius: 20, padding: 20, marginTop: 16, marginBottom: 16, overflow: 'hidden', position: 'relative' },
  progressHeroDecoCircle: { position: 'absolute', top: -20, right: -15, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.06)' },
  progressHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  progressHeroLeft: { flexDirection: 'row', alignItems: 'baseline' },
  progressHeroCount: { fontSize: 48, fontWeight: '900', color: '#FFF', letterSpacing: -1 },
  progressHeroMax: { fontSize: 18, fontWeight: '600', color: 'rgba(255,255,255,0.5)' },
  progressHeroRight: { flex: 1 },
  progressHeroLabel: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginBottom: 8 },
  progressHeroBarTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 4, overflow: 'hidden', marginBottom: 4 },
  progressHeroBarFill: { height: '100%', backgroundColor: '#FCD34D', borderRadius: 4 },
  progressHeroPercent: { fontSize: 11, fontWeight: '700', color: '#FCD34D' },

  // Category Progress
  catProgressScroll: { gap: 10, paddingBottom: 4, paddingRight: 4 },
  catProgressCard: { width: 118, minHeight: 120, backgroundColor: theme.surface, borderRadius: 14, padding: 12, alignItems: 'center', justifyContent: 'flex-start', gap: 6, borderWidth: 1.5, borderColor: theme.border, ...theme.shadows.card },
  catProgressIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  catProgressLabel: { fontSize: 11, fontWeight: '600', color: theme.textSecondary, textAlign: 'center', lineHeight: 14, minHeight: 28 },
  catProgressCount: { fontSize: 14, fontWeight: '800' },
  catProgressBarTrack: { width: '100%', height: 4, backgroundColor: theme.backgroundSecondary, borderRadius: 2, overflow: 'hidden' },
  catProgressBarFill: { height: '100%', borderRadius: 2 },

  // Recently Unlocked
  recentSection: { marginTop: 16, marginBottom: 8 },
  recentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  recentTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  recentBadge: { width: 112, minHeight: 116, backgroundColor: theme.surface, borderRadius: 14, padding: 10, alignItems: 'center', justifyContent: 'flex-start', gap: 6, borderWidth: 1, ...theme.shadows.card },
  recentBadgeIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  recentBadgeName: { fontSize: 10, fontWeight: '700', textAlign: 'center', lineHeight: 13, minHeight: 26 },
  recentBadgeDate: { fontSize: 9, color: theme.textMuted, fontWeight: '500' },

  // Filter chips
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 16, marginBottom: 14 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, minHeight: 36, borderRadius: 20, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  filterChipText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary, flexShrink: 1 },
  filterChipCount: { backgroundColor: theme.backgroundSecondary, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, marginLeft: 2 },
  filterChipCountText: { fontSize: 10, fontWeight: '700', color: theme.textMuted },

  // Category summary card
  catSummaryCard: { backgroundColor: theme.surface, borderRadius: 16, padding: 16, marginBottom: 14, ...theme.shadows.card },
  catSummaryTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  catSummaryIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  catSummaryTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },
  catSummarySub: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  catSummaryPercent: { fontSize: 22, fontWeight: '900' },
  catSummaryBarTrack: { height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden' },
  catSummaryBarFill: { height: '100%', borderRadius: 3 },

  // List section headers
  listSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginTop: 6 },
  listSectionTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },

  // Badge Cards
  badgeCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 10, minHeight: 104, overflow: 'hidden', ...theme.shadows.card },
  badgeCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  badgeCardIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  badgeCheckmark: { position: 'absolute', bottom: -2, right: -2, width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.surface },
  badgeCardInfo: { flex: 1, flexShrink: 1, minWidth: 0 },
  badgeCardNameRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  badgeCardName: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, flex: 1, flexShrink: 1, minWidth: 0, lineHeight: 19 },
  badgeXpChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: theme.borderRadius.full, flexShrink: 0, alignSelf: 'flex-start' },
  badgeXpText: { fontSize: 11, fontWeight: '700', color: theme.textMuted },
  badgeCardDesc: { fontSize: 13, color: theme.textSecondary, lineHeight: 18, marginBottom: 10, flexShrink: 1 },
  badgeUnlockDate: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badgeUnlockDateText: { fontSize: 12, fontWeight: '600', flexShrink: 1, lineHeight: 16 },
  badgeProgressSection: { gap: 6 },
  badgeProgressBarOuter: { height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden' },
  badgeProgressBarInner: { height: '100%', borderRadius: 3, minWidth: 4 },

  // XP Card
  xpCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginTop: 8, marginBottom: 16, ...theme.shadows.card },
  xpCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  xpCardTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  xpGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  xpGridItem: { alignItems: 'center', gap: 4, flex: 1 },
  xpGridIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  xpGridLabel: { fontSize: 11, fontWeight: '600', color: theme.textSecondary },
  xpGridValue: { fontSize: 14, fontWeight: '800' },

  // Milestones
  milestonesCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 20, overflow: 'hidden', ...theme.shadows.card },
  milestoneTrack: { flexDirection: 'row', justifyContent: 'space-between' },
  milestoneItem: { alignItems: 'center', flex: 1, position: 'relative' },
  milestoneConnector: { position: 'absolute', top: 18, left: -16, right: 16, height: 2, backgroundColor: theme.border, zIndex: -1 },
  milestoneCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.backgroundSecondary, borderWidth: 2, borderColor: theme.border, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  milestoneName: { fontSize: 8, fontWeight: '600', color: theme.textMuted, textAlign: 'center', lineHeight: 10, minHeight: 20 },
  milestoneXp: { fontSize: 8, fontWeight: '500', color: theme.textMuted, marginTop: 1 },
});
