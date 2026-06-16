import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, Linking, Dimensions,
  RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { fetchAmbassadorsOnly, Ambassador, isUserAmbassador } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import { useAuth } from '@/template';

const SOCIAL_CONFIG: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  youtube: { icon: 'play-arrow', color: '#FF0000', bg: '#FF000010', label: 'YouTube' },
  tiktok: { icon: 'music-note', color: '#010101', bg: '#01010108', label: 'TikTok' },
  instagram: { icon: 'camera-alt', color: '#E4405F', bg: '#E4405F10', label: 'Instagram' },
  twitter: { icon: 'alternate-email', color: '#1DA1F2', bg: '#1DA1F210', label: 'X' },
  website: { icon: 'language', color: '#6366F1', bg: '#6366F110', label: 'Web' },
};

export default function AmbassadorsScreen() {
  const insets = useSafeAreaInsets();
  const { language } = useLanguage();
  const { t } = useLanguage();
  const { user } = useAuth();
  const fr = language === 'fr';
  const [isAmbassador, setIsAmbassador] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    isUserAmbassador(user.id).then(setIsAmbassador);
  }, [user?.id]);
  const [refreshing, setRefreshing] = useState(false);
  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  const [ambassadors, setAmbassadors] = useState<Ambassador[]>([]);
  const [ambassadorsLoading, setAmbassadorsLoading] = useState(true);
  const { scrollTo } = useLocalSearchParams<{ scrollTo?: string }>();
  const scrollViewRef = React.useRef<ScrollView>(null);
  const ambassadorPositions = React.useRef<Record<string, number>>({});
  const [rankingTab, setRankingTab] = useState<'matches' | 'winRate' | 'engagement'>('matches');

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }: any) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  const loadAmbassadors = useCallback(async () => {
    const { ambassadors: data } = await fetchAmbassadorsOnly();
    setAmbassadors(data);
    setAmbassadorsLoading(false);
  }, []);

  useEffect(() => { loadAmbassadors(); }, [loadAmbassadors]);

  useEffect(() => {
    if (scrollTo && !ambassadorsLoading && ambassadors.length > 0) {
      setTimeout(() => {
        const y = ambassadorPositions.current[scrollTo];
        if (y !== undefined && scrollViewRef.current) {
          scrollViewRef.current.scrollTo({ y: y - 20, animated: true });
        }
      }, 500);
    }
  }, [scrollTo, ambassadorsLoading, ambassadors]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAmbassadors();
    setRefreshing(false);
  };

  const handleSocialPress = (amb: Ambassador, platform: string, url: string) => {
    Haptics.selectionAsync();
    trackAmbassadorEvent(amb.id, 'social_click', platform);
    Linking.openURL(url);
  };

  const rankedAmbassadors = useMemo(() => {
    if (ambassadors.length < 2) return [];
    const withScore = ambassadors.map(amb => {
      const socialCount = [amb.youtubeUrl, amb.tiktokUrl, amb.instagramHandle, amb.twitterHandle, amb.websiteUrl].filter(Boolean).length;
      let score = 0;
      let displayValue = '';
      switch (rankingTab) {
        case 'matches': score = amb.stats?.matchesPlayed || 0; displayValue = `${score}`; break;
        case 'winRate': score = amb.stats?.winRate || 0; displayValue = `${score}%`; break;
        case 'engagement': score = socialCount; displayValue = `${score}`; break;
      }
      return { ...amb, score, displayValue, socialCount };
    });
    return withScore.sort((a, b) => b.score - a.score).slice(0, 3);
  }, [ambassadors, rankingTab]);

  const renderSocialChips = (amb: Ambassador) => {
    const links: { platform: string; url: string; label: string }[] = [];
    if (amb.youtubeUrl) links.push({ platform: 'youtube', url: amb.youtubeUrl, label: 'YouTube' });
    if (amb.tiktokUrl) links.push({ platform: 'tiktok', url: amb.tiktokUrl, label: 'TikTok' });
    if (amb.instagramHandle) {
      const handle = amb.instagramHandle.replace('@', '');
      links.push({ platform: 'instagram', url: `https://instagram.com/${handle}`, label: `@${handle}` });
    }
    if (amb.twitterHandle) {
      const handle = amb.twitterHandle.replace('@', '');
      links.push({ platform: 'twitter', url: `https://x.com/${handle}`, label: amb.twitterHandle });
    }
    if (amb.websiteUrl) {
      const url = amb.websiteUrl.startsWith('http') ? amb.websiteUrl : `https://${amb.websiteUrl}`;
      links.push({ platform: 'website', url, label: 'Web' });
    }
    if (links.length === 0) return null;
    return (
      <View style={styles.socialRow}>
        {links.map((link) => {
          const cfg = SOCIAL_CONFIG[link.platform];
          return (
            <Pressable
              key={link.platform}
              style={({ pressed }) => [styles.socialChip, { backgroundColor: cfg.bg, borderColor: cfg.color + '18' }, pressed && { opacity: 0.75, transform: [{ scale: 0.96 }] }]}
              onPress={() => handleSocialPress(amb, link.platform, link.url)}
            >
              <MaterialIcons name={cfg.icon as any} size={14} color={cfg.color} />
              <Text style={[styles.socialChipText, { color: cfg.color }]} numberOfLines={1}>{link.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  };

  const renderAmbassadorCard = (amb: Ambassador, index: number) => (
    <Animated.View
      key={amb.id}
      entering={FadeInDown.duration(450).delay(80 + index * 100)}
      onLayout={(e) => { ambassadorPositions.current[amb.id] = e.nativeEvent.layout.y; }}
    >
      <Pressable
        style={({ pressed }) => [styles.ambCard, pressed && { transform: [{ scale: 0.985 }], opacity: 0.95 }, scrollTo === amb.id && styles.ambCardHighlight]}
        onPress={() => { trackAmbassadorEvent(amb.id, 'profile_view'); if (amb.playerId) router.push(`/player/${amb.playerId}` as any); }}
      >
        <LinearGradient colors={['#7C3AED', '#A855F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ambAccentBar} />
        <View style={styles.ambHeader}>
          <View style={styles.ambAvatarWrap}>
            {amb.photo ? (
              <Image source={{ uri: amb.photo }} style={styles.ambAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
            ) : (
              <LinearGradient colors={['#7C3AED', '#A855F7']} style={[styles.ambAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={styles.ambAvatarLetter}>{amb.displayName.charAt(0)}</Text>
              </LinearGradient>
            )}
            <View style={styles.ambVerifiedBadge}><MaterialIcons name="verified" size={14} color="#FFF" /></View>
          </View>
          <View style={styles.ambInfo}>
            <Text style={styles.ambName} numberOfLines={1}>{amb.displayName}</Text>
            <View style={styles.ambBadgeRow}>
              <View style={styles.ambBadgePill}>
                <MaterialIcons name="verified" size={10} color="#7C3AED" />
                <Text style={styles.ambBadgePillText}>{fr ? 'Ambassadeur' : 'Ambassador'}</Text>
              </View>
            </View>
            {(amb.role || amb.club || amb.city) ? (
              <Text style={styles.ambMeta} numberOfLines={1}>
                {[amb.role ? t('roles', amb.role) : null, amb.club, amb.city].filter(Boolean).join(' • ')}
              </Text>
            ) : null}
          </View>
          {amb.playerId ? (
            <View style={styles.ambArrowBtn}><MaterialIcons name="arrow-forward" size={18} color="#7C3AED" /></View>
          ) : null}
        </View>
        {amb.bio ? <Text style={styles.ambBio} numberOfLines={3}>{amb.bio}</Text> : null}
        {amb.stats ? (
          <View style={styles.ambStatsRow}>
            <View style={styles.ambStatItem}>
              <Text style={[styles.ambStatValue, { color: theme.success }]}>{amb.stats.winRate}%</Text>
              <Text style={styles.ambStatLabel}>{fr ? 'Victoires' : 'Win rate'}</Text>
            </View>
            <View style={styles.ambStatDivider} />
            <View style={styles.ambStatItem}>
              <Text style={styles.ambStatValue}>{amb.stats.matchesPlayed}</Text>
              <Text style={styles.ambStatLabel}>{t('leaderboard', 'matches')}</Text>
            </View>
            <View style={styles.ambStatDivider} />
            <View style={styles.ambStatItem}>
              <Text style={[styles.ambStatValue, { color: theme.tirColor }]}>{amb.stats.tirRate > 0 ? `${amb.stats.tirRate}%` : '-'}</Text>
              <Text style={styles.ambStatLabel}>Tir</Text>
            </View>
            <View style={styles.ambStatDivider} />
            <View style={styles.ambStatItem}>
              <Text style={[styles.ambStatValue, { color: theme.carreauColor }]}>{amb.stats.carreauRate > 0 ? `${amb.stats.carreauRate}%` : '-'}</Text>
              <Text style={styles.ambStatLabel}>Carreau</Text>
            </View>
          </View>
        ) : null}
        {renderSocialChips(amb)}
      </Pressable>
    </Animated.View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} hitSlop={8}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <MaterialIcons name="verified" size={18} color="#7C3AED" />
          <Text style={styles.headerTitle}>{fr ? 'Nos Ambassadeurs' : 'Our Ambassadors'}</Text>
        </View>
        {isAmbassador ? (
          <Pressable
            style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: '#7C3AED15', alignItems: 'center', justifyContent: 'center' }}
            onPress={() => router.push('/ambassador-dashboard' as any)}
            hitSlop={4}
          >
            <MaterialIcons name="dashboard" size={20} color="#7C3AED" />
          </Pressable>
        ) : <View style={{ width: 40 }} />}
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }, isTablet && styles.scrollContentTablet]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#7C3AED" colors={['#7C3AED']} />}
      >
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(500)}>
          <LinearGradient colors={['#5B21B6', '#7C3AED', '#A855F7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroGradient}>
            <View style={styles.heroDecoCircle1} />
            <View style={styles.heroDecoCircle2} />
            <View style={styles.heroContent}>
              <View style={styles.heroIconWrap}><MaterialIcons name="verified" size={32} color="#FFF" /></View>
              <Text style={styles.heroTitle}>{fr ? 'Nos Ambassadeurs' : 'Our Ambassadors'}</Text>
              <Text style={styles.heroSubtitle}>
                {fr ? 'Les passionnes qui representent la communaute Ultimate Petanque' : 'The enthusiasts who represent the Ultimate Petanque community'}
              </Text>
              <View style={styles.heroPillsRow}>
                <View style={styles.heroPill}>
                  <MaterialIcons name="people" size={14} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.heroPillText}>{ambassadors.length} {fr ? 'ambassadeurs' : 'ambassadors'}</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Podium */}
        {!ambassadorsLoading && rankedAmbassadors.length >= 2 ? (
          <Animated.View entering={FadeInDown.duration(450).delay(100)} style={styles.podiumSection}>
            <View style={styles.sectionLabel}>
              <View style={styles.sectionLabelLine} />
              <Text style={styles.sectionLabelText}>{fr ? 'CLASSEMENT' : 'RANKINGS'}</Text>
              <View style={styles.sectionLabelLine} />
            </View>
            <View style={styles.podiumTabs}>
              {([
                { key: 'matches' as const, label: fr ? 'Matchs' : 'Matches', icon: 'sports' },
                { key: 'winRate' as const, label: fr ? 'Victoires' : 'Win Rate', icon: 'emoji-events' },
                { key: 'engagement' as const, label: fr ? 'Reseaux' : 'Social', icon: 'share' },
              ]).map(tab => {
                const isActive = rankingTab === tab.key;
                return (
                  <Pressable key={tab.key} style={[styles.podiumTab, isActive && styles.podiumTabActive]} onPress={() => { Haptics.selectionAsync(); setRankingTab(tab.key); }}>
                    <MaterialIcons name={tab.icon as any} size={14} color={isActive ? '#FFF' : '#7C3AED'} />
                    <Text style={[styles.podiumTabText, isActive && styles.podiumTabTextActive]}>{tab.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.podiumRow}>
              {rankedAmbassadors[1] ? (
                <Animated.View entering={FadeInDown.duration(500).delay(250)} style={styles.podiumCol}>
                  <Pressable style={styles.podiumCard} onPress={() => rankedAmbassadors[1].playerId ? router.push(`/player/${rankedAmbassadors[1].playerId}` as any) : null}>
                    <View style={[styles.podiumBar, styles.podiumBarSilver]}><Text style={styles.podiumRank}>2</Text></View>
                    <View style={styles.podiumAvatarWrap}>
                      {rankedAmbassadors[1].photo ? (
                        <Image source={{ uri: rankedAmbassadors[1].photo }} style={styles.podiumAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                      ) : (
                        <LinearGradient colors={['#90A4AE', '#78909C']} style={[styles.podiumAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={styles.podiumAvatarLetter}>{rankedAmbassadors[1].displayName.charAt(0)}</Text>
                        </LinearGradient>
                      )}
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{rankedAmbassadors[1].displayName}</Text>
                    <Text style={[styles.podiumValue, { color: '#78909C' }]}>{rankedAmbassadors[1].displayValue}</Text>
                    <Text style={styles.podiumMetric}>{rankingTab === 'matches' ? (fr ? 'matchs' : 'matches') : rankingTab === 'winRate' ? (fr ? 'victoires' : 'win rate') : (fr ? 'reseaux' : 'social')}</Text>
                  </Pressable>
                </Animated.View>
              ) : null}
              {rankedAmbassadors[0] ? (
                <Animated.View entering={FadeInDown.duration(500).delay(150)} style={[styles.podiumCol, styles.podiumColGold]}>
                  <Pressable style={styles.podiumCard} onPress={() => rankedAmbassadors[0].playerId ? router.push(`/player/${rankedAmbassadors[0].playerId}` as any) : null}>
                    <View style={[styles.podiumBar, styles.podiumBarGold]}><MaterialIcons name="emoji-events" size={18} color="#FFF" /><Text style={styles.podiumRank}>1</Text></View>
                    <View style={[styles.podiumAvatarWrap, styles.podiumAvatarWrapGold]}>
                      {rankedAmbassadors[0].photo ? (
                        <Image source={{ uri: rankedAmbassadors[0].photo }} style={styles.podiumAvatarGold} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                      ) : (
                        <LinearGradient colors={['#F9E547', '#D4A017']} style={[styles.podiumAvatarGold, { alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={[styles.podiumAvatarLetter, { fontSize: 24 }]}>{rankedAmbassadors[0].displayName.charAt(0)}</Text>
                        </LinearGradient>
                      )}
                    </View>
                    <Text style={[styles.podiumName, { fontSize: 14, fontWeight: '800' }]} numberOfLines={1}>{rankedAmbassadors[0].displayName}</Text>
                    <Text style={[styles.podiumValue, { color: '#D4A017', fontSize: 22 }]}>{rankedAmbassadors[0].displayValue}</Text>
                    <Text style={styles.podiumMetric}>{rankingTab === 'matches' ? (fr ? 'matchs' : 'matches') : rankingTab === 'winRate' ? (fr ? 'victoires' : 'win rate') : (fr ? 'reseaux' : 'social')}</Text>
                  </Pressable>
                </Animated.View>
              ) : null}
              {rankedAmbassadors[2] ? (
                <Animated.View entering={FadeInDown.duration(500).delay(350)} style={styles.podiumCol}>
                  <Pressable style={styles.podiumCard} onPress={() => rankedAmbassadors[2].playerId ? router.push(`/player/${rankedAmbassadors[2].playerId}` as any) : null}>
                    <View style={[styles.podiumBar, styles.podiumBarBronze]}><Text style={styles.podiumRank}>3</Text></View>
                    <View style={styles.podiumAvatarWrap}>
                      {rankedAmbassadors[2].photo ? (
                        <Image source={{ uri: rankedAmbassadors[2].photo }} style={styles.podiumAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                      ) : (
                        <LinearGradient colors={['#D7CCC8', '#A1887F']} style={[styles.podiumAvatar, { alignItems: 'center', justifyContent: 'center' }]}>
                          <Text style={styles.podiumAvatarLetter}>{rankedAmbassadors[2].displayName.charAt(0)}</Text>
                        </LinearGradient>
                      )}
                    </View>
                    <Text style={styles.podiumName} numberOfLines={1}>{rankedAmbassadors[2].displayName}</Text>
                    <Text style={[styles.podiumValue, { color: '#A1887F' }]}>{rankedAmbassadors[2].displayValue}</Text>
                    <Text style={styles.podiumMetric}>{rankingTab === 'matches' ? (fr ? 'matchs' : 'matches') : rankingTab === 'winRate' ? (fr ? 'victoires' : 'win rate') : (fr ? 'reseaux' : 'social')}</Text>
                  </Pressable>
                </Animated.View>
              ) : null}
            </View>
          </Animated.View>
        ) : null}

        {/* Ambassador Cards */}
        {ambassadorsLoading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#7C3AED" />
            <Text style={styles.loadingText}>{fr ? 'Chargement...' : 'Loading...'}</Text>
          </View>
        ) : ambassadors.length > 0 ? (
          <View style={styles.ambSection}>
            <Animated.View entering={FadeIn.duration(300).delay(60)} style={styles.sectionLabel}>
              <View style={styles.sectionLabelLine} />
              <Text style={styles.sectionLabelText}>{fr ? 'AMBASSADEURS' : 'AMBASSADORS'}</Text>
              <View style={styles.sectionLabelLine} />
            </Animated.View>
            {ambassadors.map((amb, idx) => renderAmbassadorCard(amb, idx))}
          </View>
        ) : (
          <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.ambEmptyState}>
            <View style={styles.ambEmptyIconBg}><MaterialIcons name="verified" size={40} color="#7C3AED" /></View>
            <Text style={styles.ambEmptyTitle}>{fr ? 'Bientot disponible' : 'Coming soon'}</Text>
            <Text style={styles.ambEmptyDesc}>{fr ? 'Notre programme ambassadeur est en cours de lancement.' : 'Our ambassador program is launching soon.'}</Text>
            <Pressable
              style={({ pressed }) => [styles.ambEmptyBtn, pressed && { opacity: 0.85 }]}
              onPress={() => { Haptics.selectionAsync(); Linking.openURL('mailto:ultimate.petanque.app@gmail.com?subject=Programme%20Ambassadeur%20Ultimate%20Petanque'); }}
            >
              <MaterialIcons name="email" size={16} color="#FFF" />
              <Text style={styles.ambEmptyBtnText}>{fr ? 'Devenir ambassadeur' : 'Become an ambassador'}</Text>
            </Pressable>
          </Animated.View>
        )}

        {/* CTA */}
        {!ambassadorsLoading ? (
        <Animated.View entering={FadeIn.duration(300)}>
          <LinearGradient colors={['#5B21B6', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.ctaGradient}>
            <View style={styles.ctaDecoCircle} />
            <View style={styles.ctaContent}>
              <View style={styles.ctaIconBg}><MaterialIcons name="campaign" size={28} color="#FFF" /></View>
              <Text style={styles.ctaTitle}>{fr ? 'Rejoignez le programme' : 'Join the program'}</Text>
              <Text style={styles.ctaDescription}>
                {fr ? 'Devenez ambassadeur et gagnez en visibilite aupres de la communaute petanque.' : 'Become an ambassador and gain visibility within the petanque community.'}
              </Text>
              <Pressable
                style={({ pressed }) => [styles.ctaButton, pressed && { opacity: 0.9, transform: [{ scale: 0.98 }] }]}
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL('mailto:ultimate.petanque.app@gmail.com?subject=Programme%20Ambassadeur%20Ultimate%20Petanque'); }}
              >
                <MaterialIcons name="email" size={18} color="#7C3AED" />
                <Text style={styles.ctaButtonText}>{fr ? 'Nous contacter' : 'Contact us'}</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </Animated.View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F3FF' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFFFFFEE', borderBottomWidth: 1, borderBottomColor: '#7C3AED10' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: theme.textPrimary },
  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 0 },
  scrollContentTablet: { maxWidth: 960, alignSelf: 'center' as const, width: '100%' },
  // Hero
  heroGradient: { paddingTop: 32, paddingBottom: 36, paddingHorizontal: 24, position: 'relative' as const, overflow: 'hidden' as const },
  heroDecoCircle1: { position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroDecoCircle2: { position: 'absolute', bottom: -20, left: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.04)' },
  heroContent: { alignItems: 'center', position: 'relative' as const, zIndex: 1 },
  heroIconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  heroTitle: { fontSize: 26, fontWeight: '800', color: '#FFF', marginBottom: 10, textAlign: 'center' },
  heroSubtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 21, maxWidth: 340, marginBottom: 20 },
  heroPillsRow: { flexDirection: 'row', gap: 10 },
  heroPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  heroPillText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  // Section Label
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, marginBottom: 18 },
  sectionLabelLine: { flex: 1, height: 1, backgroundColor: theme.border },
  sectionLabelText: { fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 1.5 },
  // Ambassador cards
  ambSection: { paddingHorizontal: 16, paddingTop: 24, marginBottom: 8 },
  ambCard: { backgroundColor: theme.surface, borderRadius: 20, marginBottom: 16, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12 }, android: { elevation: 3 }, default: {} }) },
  ambCardHighlight: { borderWidth: 2, borderColor: '#7C3AED' },
  ambAccentBar: { height: 4, width: '100%' },
  ambHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, paddingBottom: 0 },
  ambAvatarWrap: { position: 'relative' as const },
  ambAvatar: { width: 60, height: 60, borderRadius: 18, overflow: 'hidden' as const },
  ambAvatarLetter: { fontSize: 26, fontWeight: '800', color: '#FFF' },
  ambVerifiedBadge: { position: 'absolute', bottom: -3, right: -3, width: 22, height: 22, borderRadius: 11, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center', borderWidth: 2.5, borderColor: theme.surface },
  ambInfo: { flex: 1, minWidth: 0 },
  ambName: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  ambBadgeRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  ambBadgePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#7C3AED0F', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1, borderColor: '#7C3AED18' },
  ambBadgePillText: { fontSize: 10, fontWeight: '700', color: '#7C3AED' },
  ambMeta: { fontSize: 12, color: theme.textSecondary, marginTop: 4 },
  ambArrowBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#7C3AED0C', alignItems: 'center', justifyContent: 'center' },
  ambBio: { fontSize: 13, color: theme.textSecondary, lineHeight: 20, paddingHorizontal: 18, marginTop: 12 },
  ambStatsRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 18, marginTop: 14, backgroundColor: '#F8F7FF', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8, borderWidth: 1, borderColor: '#7C3AED08' },
  ambStatItem: { flex: 1, alignItems: 'center' },
  ambStatValue: { fontSize: 17, fontWeight: '800', color: theme.textPrimary },
  ambStatLabel: { fontSize: 9, color: theme.textMuted, marginTop: 2, textTransform: 'uppercase' as const, letterSpacing: 0.3 },
  ambStatDivider: { width: 1, height: 26, backgroundColor: '#7C3AED12' },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 18, paddingTop: 14 },
  socialChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1 },
  socialChipText: { fontSize: 12, fontWeight: '600', maxWidth: 120 },
  // Loading/Empty
  loadingState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loadingText: { fontSize: 14, color: theme.textMuted },
  ambEmptyState: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24, marginHorizontal: 16, marginTop: 24, backgroundColor: theme.surface, borderRadius: 24, ...theme.shadows.card },
  ambEmptyIconBg: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#7C3AED0C', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: '#7C3AED15' },
  ambEmptyTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  ambEmptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 21, marginBottom: 20, maxWidth: 280 },
  ambEmptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7C3AED', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  ambEmptyBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  // Podium
  podiumSection: { paddingHorizontal: 16, paddingTop: 20, marginBottom: 8 },
  podiumTabs: { flexDirection: 'row', gap: 8, marginBottom: 18, justifyContent: 'center' },
  podiumTab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#7C3AED0C', borderWidth: 1.5, borderColor: '#7C3AED18' },
  podiumTabActive: { backgroundColor: '#7C3AED', borderColor: '#7C3AED' },
  podiumTabText: { fontSize: 12, fontWeight: '700', color: '#7C3AED' },
  podiumTabTextActive: { color: '#FFF' },
  podiumRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  podiumCol: { flex: 1, alignItems: 'center' },
  podiumColGold: { marginTop: -16 },
  podiumCard: { alignItems: 'center', width: '100%' },
  podiumBar: { width: '100%', borderTopLeftRadius: 14, borderTopRightRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, flexDirection: 'row', gap: 4, minHeight: 40 },
  podiumBarGold: { backgroundColor: '#D4A017', minHeight: 56 },
  podiumBarSilver: { backgroundColor: '#90A4AE', minHeight: 44 },
  podiumBarBronze: { backgroundColor: '#A1887F', minHeight: 36 },
  podiumRank: { fontSize: 16, fontWeight: '900', color: '#FFF' },
  podiumAvatarWrap: { marginTop: -22, marginBottom: 8, borderRadius: 22, borderWidth: 3, borderColor: '#FFF', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6 }, android: { elevation: 4 }, default: {} }) },
  podiumAvatarWrapGold: { marginTop: -28, borderWidth: 3, borderColor: '#FEF3C7' },
  podiumAvatar: { width: 44, height: 44, borderRadius: 19, overflow: 'hidden' as const },
  podiumAvatarGold: { width: 56, height: 56, borderRadius: 24, overflow: 'hidden' as const },
  podiumAvatarLetter: { fontSize: 18, fontWeight: '800', color: '#FFF' },
  podiumName: { fontSize: 12, fontWeight: '700', color: theme.textPrimary, textAlign: 'center', maxWidth: '100%' },
  podiumValue: { fontSize: 18, fontWeight: '900', marginTop: 2 },
  podiumMetric: { fontSize: 9, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.3, marginTop: 1 },
  // CTA
  ctaGradient: { marginHorizontal: 16, marginBottom: 8, borderRadius: 24, overflow: 'hidden', position: 'relative' as const },
  ctaDecoCircle: { position: 'absolute', top: -20, right: -20, width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.06)' },
  ctaContent: { alignItems: 'center', padding: 28, position: 'relative' as const, zIndex: 1 },
  ctaIconBg: { width: 56, height: 56, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  ctaTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', marginBottom: 10, textAlign: 'center' },
  ctaDescription: { fontSize: 13, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 20, marginBottom: 20, maxWidth: 320 },
  ctaButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#FFF', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 16, width: '100%', ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8 }, android: { elevation: 4 }, default: {} }) },
  ctaButtonText: { fontSize: 16, fontWeight: '700', color: '#7C3AED' },
});
