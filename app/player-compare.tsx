/**
 * Player Comparison Page — Side-by-side stat comparison between
 * the current user's player and another player.
 *
 * Accessed from: activity feed cards, player detail pages.
 * Params: playerId (the other player to compare against)
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, G, Polygon, Text as SvgText } from 'react-native-svg';

import theme, { blurhash } from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData } from '@/contexts/AppContext';
import { getSupabaseClient } from '@/template';
import { getEloRank } from '@/services/eloService';
import { BADGES } from '@/services/badgeService';
import * as Haptics from '@/services/haptics';

// ============================================
// Types
// ============================================
interface ComparePlayer {
  id: string;
  name: string;
  avatar?: string;
  club?: string;
  city?: string;
  country?: string;
  role: string;
  eloRating: number;
  level?: string;
  experience?: string;
  stats: {
    matchesPlayed: number;
    wins: number;
    losses: number;
    winRate: number;
    tirRate: number;
    pointRate: number;
    carreauRate: number;
    avgPointsScored: number;
    avgPointsConceded: number;
  };
  badgeCount: number;
  topBadges: { id: string; icon: string; name: string }[];
  eloHistory: { date: string; elo: number }[];
}

// ============================================
// Data fetching
// ============================================
async function fetchCompareData(playerId: string): Promise<ComparePlayer | null> {
  const supabase = getSupabaseClient();
  try {
    const { data: player } = await supabase
      .from('players')
      .select('id, name, avatar, club, city, country, role, elo_rating, level, experience, stats, user_id, is_public')
      .eq('id', playerId)
      .single();

    if (!player) return null;

    // Get badge count
    const { data: badges } = await supabase
      .from('user_badges')
      .select('badge_id')
      .eq('user_id', player.user_id);

    const badgeIds = badges?.map(b => b.badge_id) || [];
    const topBadges = badgeIds.slice(0, 5).map(id => {
      const b = BADGES.find(bg => bg.id === id);
      return { id, icon: b?.icon || '🏅', name: b?.name || id };
    });

    // Get recent ELO history
    const { data: eloData } = await supabase
      .from('elo_history')
      .select('elo_after, recorded_at')
      .eq('player_id', playerId)
      .order('recorded_at', { ascending: true })
      .limit(20);

    const eloHistory = eloData?.map(e => ({
      date: e.recorded_at,
      elo: e.elo_after,
    })) || [];

    const stats = player.stats || {};
    return {
      id: player.id,
      name: player.name,
      avatar: player.avatar,
      club: player.club,
      city: player.city,
      country: player.country || 'France',
      role: player.role,
      eloRating: player.elo_rating || 1000,
      level: player.level,
      experience: player.experience,
      stats: {
        matchesPlayed: stats.matchesPlayed || 0,
        wins: stats.wins || 0,
        losses: stats.losses || 0,
        winRate: stats.winRate || 0,
        tirRate: stats.tirRate || 0,
        pointRate: stats.pointRate || 0,
        carreauRate: stats.carreauRate || 0,
        avgPointsScored: stats.avgPointsScored || 0,
        avgPointsConceded: stats.avgPointsConceded || 0,
      },
      badgeCount: badgeIds.length,
      topBadges,
      eloHistory,
    };
  } catch (e) {
    console.error('[PlayerCompare] Fetch error:', e);
    return null;
  }
}

// ============================================
// COMPARISON BAR
// ============================================
const CompareBar = React.memo(({ label, valueA, valueB, format, higherIsBetter = true }: {
  label: string; valueA: number; valueB: number; format?: 'percent' | 'number' | 'decimal';
  higherIsBetter?: boolean;
}) => {
  const max = Math.max(valueA, valueB, 1);
  const pctA = (valueA / max) * 100;
  const pctB = (valueB / max) * 100;
  const aWins = higherIsBetter ? valueA > valueB : valueA < valueB;
  const bWins = higherIsBetter ? valueB > valueA : valueA > valueB;
  const tied = valueA === valueB;

  const formatVal = (v: number) => {
    if (format === 'percent') return `${Math.round(v)}%`;
    if (format === 'decimal') return v.toFixed(1);
    return String(Math.round(v));
  };

  return (
    <View style={cs.barContainer}>
      <Text style={cs.barLabel}>{label}</Text>
      <View style={cs.barRow}>
        <Text style={[cs.barValue, aWins && cs.barValueWin, tied && cs.barValueTied]}>
          {formatVal(valueA)}
        </Text>
        <View style={cs.barTrack}>
          <View style={cs.barTrackInner}>
            <View style={[cs.barFillLeft, { width: `${pctA}%` }, aWins && cs.barFillWinLeft]} />
          </View>
          <View style={cs.barTrackInner}>
            <View style={[cs.barFillRight, { width: `${pctB}%` }, bWins && cs.barFillWinRight]} />
          </View>
        </View>
        <Text style={[cs.barValue, bWins && cs.barValueWin, tied && cs.barValueTied]}>
          {formatVal(valueB)}
        </Text>
      </View>
    </View>
  );
});

// ============================================
// RADAR CHART
// ============================================
function CompareRadar({ playerA, playerB, lang }: { playerA: ComparePlayer; playerB: ComparePlayer; lang: string }) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 30;

  const labels = [
    lang === 'fr' ? 'Victoires' : 'Win Rate',
    lang === 'fr' ? 'Tir' : 'Shooting',
    lang === 'fr' ? 'Point' : 'Pointing',
    lang === 'fr' ? 'Carreaux' : 'Carreaux',
    lang === 'fr' ? 'Attaque' : 'Attack',
  ];

  const valuesA = [
    playerA.stats.winRate,
    playerA.stats.tirRate,
    playerA.stats.pointRate,
    playerA.stats.carreauRate,
    Math.min(playerA.stats.avgPointsScored * 7.7, 100), // Normalize 0-13 → 0-100
  ];
  const valuesB = [
    playerB.stats.winRate,
    playerB.stats.tirRate,
    playerB.stats.pointRate,
    playerB.stats.carreauRate,
    Math.min(playerB.stats.avgPointsScored * 7.7, 100),
  ];

  const numAxes = labels.length;
  const angleStep = (2 * Math.PI) / numAxes;

  const getPoint = (value: number, index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (Math.min(value, 100) / 100) * maxR;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  };

  const pointsA = valuesA.map((v, i) => getPoint(v, i));
  const pointsB = valuesB.map((v, i) => getPoint(v, i));
  const polyA = pointsA.map(p => `${p.x},${p.y}`).join(' ');
  const polyB = pointsB.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <View style={cs.radarWrap}>
      <Svg width={size} height={size}>
        {[0.25, 0.5, 0.75, 1].map((level, i) => (
          <Circle key={i} cx={cx} cy={cy} r={maxR * level} fill="none" stroke={theme.border} strokeWidth="0.8" strokeDasharray={i < 3 ? '3,3' : undefined} />
        ))}
        {labels.map((label, i) => {
          const angle = i * angleStep - Math.PI / 2;
          const endX = cx + maxR * Math.cos(angle);
          const endY = cy + maxR * Math.sin(angle);
          const labelX = cx + (maxR + 20) * Math.cos(angle);
          const labelY = cy + (maxR + 20) * Math.sin(angle);
          return (
            <G key={i}>
              <Line x1={cx} y1={cy} x2={endX} y2={endY} stroke={theme.border} strokeWidth="0.8" />
              <SvgText x={labelX} y={labelY + 4} fontSize="9" fill={theme.textSecondary} textAnchor="middle" fontWeight="600">{label}</SvgText>
            </G>
          );
        })}
        <Polygon points={polyB} fill="#EF444420" stroke="#EF4444" strokeWidth="2" />
        <Polygon points={polyA} fill="#3B82F620" stroke="#3B82F6" strokeWidth="2" />
        {pointsA.map((p, i) => <Circle key={`a${i}`} cx={p.x} cy={p.y} r={4} fill="#3B82F6" />)}
        {pointsB.map((p, i) => <Circle key={`b${i}`} cx={p.x} cy={p.y} r={4} fill="#EF4444" />)}
      </Svg>
    </View>
  );
}

// ============================================
// MAIN PAGE
// ============================================
export default function PlayerComparePage() {
  const { playerId } = useLocalSearchParams<{ playerId: string }>();
  const { language } = useLanguage();
  const lang = language;
  const fr = lang === 'fr';
  const { selfPlayer, matches } = useAppData();

  const [opponent, setOpponent] = useState<ComparePlayer | null>(null);
  const [loading, setLoading] = useState(true);

  // Build self comparison data
  const selfCompare = useMemo((): ComparePlayer | null => {
    if (!selfPlayer) return null;
    const stats = selfPlayer.stats || {};
    return {
      id: selfPlayer.id,
      name: selfPlayer.name,
      avatar: selfPlayer.avatar,
      club: selfPlayer.club,
      city: selfPlayer.location?.city,
      country: selfPlayer.country || 'France',
      role: selfPlayer.role,
      eloRating: selfPlayer.eloRating || 1000,
      level: selfPlayer.level,
      experience: selfPlayer.experience,
      stats: {
        matchesPlayed: stats.matchesPlayed || 0,
        wins: stats.wins || 0,
        losses: stats.losses || 0,
        winRate: stats.winRate || 0,
        tirRate: stats.tirRate || 0,
        pointRate: stats.pointRate || 0,
        carreauRate: stats.carreauRate || 0,
        avgPointsScored: stats.avgPointsScored || 0,
        avgPointsConceded: stats.avgPointsConceded || 0,
      },
      badgeCount: 0, // Will be filled separately if needed
      topBadges: [],
      eloHistory: [],
    };
  }, [selfPlayer]);

  // Head-to-head stats from matches
  const h2hStats = useMemo(() => {
    if (!selfPlayer || !opponent) return null;
    const h2hMatches = matches.filter(m => {
      const aPlayers = m.teamA.players || [];
      const bPlayers = m.teamB.players || [];
      const selfInA = aPlayers.includes(selfPlayer.id);
      const selfInB = bPlayers.includes(selfPlayer.id);
      const oppInA = aPlayers.includes(opponent.id);
      const oppInB = bPlayers.includes(opponent.id);
      // They must be on opposite teams
      return (selfInA && oppInB) || (selfInB && oppInA);
    });

    let myWins = 0;
    let theirWins = 0;
    h2hMatches.forEach(m => {
      const selfInA = (m.teamA.players || []).includes(selfPlayer.id);
      if (m.winner === 'A' && selfInA) myWins++;
      else if (m.winner === 'B' && selfInA) theirWins++;
      else if (m.winner === 'A' && !selfInA) theirWins++;
      else if (m.winner === 'B' && !selfInA) myWins++;
    });

    return {
      totalMatches: h2hMatches.length,
      myWins,
      theirWins,
      draws: h2hMatches.length - myWins - theirWins,
    };
  }, [selfPlayer, opponent, matches]);

  useEffect(() => {
    if (!playerId) return;
    setLoading(true);
    fetchCompareData(playerId).then(data => {
      setOpponent(data);
      setLoading(false);
    });
  }, [playerId]);

  // Score advantage counter
  const advantageScore = useMemo(() => {
    if (!selfCompare || !opponent) return { me: 0, them: 0 };
    let me = 0;
    let them = 0;
    const compare = (a: number, b: number) => {
      if (a > b) me++;
      else if (b > a) them++;
    };
    compare(selfCompare.stats.winRate, opponent.stats.winRate);
    compare(selfCompare.stats.tirRate, opponent.stats.tirRate);
    compare(selfCompare.stats.pointRate, opponent.stats.pointRate);
    compare(selfCompare.stats.carreauRate, opponent.stats.carreauRate);
    compare(selfCompare.eloRating, opponent.eloRating);
    compare(selfCompare.stats.avgPointsScored, opponent.stats.avgPointsScored);
    compare(opponent.stats.avgPointsConceded, selfCompare.stats.avgPointsConceded); // Lower is better
    return { me, them };
  }, [selfCompare, opponent]);

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{fr ? 'Comparaison' : 'Comparison'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!opponent || !selfCompare) {
    return (
      <SafeAreaView edges={['top']} style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{fr ? 'Comparaison' : 'Comparison'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <MaterialIcons name="person-off" size={48} color={theme.textMuted} />
          <Text style={s.emptyTitle}>{fr ? 'Joueur introuvable' : 'Player not found'}</Text>
          <Text style={s.emptyText}>{fr ? 'Ce joueur n\'est pas disponible pour la comparaison.' : 'This player is not available for comparison.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const selfRank = getEloRank(selfCompare.eloRating);
  const oppRank = getEloRank(opponent.eloRating);

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>{fr ? 'Comparaison' : 'Comparison'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Player Avatars / Identity */}
        <View style={s.identityCard}>
          <LinearGradient colors={['#0F172A', '#1E3A8A']} style={s.identityGradient}>
            <View style={s.identityRow}>
              {/* Self */}
              <Pressable style={s.identityPlayer} onPress={() => router.push('/player/me')}>
                {selfCompare.avatar ? (
                  <Image source={{ uri: selfCompare.avatar }} style={s.identityAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                ) : (
                  <View style={[s.identityAvatarFallback, { backgroundColor: '#3B82F630' }]}>
                    <Text style={[s.identityAvatarLetter, { color: '#60A5FA' }]}>{selfCompare.name.charAt(0)}</Text>
                  </View>
                )}
                <Text style={s.identityName} numberOfLines={1}>{selfCompare.name}</Text>
                <View style={[s.identityRankBadge, { backgroundColor: selfRank.color + '30' }]}>
                  <MaterialIcons name={selfRank.icon as any} size={12} color={selfRank.color} />
                  <Text style={[s.identityRankText, { color: selfRank.color }]}>{selfCompare.eloRating}</Text>
                </View>
                {selfCompare.club ? <Text style={s.identityClub} numberOfLines={1}>{selfCompare.club}</Text> : null}
              </Pressable>

              {/* VS */}
              <View style={s.identityVs}>
                <View style={s.identityVsCircle}>
                  <Text style={s.identityVsText}>VS</Text>
                </View>
                {/* Advantage indicator */}
                {advantageScore.me !== advantageScore.them ? (
                  <View style={[s.advantageBadge, { backgroundColor: advantageScore.me > advantageScore.them ? '#22C55E30' : '#EF444430' }]}>
                    <Text style={[s.advantageText, { color: advantageScore.me > advantageScore.them ? '#22C55E' : '#EF4444' }]}>
                      {advantageScore.me}-{advantageScore.them}
                    </Text>
                  </View>
                ) : (
                  <View style={[s.advantageBadge, { backgroundColor: '#F59E0B30' }]}>
                    <Text style={[s.advantageText, { color: '#F59E0B' }]}>=</Text>
                  </View>
                )}
              </View>

              {/* Opponent */}
              <Pressable style={s.identityPlayer} onPress={() => router.push(`/player/${opponent.id}` as any)}>
                {opponent.avatar ? (
                  <Image source={{ uri: opponent.avatar }} style={s.identityAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
                ) : (
                  <View style={[s.identityAvatarFallback, { backgroundColor: '#EF444430' }]}>
                    <Text style={[s.identityAvatarLetter, { color: '#F87171' }]}>{opponent.name.charAt(0)}</Text>
                  </View>
                )}
                <Text style={s.identityName} numberOfLines={1}>{opponent.name}</Text>
                <View style={[s.identityRankBadge, { backgroundColor: oppRank.color + '30' }]}>
                  <MaterialIcons name={oppRank.icon as any} size={12} color={oppRank.color} />
                  <Text style={[s.identityRankText, { color: oppRank.color }]}>{opponent.eloRating}</Text>
                </View>
                {opponent.club ? <Text style={s.identityClub} numberOfLines={1}>{opponent.club}</Text> : null}
              </Pressable>
            </View>
          </LinearGradient>
        </View>

        {/* H2H Record */}
        {h2hStats && h2hStats.totalMatches > 0 ? (
          <View style={s.h2hCard}>
            <View style={s.h2hHeader}>
              <MaterialIcons name="compare-arrows" size={16} color={theme.accent} />
              <Text style={s.h2hTitle}>{fr ? 'Confrontations directes' : 'Head-to-Head'}</Text>
              <Text style={s.h2hCount}>{h2hStats.totalMatches} {fr ? 'matchs' : 'matches'}</Text>
            </View>
            <View style={s.h2hRow}>
              <View style={s.h2hCol}>
                <Text style={[s.h2hScore, { color: h2hStats.myWins >= h2hStats.theirWins ? '#22C55E' : theme.textSecondary }]}>{h2hStats.myWins}</Text>
                <Text style={s.h2hLabel}>{fr ? 'Victoires' : 'Wins'}</Text>
              </View>
              <View style={s.h2hDivider} />
              <View style={s.h2hCol}>
                <Text style={[s.h2hScore, { color: '#F59E0B' }]}>{h2hStats.draws}</Text>
                <Text style={s.h2hLabel}>{fr ? 'Nuls' : 'Draws'}</Text>
              </View>
              <View style={s.h2hDivider} />
              <View style={s.h2hCol}>
                <Text style={[s.h2hScore, { color: h2hStats.theirWins >= h2hStats.myWins ? '#EF4444' : theme.textSecondary }]}>{h2hStats.theirWins}</Text>
                <Text style={s.h2hLabel}>{fr ? 'Defaites' : 'Losses'}</Text>
              </View>
            </View>
            {/* H2H bar */}
            <View style={s.h2hBar}>
              <View style={[s.h2hBarFillLeft, { flex: Math.max(h2hStats.myWins, 0.1) }]} />
              {h2hStats.draws > 0 ? <View style={[s.h2hBarFillDraw, { flex: h2hStats.draws }]} /> : null}
              <View style={[s.h2hBarFillRight, { flex: Math.max(h2hStats.theirWins, 0.1) }]} />
            </View>
          </View>
        ) : null}

        {/* Radar Chart */}
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <MaterialIcons name="radar" size={16} color={theme.primary} />
            <Text style={s.sectionTitle}>{fr ? 'Profil de jeu' : 'Play Profile'}</Text>
          </View>
          <CompareRadar playerA={selfCompare} playerB={opponent} lang={lang} />
          <View style={s.radarLegend}>
            <View style={s.radarLegendItem}><View style={[s.radarDot, { backgroundColor: '#3B82F6' }]} /><Text style={s.radarLegendText}>{selfCompare.name}</Text></View>
            <View style={s.radarLegendItem}><View style={[s.radarDot, { backgroundColor: '#EF4444' }]} /><Text style={s.radarLegendText}>{opponent.name}</Text></View>
          </View>
        </View>

        {/* Stat Comparison Bars */}
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <MaterialIcons name="bar-chart" size={16} color={theme.primary} />
            <Text style={s.sectionTitle}>{fr ? 'Statistiques detaillees' : 'Detailed Stats'}</Text>
          </View>

          <CompareBar label="ELO" valueA={selfCompare.eloRating} valueB={opponent.eloRating} format="number" />
          <CompareBar label={fr ? 'Matchs joues' : 'Matches played'} valueA={selfCompare.stats.matchesPlayed} valueB={opponent.stats.matchesPlayed} format="number" />
          <CompareBar label={fr ? '% Victoires' : 'Win rate'} valueA={selfCompare.stats.winRate} valueB={opponent.stats.winRate} format="percent" />
          <CompareBar label={fr ? '% Tir' : 'Shooting %'} valueA={selfCompare.stats.tirRate} valueB={opponent.stats.tirRate} format="percent" />
          <CompareBar label={fr ? '% Point' : 'Pointing %'} valueA={selfCompare.stats.pointRate} valueB={opponent.stats.pointRate} format="percent" />
          <CompareBar label={fr ? '% Carreau' : 'Carreau %'} valueA={selfCompare.stats.carreauRate} valueB={opponent.stats.carreauRate} format="percent" />
          <CompareBar label={fr ? 'Moy. pts marques' : 'Avg pts scored'} valueA={selfCompare.stats.avgPointsScored} valueB={opponent.stats.avgPointsScored} format="decimal" />
          <CompareBar label={fr ? 'Moy. pts encaisses' : 'Avg pts conceded'} valueA={selfCompare.stats.avgPointsConceded} valueB={opponent.stats.avgPointsConceded} format="decimal" higherIsBetter={false} />
        </View>

        {/* Badges comparison */}
        {opponent.badgeCount > 0 ? (
          <View style={s.sectionCard}>
            <View style={s.sectionHeader}>
              <MaterialIcons name="emoji-events" size={16} color="#F59E0B" />
              <Text style={s.sectionTitle}>Badges</Text>
              <Text style={s.sectionSubtitle}>{opponent.badgeCount} {fr ? 'debloques' : 'unlocked'}</Text>
            </View>
            <View style={s.badgeRow}>
              {opponent.topBadges.map(b => (
                <View key={b.id} style={s.badgeItem}>
                  <Text style={s.badgeIcon}>{b.icon}</Text>
                  <Text style={s.badgeName} numberOfLines={1}>{b.name}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Quick info */}
        <View style={s.sectionCard}>
          <View style={s.sectionHeader}>
            <MaterialIcons name="info-outline" size={16} color={theme.textSecondary} />
            <Text style={s.sectionTitle}>{fr ? 'Informations' : 'Information'}</Text>
          </View>
          <View style={s.infoGrid}>
            <InfoRow icon="sports" label={fr ? 'Role' : 'Role'} valueA={selfCompare.role} valueB={opponent.role} />
            {selfCompare.city || opponent.city ? <InfoRow icon="place" label={fr ? 'Ville' : 'City'} valueA={selfCompare.city || '—'} valueB={opponent.city || '—'} /> : null}
            {selfCompare.club || opponent.club ? <InfoRow icon="home" label="Club" valueA={selfCompare.club || '—'} valueB={opponent.club || '—'} /> : null}
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// INFO ROW
// ============================================
const InfoRow = React.memo(({ icon, label, valueA, valueB }: {
  icon: string; label: string; valueA: string; valueB: string;
}) => (
  <View style={s.infoRow}>
    <MaterialIcons name={icon as any} size={14} color={theme.textMuted} />
    <Text style={s.infoLabel}>{label}</Text>
    <Text style={s.infoValueA} numberOfLines={1}>{valueA}</Text>
    <Text style={s.infoValueB} numberOfLines={1}>{valueB}</Text>
  </View>
));

// ============================================
// STYLES — Comparison Bars
// ============================================
const cs = StyleSheet.create({
  barContainer: { marginBottom: 14 },
  barLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barValue: { fontSize: 14, fontWeight: '700', color: theme.textSecondary, minWidth: 40, textAlign: 'center' },
  barValueWin: { color: theme.textPrimary, fontSize: 15 },
  barValueTied: { color: '#F59E0B' },
  barTrack: { flex: 1, flexDirection: 'row', height: 8, borderRadius: 4, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  barTrackInner: { flex: 1 },
  barFillLeft: { height: '100%', backgroundColor: '#93C5FD', borderTopLeftRadius: 4, borderBottomLeftRadius: 4, alignSelf: 'flex-end' },
  barFillRight: { height: '100%', backgroundColor: '#FCA5A5', borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  barFillWinLeft: { backgroundColor: '#3B82F6' },
  barFillWinRight: { backgroundColor: '#EF4444' },
  radarWrap: { alignItems: 'center', marginVertical: 8 },
});

// ============================================
// STYLES — Page
// ============================================
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  scroll: { paddingBottom: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginTop: 16 },
  emptyText: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 20 },

  // Identity Card
  identityCard: { marginHorizontal: 16, marginTop: 16, borderRadius: 20, overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#1E3A8A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 12 }, android: { elevation: 6 }, default: {} }) },
  identityGradient: { padding: 24, borderRadius: 20 },
  identityRow: { flexDirection: 'row', alignItems: 'center' },
  identityPlayer: { flex: 1, alignItems: 'center' },
  identityAvatar: { width: 64, height: 64, borderRadius: 20, borderWidth: 3, borderColor: 'rgba(255,255,255,0.3)' },
  identityAvatarFallback: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.2)' },
  identityAvatarLetter: { fontSize: 24, fontWeight: '800' },
  identityName: { fontSize: 14, fontWeight: '700', color: '#FFF', marginTop: 8, textAlign: 'center', maxWidth: 110 },
  identityRankBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginTop: 6 },
  identityRankText: { fontSize: 12, fontWeight: '800' },
  identityClub: { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.5)', marginTop: 4, textAlign: 'center', maxWidth: 100 },
  identityVs: { alignItems: 'center', paddingHorizontal: 8 },
  identityVsCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)' },
  identityVsText: { fontSize: 12, fontWeight: '900', color: '#FFF', letterSpacing: 1 },
  advantageBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginTop: 8 },
  advantageText: { fontSize: 12, fontWeight: '800' },

  // H2H Card
  h2hCard: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: theme.accent + '25', ...Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6 }, android: { elevation: 2 }, default: {} }) },
  h2hHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  h2hTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  h2hCount: { fontSize: 12, fontWeight: '600', color: theme.textMuted },
  h2hRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  h2hCol: { flex: 1, alignItems: 'center' },
  h2hScore: { fontSize: 28, fontWeight: '900' },
  h2hLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, marginTop: 2 },
  h2hDivider: { width: 1, height: 30, backgroundColor: '#E2E8F0' },
  h2hBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  h2hBarFillLeft: { backgroundColor: '#22C55E', borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  h2hBarFillDraw: { backgroundColor: '#F59E0B' },
  h2hBarFillRight: { backgroundColor: '#EF4444', borderTopRightRadius: 4, borderBottomRightRadius: 4 },

  // Section Card
  sectionCard: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E8EDF2', ...Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6 }, android: { elevation: 1 }, default: {} }) },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  sectionSubtitle: { fontSize: 12, fontWeight: '600', color: theme.textMuted },

  // Radar Legend
  radarLegend: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 8 },
  radarLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  radarDot: { width: 10, height: 10, borderRadius: 5 },
  radarLegendText: { fontSize: 12, fontWeight: '600', color: theme.textPrimary },

  // Badges
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeItem: { alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, minWidth: 60 },
  badgeIcon: { fontSize: 22, marginBottom: 4 },
  badgeName: { fontSize: 9, fontWeight: '600', color: theme.textSecondary, textAlign: 'center', maxWidth: 70 },

  // Info Grid
  infoGrid: { gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel: { fontSize: 12, fontWeight: '600', color: theme.textMuted, width: 50 },
  infoValueA: { flex: 1, fontSize: 13, fontWeight: '600', color: '#3B82F6', textAlign: 'center' },
  infoValueB: { flex: 1, fontSize: 13, fontWeight: '600', color: '#EF4444', textAlign: 'center' },
});
