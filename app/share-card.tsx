/**
 * Share Card Preview Page
 * Full-screen preview with format selection, color themes, download option.
 * Captures the card as PNG and shares via native sheet or saves to gallery.
 * Records card creation in history for the gallery.
 */
import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert } from '@/template';
import { useAppData } from '@/contexts/AppContext';
import { getEloRank } from '@/services/eloService';
import { fetchPlayerGeoRank } from '@/services/geoLeaderboardService';
import { computeStreakFromDates } from '@/services/streakService';
import {
  captureAndShare,
  downloadCardToGallery,
  CARD_DIMENSIONS,
  CARD_COLOR_THEMES,
  type ShareCardFormat,
  type CardColorTheme,
} from '@/services/shareCardService';
import { addCardHistoryEntry } from '@/services/cardHistoryService';
import {
  ShareCardMatch,
  ShareCardBadge,
  ShareCardStats,
  ShareCardChallenge,
  ShareCardTournament,
  ShareCardH2H,
  ShareCardSponsoredEvent,
  ShareCardPalmares,
  ShareCardEventLeaderboard,
  ShareCardLeague,
  ShareCardWeeklyDigest,
  ShareCardMilestone,
  ShareCardClub,
} from '@/components/feature/share-cards';
import { fetchClubLeaderboard } from '@/services/clubLeaderboardService';
import { fetchGeoLeaderboard } from '@/services/geoLeaderboardService';
import { getContinent, getContinentLabel } from '@/constants/geoData';
import { getSponsoredEvent, getEventParticipants, fetchEventLeaderboard, type SponsoredEvent, type EventLeaderboardEntry } from '@/services/sponsoredEventService';
import { fetchAmbassadors, type Ambassador } from '@/services/ambassadorService';
import { config } from '@/constants/config';
import { useBadges } from '@/hooks/useBadges';
import { getBadgeName } from '@/services/badgeService';

interface PlayerInfo {
  eloRating?: number;
  club?: string;
  city?: string;
  country?: string;
}

import { getLeagueTier, getLeagueProgress, fetchPlayerGlobalRank, LEAGUE_TIERS } from '@/services/globalRankingService';
import { fetchEloHistory, type EloHistoryEntry } from '@/services/eloService';
import { getLastWeekSummary, getCurrentWeekStart, getWeekEnd } from '@/services/weeklyLeaderboardService';

type CardType = 'match' | 'badge' | 'stats' | 'club' | 'challenge' | 'tournament' | 'h2h' | 'sponsored-event' | 'palmares' | 'event-leaderboard' | 'league' | 'weekly-digest' | 'milestone';

const PLATFORM_PRESETS: { id: string; format: ShareCardFormat; label: string; icon: string; color: string }[] = [
  { id: 'instagram', format: 'square', label: 'Instagram', icon: 'crop-square', color: '#E4405F' },
  { id: 'tiktok', format: 'story', label: 'TikTok / Stories', icon: 'crop-portrait', color: '#000000' },
  { id: 'facebook', format: 'landscape', label: 'Facebook', icon: 'crop-landscape', color: '#1877F2' },
];

const TYPE_INFO: Record<CardType, { fr: string; en: string; icon: string; iconColor: string }> = {
  match: { fr: 'Resultat de match', en: 'Match Result', icon: 'sports', iconColor: '#F59E0B' },
  badge: { fr: 'Badge debloque', en: 'Badge Unlocked', icon: 'military-tech', iconColor: '#8B5CF6' },
  stats: { fr: 'Mes statistiques', en: 'My Statistics', icon: 'bar-chart', iconColor: '#3B82F6' },
  challenge: { fr: 'Resultat de defi', en: 'Challenge Result', icon: 'track-changes', iconColor: '#EF4444' },
  tournament: { fr: 'Resultat de tournoi', en: 'Tournament Result', icon: 'emoji-events', iconColor: '#F59E0B' },
  h2h: { fr: 'Confrontation directe', en: 'Head to Head', icon: 'compare-arrows', iconColor: '#8B5CF6' },
  'sponsored-event': { fr: 'Defi sponsorise', en: 'Sponsored Event', icon: 'campaign', iconColor: '#7C3AED' },
  palmares: { fr: 'Palmares', en: 'Career', icon: 'emoji-events', iconColor: '#FFD700' },
  'event-leaderboard': { fr: 'Classement defis', en: 'Event Leaderboard', icon: 'leaderboard', iconColor: '#7C3AED' },
  league: { fr: 'Classement Ligue', en: 'League Ranking', icon: 'military-tech', iconColor: '#FFD700' },
  'weekly-digest': { fr: 'Bilan Hebdo', en: 'Weekly Digest', icon: 'date-range', iconColor: '#EC4899' },
  milestone: { fr: 'Jalon ELO', en: 'ELO Milestone', icon: 'emoji-events', iconColor: '#F59E0B' },
  club: { fr: 'Fiche Club', en: 'Club Card', icon: 'home', iconColor: '#D97706' },
};

const ROLE_LABELS: Record<string, string> = {
  Tireur: 'Tireur',
  Pointeur: 'Pointeur',
  Milieu: 'Milieu',
};

export default function ShareCardScreen() {
  const params = useLocalSearchParams<{ type?: string; id?: string; badgeId?: string; opponentId?: string; eventId?: string; clubId?: string }>();
  const { language } = useLanguage();
  const { user } = useAuth();
  const { matches, challenges, tournaments, selfPlayer, userStats, boulesSets, players, clubs } = useAppData();
  const { badges: userBadges } = useBadges();
  const { showAlert } = useAlert();
  const fr = language === 'fr';

  // H2H: Compute opponents the user has played against
  const h2hOpponents = useMemo(() => {
    if (cardType !== 'h2h' || !selfPlayer?.id) return [];
    const opponentMap = new Map<string, { id: string; name: string; matchCount: number }>();
    matches.forEach(m => {
      const inA = m.teamA.players.includes(selfPlayer.id);
      const inB = m.teamB.players.includes(selfPlayer.id);
      if (!inA && !inB) return;
      const oppTeam = inA ? m.teamB : m.teamA;
      oppTeam.players.forEach((pid, idx) => {
        if (pid === selfPlayer.id) return;
        const existing = opponentMap.get(pid);
        const name = oppTeam.playerNames[idx] || pid;
        if (existing) {
          existing.matchCount++;
        } else {
          opponentMap.set(pid, { id: pid, name, matchCount: 1 });
        }
      });
    });
    return Array.from(opponentMap.values()).sort((a, b) => b.matchCount - a.matchCount);
  }, [cardType, matches, selfPlayer?.id]);

  // Auto-select first opponent if none selected
  React.useEffect(() => {
    if (cardType === 'h2h' && !selectedOpponentId && h2hOpponents.length > 0) {
      setSelectedOpponentId(h2hOpponents[0].id);
    }
  }, [cardType, selectedOpponentId, h2hOpponents]);

  // H2H: compute record and stats between self and selected opponent
  const h2hData = useMemo(() => {
    if (cardType !== 'h2h' || !selfPlayer?.id || !selectedOpponentId) return null;
    const pid = selfPlayer.id;
    const oid = selectedOpponentId;

    let winsA = 0, winsB = 0, draws = 0, totalScoreA = 0, totalScoreB = 0;
    let tirsA = 0, tirsSuccessA = 0, pointsA = 0, pointsSuccessA = 0, carreauxA = 0;
    let tirsB = 0, tirsSuccessB = 0, pointsB = 0, pointsSuccessB = 0, carreauxB = 0;
    let matchCountA = 0, winsOverallA = 0, matchCountB = 0, winsOverallB = 0;
    let lastMatchDate: string | undefined;
    let h2hMatchCount = 0;
    const h2hMatchHistory: Array<{ date: string; won: boolean; scoreA: number; scoreB: number }> = [];

    matches.forEach(m => {
      const inTeamA_self = m.teamA.players.includes(pid);
      const inTeamB_self = m.teamB.players.includes(pid);
      const inTeamA_opp = m.teamA.players.includes(oid);
      const inTeamB_opp = m.teamB.players.includes(oid);

      // Count overall stats for both players
      if (inTeamA_self || inTeamB_self) {
        matchCountA++;
        const selfWon = (inTeamA_self && m.winner === 'A') || (inTeamB_self && m.winner === 'B');
        if (selfWon) winsOverallA++;
        if (m.playerActions) {
          const pa = m.playerActions.find(a => a.playerId === pid);
          if (pa) {
            tirsA += pa.actions.tirs; tirsSuccessA += pa.actions.tirsSuccess;
            pointsA += pa.actions.points; pointsSuccessA += pa.actions.pointsSuccess;
            carreauxA += pa.actions.carreaux;
          }
        }
      }
      if (inTeamA_opp || inTeamB_opp) {
        matchCountB++;
        const oppWon = (inTeamA_opp && m.winner === 'A') || (inTeamB_opp && m.winner === 'B');
        if (oppWon) winsOverallB++;
        if (m.playerActions) {
          const pa = m.playerActions.find(a => a.playerId === oid);
          if (pa) {
            tirsB += pa.actions.tirs; tirsSuccessB += pa.actions.tirsSuccess;
            pointsB += pa.actions.points; pointsSuccessB += pa.actions.pointsSuccess;
            carreauxB += pa.actions.carreaux;
          }
        }
      }

      // H2H: check if they are on OPPOSING teams
      const isH2H = (inTeamA_self && inTeamB_opp) || (inTeamB_self && inTeamA_opp);
      if (!isH2H) return;

      h2hMatchCount++;
      if (!lastMatchDate || new Date(m.date) > new Date(lastMatchDate)) lastMatchDate = m.date;

      const selfInA = inTeamA_self;
      totalScoreA += selfInA ? m.teamA.score : m.teamB.score;
      totalScoreB += selfInA ? m.teamB.score : m.teamA.score;

      const selfWon = (selfInA && m.winner === 'A') || (!selfInA && m.winner === 'B');
      const oppWon = (selfInA && m.winner === 'B') || (!selfInA && m.winner === 'A');
      h2hMatchHistory.push({ date: m.date, won: selfWon, scoreA: selfInA ? m.teamA.score : m.teamB.score, scoreB: selfInA ? m.teamB.score : m.teamA.score });
      if (selfWon) winsA++;
      else if (oppWon) winsB++;
      else draws++;
    });

    if (h2hMatchCount === 0) return null;

    const oppPlayer = players.find(p => p.id === oid);
    const oppName = oppPlayer?.name || h2hOpponents.find(o => o.id === oid)?.name || 'Adversaire';
    const oppEloRank = oppPlayer?.eloRating ? getEloRank(oppPlayer.eloRating) : null;

    return {
      playerA: {
        name: selfPlayer.name || playerName,
        eloRating: selfPlayer.eloRating,
        eloColor: eloData?.color,
        eloRankLabel: eloData?.label,
        club: selfPlayer.club,
        city: selfPlayer.city || selfPlayer.location?.city,
        country: selfPlayer.country,
        winRate: matchCountA > 0 ? Math.round((winsOverallA / matchCountA) * 100) : 0,
        tirRate: tirsA > 0 ? Math.round((tirsSuccessA / tirsA) * 100) : 0,
        pointRate: pointsA > 0 ? Math.round((pointsSuccessA / pointsA) * 100) : 0,
        carreauCount: carreauxA,
      },
      playerB: {
        name: oppName,
        eloRating: oppPlayer?.eloRating,
        eloColor: oppEloRank?.color,
        eloRankLabel: oppEloRank ? oppEloRank.label[fr ? 'fr' : 'en'] : undefined,
        club: oppPlayer?.club,
        city: oppPlayer?.city || oppPlayer?.location?.city,
        country: oppPlayer?.country,
        winRate: matchCountB > 0 ? Math.round((winsOverallB / matchCountB) * 100) : 0,
        tirRate: tirsB > 0 ? Math.round((tirsSuccessB / tirsB) * 100) : 0,
        pointRate: pointsB > 0 ? Math.round((pointsSuccessB / pointsB) * 100) : 0,
        carreauCount: carreauxB,
      },
      record: {
        winsA,
        winsB,
        draws,
        totalMatches: h2hMatchCount,
        avgScoreA: h2hMatchCount > 0 ? totalScoreA / h2hMatchCount : 0,
        avgScoreB: h2hMatchCount > 0 ? totalScoreB / h2hMatchCount : 0,
        lastMatchDate,
      },
      recentH2H: h2hMatchHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-10),
    };
  }, [cardType, matches, selfPlayer, selectedOpponentId, players, h2hOpponents, eloData, playerName, fr]);

  // Sponsored event data
  // Gold sponsor for tournament card
  const [goldSponsor, setGoldSponsor] = useState<{ displayName: string; photo?: string } | null>(null);
  React.useEffect(() => {
    fetchAmbassadors().then(({ ambassadors }) => {
      const gold = ambassadors.find(a => a.badgeType === 'gold_sponsor');
      if (gold) setGoldSponsor({ displayName: gold.displayName, photo: gold.photo });
    });
  }, []);

  // Event leaderboard data
  const [eventLeaderboardData, setEventLeaderboardData] = useState<{ entries: EventLeaderboardEntry[]; totalEvents: number; totalParticipants: number } | null>(null);
  React.useEffect(() => {
    if (cardType !== 'event-leaderboard') return;
    fetchEventLeaderboard().then(({ entries: lbEntries, recentEvents }) => {
      const totalP = lbEntries.length;
      setEventLeaderboardData({ entries: lbEntries, totalEvents: recentEvents.length, totalParticipants: totalP });
    }).catch(() => {});
  }, [cardType]);

  const [sponsoredEvent, setSponsoredEvent] = useState<SponsoredEvent | null>(null);
  const [sponsoredEventParticipantCount, setSponsoredEventParticipantCount] = useState(0);
  const [sponsoredEventLoading, setSponsoredEventLoading] = useState(false);

  // League card data
  const [leagueWorldRank, setLeagueWorldRank] = useState<{ rank: number | null; total: number } | null>(null);
  const [leagueEloHistory, setLeagueEloHistory] = useState<EloHistoryEntry[]>([]);
  React.useEffect(() => {
    if (cardType !== 'league' || !selfPlayer?.id) return;
    Promise.all([
      selfPlayer.isPublic ? fetchPlayerGlobalRank(selfPlayer.id) : Promise.resolve({ rank: null, total: 0 }),
      fetchEloHistory(selfPlayer.id, 30),
    ]).then(([rankRes, histRes]) => {
      setLeagueWorldRank({ rank: rankRes.rank, total: rankRes.total });
      setLeagueEloHistory(histRes.history);
    }).catch(() => {});
  }, [cardType, selfPlayer?.id, selfPlayer?.isPublic]);

  // Weekly digest data
  // Milestone card data
  const [milestoneData, setMilestoneData] = useState<{
    label: string; icon: string; color: string;
    elo: number; eloDelta?: number; date: string;
    previousTier?: any; matchContext?: string;
  } | null>(null);
  React.useEffect(() => {
    if (cardType !== 'milestone' || !selfPlayer?.id) return;
    // Build milestone from recent ELO history (most recent tier change or peak)
    const buildMilestone = async () => {
      const { history } = await fetchEloHistory(selfPlayer.id, 50);
      if (history.length === 0) return;
      const reversed = [...history].reverse(); // oldest first
      // Find the most recent tier change
      let lastTierChange: { entry: any; prevTier: any; curTier: any } | null = null;
      let prevElo = reversed[0].eloBefore;
      for (const entry of reversed) {
        const prev = getLeagueTier(prevElo);
        const cur = getLeagueTier(entry.eloAfter);
        if (prev.id !== cur.id && cur.minElo > prev.minElo) {
          lastTierChange = { entry, prevTier: prev, curTier: cur };
        }
        prevElo = entry.eloAfter;
      }
      if (lastTierChange) {
        const tier = lastTierChange.curTier;
        setMilestoneData({
          label: `${fr ? tier.name.fr : tier.name.en} ${fr ? 'atteint' : 'reached'} !`,
          icon: tier.icon, color: tier.color,
          elo: lastTierChange.entry.eloAfter,
          eloDelta: lastTierChange.entry.eloDelta,
          date: lastTierChange.entry.recordedAt,
          previousTier: lastTierChange.prevTier,
          matchContext: lastTierChange.entry.opponentName ? `vs ${lastTierChange.entry.opponentName}` : undefined,
        });
      } else {
        // Fallback: peak ELO
        const peak = Math.max(...reversed.map(e => e.eloAfter));
        const peakEntry = reversed.find(e => e.eloAfter === peak) || reversed[reversed.length - 1];
        setMilestoneData({
          label: `Peak ELO: ${peak}`,
          icon: 'whatshot', color: '#F59E0B',
          elo: peak, eloDelta: peakEntry.eloDelta,
          date: peakEntry.recordedAt,
        });
      }
    };
    buildMilestone();
  }, [cardType, selfPlayer?.id, fr]);

  const [weeklyDigestData, setWeeklyDigestData] = useState<{
    weeklyRank: number | null;
    weeklyRankChange: { direction: 'up' | 'down' | 'same' | 'new'; diff: number } | null;
    weeklyMatches: number;
    weeklyWins: number;
    weeklyWinRate: number;
    weeklyEloDelta: number;
    weeklyTirRate: number;
    weeklyCarreaux: number;
    bestPerformance: string;
    weekLabel: string;
  } | null>(null);
  React.useEffect(() => {
    if (cardType !== 'weekly-digest' || !selfPlayer?.id) return;
    const computeWeeklyDigest = async () => {
      // Compute from current week's matches
      const weekStart = getCurrentWeekStart();
      const weekEnd = getWeekEnd(weekStart);
      const weekMatches = matches.filter(m => {
        const d = new Date(m.date);
        return d >= weekStart && d <= weekEnd && (m.teamA.players.includes(selfPlayer.id) || m.teamB.players.includes(selfPlayer.id));
      });
      const wWins = weekMatches.filter(m => {
        const inA = m.teamA.players.includes(selfPlayer.id);
        return (inA && m.winner === 'A') || (!inA && m.winner === 'B');
      }).length;
      const wWinRate = weekMatches.length > 0 ? Math.round((wWins / weekMatches.length) * 100) : 0;
      // Compute ELO delta for the week
      let wEloDelta = 0;
      let wTirs = 0, wTirsSuccess = 0, wCarreaux = 0;
      weekMatches.forEach(m => {
        if (m.playerActions) {
          const pa = m.playerActions.find(a => a.playerId === selfPlayer.id);
          if (pa) {
            wTirs += pa.actions.tirs || 0;
            wTirsSuccess += pa.actions.tirsSuccess || 0;
            wCarreaux += pa.actions.carreaux || 0;
          }
        }
      });
      // Find ELO delta from eloHistory entries this week
      try {
        const { history: recentHist } = await fetchEloHistory(selfPlayer.id, 50);
        const weekHist = recentHist.filter(h => {
          const d = new Date(h.recordedAt);
          return d >= weekStart && d <= weekEnd;
        });
        wEloDelta = weekHist.reduce((sum, h) => sum + h.eloDelta, 0);
      } catch {}
      // Best performance (highest score margin win)
      let bestPerf = '';
      let bestMargin = 0;
      weekMatches.forEach(m => {
        const inA = m.teamA.players.includes(selfPlayer.id);
        const selfWon = (inA && m.winner === 'A') || (!inA && m.winner === 'B');
        if (selfWon) {
          const selfScore = inA ? m.teamA.score : m.teamB.score;
          const oppScore = inA ? m.teamB.score : m.teamA.score;
          const margin = selfScore - oppScore;
          if (margin > bestMargin) {
            bestMargin = margin;
            const oppNames = (inA ? m.teamB.playerNames : m.teamA.playerNames).filter(Boolean).join(', ');
            bestPerf = `${selfScore}-${oppScore} vs ${oppNames || (fr ? 'Adversaire' : 'Opponent')}`;
          }
        }
      });
      // Week label
      const wLabel = fr
        ? `Semaine du ${weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`
        : `Week of ${weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
      // Try to get last week summary for rank
      const summary = await getLastWeekSummary(user?.id || '').catch(() => null);
      setWeeklyDigestData({
        weeklyRank: summary?.rank || null,
        weeklyRankChange: summary ? { direction: summary.rankChange, diff: summary.rankDiff } : null,
        weeklyMatches: weekMatches.length,
        weeklyWins: wWins,
        weeklyWinRate: wWinRate,
        weeklyEloDelta: wEloDelta,
        weeklyTirRate: wTirs > 0 ? Math.round((wTirsSuccess / wTirs) * 100) : 0,
        weeklyCarreaux: wCarreaux,
        bestPerformance: bestPerf,
        weekLabel: wLabel,
      });
    };
    computeWeeklyDigest();
  }, [cardType, selfPlayer?.id, matches, user?.id, fr]);

  const [activeFormat, setActiveFormat] = useState<ShareCardFormat>('square');
  const [activeTheme, setActiveTheme] = useState<CardColorTheme>('dark');
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const cardRef = useRef<any>(null);

  const cardType = (params.type as CardType) || 'stats';
  const itemId = params.id;
  const badgeId = params.badgeId;
  const opponentIdParam = params.opponentId;
  const eventId = params.eventId || params.id;
  const clubIdParam = params.clubId || (cardType === 'club' ? params.id : undefined);

  // Club card data
  const [clubCardData, setClubCardData] = useState<{
    club: any; topPlayers: any[]; totalMatches: number;
    avgWinRate: number; avgTirRate: number; avgCarreauRate: number;
    geoRank: any;
  } | null>(null);
  React.useEffect(() => {
    if (cardType !== 'club' || !clubIdParam) return;
    const loadClubData = async () => {
      const { getClubById } = require('@/contexts/AppContext');
      // Use clubs from appData
      const club = (clubs as any[])?.find?.((c: any) => c.id === clubIdParam);
      if (!club) return;
      // Fetch club leaderboard for stats
      const { clubs: lbClubs } = await fetchClubLeaderboard();
      const lbClub = lbClubs.find(c => c.id === clubIdParam);
      // Get club players for top 3
      const clubPlayersList = players.filter((p: any) => p.clubId === clubIdParam || (p.club && club.name && p.club === club.name));
      const topClubPlayers = clubPlayersList
        .sort((a: any, b: any) => (b.stats?.winRate || 0) - (a.stats?.winRate || 0))
        .slice(0, 3)
        .map((p: any) => ({ name: p.name, winRate: p.stats?.winRate || 0, eloRating: p.eloRating, role: p.role }));
      // Get upcoming/active tournaments for this club
      const clubTournaments = tournaments.filter((t: any) => t.clubId === clubIdParam && (t.status === 'A venir' || t.status === 'À venir' || t.status === 'En cours'))
        .sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(0, 3)
        .map((t: any) => ({ name: t.name, date: t.date, status: t.status, format: t.format }));
      // Fetch geo rank
      let geoRankData: any = null;
      try {
        const { cities, countries, continents } = await fetchGeoLeaderboard();
        const result: any = {};
        if (club.city) {
          const cityIdx = cities.findIndex((c: any) => c.key.toLowerCase() === club.city.toLowerCase());
          if (cityIdx >= 0) result.city = { name: club.city, rank: cityIdx + 1, total: cities.length };
        }
        if (club.country) {
          const countryIdx = countries.findIndex((c: any) => c.key.toLowerCase() === club.country.toLowerCase());
          if (countryIdx >= 0) result.country = { name: club.country, rank: countryIdx + 1, total: countries.length };
          const continent = getContinent(club.country);
          if (continent) {
            const contIdx = continents.findIndex((c: any) => c.key === continent);
            if (contIdx >= 0) result.continent = { name: getContinentLabel(continent, fr), rank: contIdx + 1, total: continents.length };
          }
        }
        if (Object.keys(result).length > 0) geoRankData = result;
      } catch {}
      setClubCardData({
        club,
        topPlayers: topClubPlayers.length > 0 ? topClubPlayers : (lbClub?.topPlayers || []),
        upcomingTournaments: clubTournaments,
        totalMatches: lbClub?.totalMatches || 0,
        avgWinRate: lbClub?.stats?.avgWinRate || 0,
        avgTirRate: lbClub?.stats?.avgTirRate || 0,
        avgCarreauRate: lbClub?.stats?.avgCarreauRate || 0,
        geoRank: geoRankData,
      });
    };
    loadClubData();
  }, [cardType, clubIdParam, fr]);

  // Load sponsored event data
  React.useEffect(() => {
    if (cardType !== 'sponsored-event' || !eventId) return;
    setSponsoredEventLoading(true);
    Promise.all([
      getSponsoredEvent(eventId),
      getEventParticipants(eventId),
    ]).then(([{ event }, { participants: parts }]) => {
      setSponsoredEvent(event);
      const accepted = (parts || []).filter(p => p.status === 'accepted' || p.status === 'completed').length;
      setSponsoredEventParticipantCount(accepted);
      setSponsoredEventLoading(false);
    }).catch(() => setSponsoredEventLoading(false));
  }, [cardType, eventId]);

  // H2H: opponent selection state
  const [selectedOpponentId, setSelectedOpponentId] = useState<string | null>(opponentIdParam || null);
  const [showOpponentPicker, setShowOpponentPicker] = useState(false);

  // Resolve data
  const match = useMemo(() => {
    if (cardType !== 'match' || !itemId) return null;
    return matches.find(m => m.id === itemId) || null;
  }, [cardType, itemId, matches]);

  const challenge = useMemo(() => {
    if (cardType !== 'challenge' || !itemId) return null;
    return challenges.find(c => c.id === itemId) || null;
  }, [cardType, itemId, challenges]);

  const tournament = useMemo(() => {
    if (cardType !== 'tournament' || !itemId) return null;
    return tournaments.find(t => t.id === itemId) || null;
  }, [cardType, itemId, tournaments]);

  const eloData = useMemo(() => {
    if (!selfPlayer?.eloRating) return null;
    const rank = getEloRank(selfPlayer.eloRating);
    return { rating: selfPlayer.eloRating, color: rank.color, label: rank.label[fr ? 'fr' : 'en'] };
  }, [selfPlayer?.eloRating, fr]);

  const streakData = useMemo(() => {
    const allDates = [...matches.map(m => m.date), ...challenges.map(c => c.date)];
    return computeStreakFromDates(allDates);
  }, [matches, challenges]);

  const [geoRank, setGeoRank] = useState<any>(null);
  React.useEffect(() => {
    if (selfPlayer?.isPublic && selfPlayer?.id) {
      fetchPlayerGeoRank(selfPlayer.id).then(({ geoRank: gr }) => setGeoRank(gr)).catch(() => {});
    }
  }, [selfPlayer?.id, selfPlayer?.isPublic]);

  const playerName = selfPlayer?.name || user?.username || '';
  const clubName = selfPlayer?.club || '';

  // Build playersData map for team members and opponents
  const playersData = useMemo(() => {
    const pd: Record<string, PlayerInfo> = {};
    players.forEach(p => {
      pd[p.id] = {
        eloRating: p.eloRating,
        club: p.club,
        city: p.city || p.location?.city,
        country: p.country,
      };
    });
    return pd;
  }, [players]);

  // Compute most played role from matches
  const mostPlayedRole = useMemo(() => {
    if (!selfPlayer?.id) return '';
    const roleCounts: Record<string, number> = {};
    matches.forEach(m => {
      const allRoles = [...(m.teamA.playerRoles || []), ...(m.teamB.playerRoles || [])];
      allRoles.forEach(r => {
        if (r.playerId === selfPlayer.id) {
          roleCounts[r.role] = (roleCounts[r.role] || 0) + 1;
        }
      });
    });
    if (Object.keys(roleCounts).length === 0) return selfPlayer.role || '';
    return Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0][0];
  }, [matches, selfPlayer?.id, selfPlayer?.role]);

  // Compute podium count from tournaments
  const podiumCount = useMemo(() => {
    return tournaments.filter(t => {
      const r = t.finalResult;
      return r === '1er' || r === '2ème' || r === '3ème';
    }).length;
  }, [tournaments]);

  // Get primary boules set name
  const boulesSetName = useMemo(() => {
    const primary = boulesSets.find(b => b.isPrimary);
    if (primary) return primary.brand ? `${primary.brand} ${primary.name}` : primary.name;
    return boulesSets.length > 0 ? (boulesSets[0].brand ? `${boulesSets[0].brand} ${boulesSets[0].name}` : boulesSets[0].name) : '';
  }, [boulesSets]);

  // Build card title for history
  const getCardTitle = useCallback((): string => {
    switch (cardType) {
      case 'match':
        if (match) return `${match.teamA.score}-${match.teamB.score} (${match.winner === 'A' ? 'V' : 'D'})`;
        return 'Match';
      case 'badge':
        if (badgeId) return getBadgeName(badgeId, language);
        return 'Badge';
      case 'challenge':
        if (challenge) return `${challenge.type} - ${challenge.successRate ? Math.round(challenge.successRate) : 0}%`;
        return 'Defi';
      case 'tournament':
        if (tournament) return tournament.name;
        return 'Tournoi';
      case 'h2h':
        if (h2hData) return `${h2hData.playerA.name} vs ${h2hData.playerB.name}`;
        return 'H2H';
      case 'palmares':
        return `${playerName} - ${tournaments.filter(t => t.finalResult === '1er').length} ${fr ? 'titres' : 'titles'}`;
      case 'event-leaderboard':
        return fr ? 'Classement Defis' : 'Event Leaderboard';
      case 'palmares': {
        // Build season groups from tournaments data
        const finishedTournaments = tournaments.filter(t => t.status === 'Terminé');
        const seasonMap = new Map<number, { year: number; tournaments: Array<{ name: string; date: string; result?: string; format?: string; city?: string }>; titles: number; podiums: number; totalMatches: number; wins: number }>();
        finishedTournaments.forEach(t => {
          const year = new Date(t.date).getFullYear();
          if (!seasonMap.has(year)) seasonMap.set(year, { year, tournaments: [], titles: 0, podiums: 0, totalMatches: 0, wins: 0 });
          const sg = seasonMap.get(year)!;
          sg.tournaments.push({ name: t.name, date: t.date, result: t.finalResult, format: t.format, city: t.location?.city });
          if (t.finalResult === '1er') { sg.titles++; sg.podiums++; }
          else if (t.finalResult === '2ème' || t.finalResult === '3ème') sg.podiums++;
          const tMatches = matches.filter(m => m.tournamentId === t.id);
          sg.totalMatches += tMatches.length;
          sg.wins += tMatches.filter(m => m.winner === 'A').length;
        });
        const sortedSeasons = Array.from(seasonMap.values()).sort((a, b) => b.year - a.year);
        sortedSeasons.forEach(s => s.tournaments.sort((a, b) => {
          const ranks: Record<string, number> = { '1er': 1, '2ème': 2, '3ème': 3 };
          return (ranks[a.result || ''] || 99) - (ranks[b.result || ''] || 99);
        }));
        const totalFinished = finishedTournaments.length;
        const totalTitles = finishedTournaments.filter(t => t.finalResult === '1er').length;
        const totalPodiums = finishedTournaments.filter(t => ['1er', '2ème', '3ème'].includes(t.finalResult || '')).length;
        const palmaresMatches = matches.filter(m => finishedTournaments.some(t => t.id === m.tournamentId));
        const palmaresWins = palmaresMatches.filter(m => m.winner === 'A').length;
        const palmaresWinRate = palmaresMatches.length > 0 ? Math.round((palmaresWins / palmaresMatches.length) * 100) : 0;
        let totalCarreaux = 0;
        palmaresMatches.forEach(m => {
          if (m.playerActions) m.playerActions.filter(pa => pa.team === 'A').forEach(pa => { totalCarreaux += pa.actions.carreaux; });
        });
        if (totalFinished === 0) return <EmptyCard message={fr ? 'Aucun tournoi termine' : 'No finished tournaments'} />;
        return (
          <ShareCardPalmares
            playerName={playerName}
            eloRating={eloData?.rating}
            eloColor={eloData?.color}
            eloRankLabel={eloData?.label}
            clubName={clubName}
            geoRank={geoRank ? { city: geoRank.city?.rank ? { name: geoRank.city.name, rank: geoRank.city.rank } : undefined, country: geoRank.country?.rank ? { name: geoRank.country.name, rank: geoRank.country.rank } : undefined } : null}
            seasons={sortedSeasons}
            totalTournaments={totalFinished}
            totalTitles={totalTitles}
            totalPodiums={totalPodiums}
            totalMatches={palmaresMatches.length}
            totalWins={palmaresWins}
            avgWinRate={palmaresWinRate}
            totalCarreaux={totalCarreaux}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      }
      case 'event-leaderboard': {
        if (!eventLeaderboardData || eventLeaderboardData.entries.length === 0) return <EmptyCard message={fr ? 'Aucun classement disponible' : 'No leaderboard data'} />;
        const myRank = user?.id ? eventLeaderboardData.entries.findIndex(e => e.userId === user.id) + 1 : undefined;
        const lbEntries = eventLeaderboardData.entries.map(e => ({
          userName: e.userName,
          wins: e.wins,
          podiums: e.podiums,
          avgScore: e.avgScore,
          eventsCompleted: e.eventsCompleted,
          isCurrentUser: user?.id === e.userId,
        }));
        return (
          <ShareCardEventLeaderboard
            entries={lbEntries}
            totalEvents={eventLeaderboardData.totalEvents}
            totalParticipants={eventLeaderboardData.totalParticipants}
            playerName={playerName}
            playerRank={myRank && myRank > 0 ? myRank : undefined}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      }
      case 'sponsored-event':
        if (sponsoredEvent) return sponsoredEvent.title;
        return 'Event';
      case 'league': {
        const tierName = fr ? getLeagueTier(selfPlayer?.eloRating || 1000).name.fr : getLeagueTier(selfPlayer?.eloRating || 1000).name.en;
        return `${tierName} - ${selfPlayer?.eloRating || 1000} ELO`;
      }
      case 'weekly-digest':
        return weeklyDigestData ? weeklyDigestData.weekLabel : (fr ? 'Bilan Hebdo' : 'Weekly Digest');
      case 'milestone': {
        if (milestoneData) return milestoneData.label;
        return fr ? 'Jalon ELO' : 'ELO Milestone';
      }
      case 'club': {
        const cd = clubCardData;
        if (cd?.club) return cd.club.name;
        return 'Club';
      }
      case 'stats':
      default:
        return playerName || 'Stats';
    }
  }, [cardType, match, badgeId, challenge, tournament, playerName, language, h2hData, selfPlayer?.eloRating, weeklyDigestData]);

  const recordHistory = useCallback(async (action: 'shared' | 'downloaded') => {
    const info = TYPE_INFO[cardType];
    await addCardHistoryEntry({
      type: cardType,
      theme: activeTheme,
      format: activeFormat,
      title: getCardTitle(),
      subtitle: fr ? info.fr : info.en,
      iconName: info.icon,
      iconColor: info.iconColor,
      action,
    });
  }, [cardType, activeTheme, activeFormat, getCardTitle, fr]);

  const handleShare = useCallback(async () => {
    if (!cardRef.current) return;
    setSharing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const title = `ultimate-petanque-${cardType}-${Date.now()}`;
      const success = await captureAndShare(cardRef.current, title);
      if (success) {
        await recordHistory('shared');
      } else {
        showAlert(
          fr ? 'Capture indisponible' : 'Capture unavailable',
          fr ? "La capture d'image n'est pas disponible dans cet environnement. Essayez depuis l'APK ou un appareil physique." : 'Image capture is not available in this environment. Try from the APK or a physical device.'
        );
      }
    } catch (e) {
      console.log('[ShareCard] Error:', e);
    } finally {
      setSharing(false);
    }
  }, [cardType, recordHistory, fr, showAlert]);

  const handleDownload = useCallback(async () => {
    if (!cardRef.current) return;
    setDownloading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const title = `ultimate-petanque-${cardType}-${Date.now()}`;
      const success = await downloadCardToGallery(cardRef.current, title);
      if (success) {
        await recordHistory('downloaded');
        setDownloadSuccess(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setTimeout(() => setDownloadSuccess(false), 2500);
      } else {
        showAlert(
          fr ? 'Capture indisponible' : 'Capture unavailable',
          fr ? "La capture d'image n'est pas disponible dans cet environnement. Essayez depuis l'APK ou un appareil physique." : 'Image capture is not available in this environment. Try from the APK or a physical device.'
        );
      }
    } catch (e) {
      console.log('[ShareCard] Download error:', e);
    } finally {
      setDownloading(false);
    }
  }, [cardType, recordHistory, fr, showAlert]);

  const formatConfig = CARD_DIMENSIONS[activeFormat];

  // Scale card to fit screen
  const screenW = Dimensions.get('window').width - 48;
  const aspectRatio = formatConfig.width / formatConfig.height;
  const cardWidth = Math.min(screenW, 400);
  const cardHeight = cardWidth / aspectRatio;

  const renderCard = () => {
    const geoRankData = geoRank ? {
      city: geoRank.city?.rank ? { name: geoRank.city.name, rank: geoRank.city.rank } : undefined,
      country: geoRank.country?.rank ? { name: geoRank.country.name, rank: geoRank.country.rank } : undefined,
    } : null;

    switch (cardType) {
      case 'match':
        if (!match) return <EmptyCard message={fr ? 'Match introuvable' : 'Match not found'} />;
        return (
          <ShareCardMatch
            match={match}
            playerName={playerName}
            eloRating={eloData?.rating}
            eloColor={eloData?.color}
            eloRankLabel={eloData?.label}
            terrainName={selfPlayer?.terrainName || ''}
            clubName={clubName}
            geoRank={geoRankData}
            playersData={playersData}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      case 'badge':
        if (!badgeId) return <EmptyCard message={fr ? 'Badge introuvable' : 'Badge not found'} />;
        const ub = userBadges.find(b => b.badgeId === badgeId);
        return (
          <ShareCardBadge
            badgeId={badgeId}
            playerName={playerName}
            unlockedAt={ub?.unlockedAt}
            eloRating={eloData?.rating}
            eloColor={eloData?.color}
            eloRankLabel={eloData?.label}
            clubName={clubName}
            geoRank={geoRankData}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      case 'challenge':
        if (!challenge) return <EmptyCard message={fr ? 'Defi introuvable' : 'Challenge not found'} />;
        return (
          <ShareCardChallenge
            challenge={challenge}
            playerName={playerName}
            eloRating={eloData?.rating}
            eloColor={eloData?.color}
            eloRankLabel={eloData?.label}
            clubName={clubName}
            geoRank={geoRankData}
            playersData={playersData}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      case 'tournament':
        if (!tournament) return <EmptyCard message={fr ? 'Tournoi introuvable' : 'Tournament not found'} />;
        const tournamentMatches = matches.filter(m => m.tournamentId === tournament.id).map(m => ({
          id: m.id,
          teamANames: m.teamA.playerNames,
          teamBNames: m.teamB.playerNames,
          scoreA: m.teamA.score,
          scoreB: m.teamB.score,
          winner: m.winner,
          tournamentPhase: m.tournamentPhase,
        }));
        return (
          <ShareCardTournament
            tournament={tournament}
            playerName={playerName}
            eloRating={eloData?.rating}
            eloColor={eloData?.color}
            eloRankLabel={eloData?.label}
            clubName={clubName}
            geoRank={geoRankData}
            tournamentMatches={tournamentMatches}
            goldSponsor={goldSponsor}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      case 'h2h':
        if (!h2hData) return <EmptyCard message={fr ? 'Selectionnez un adversaire' : 'Select an opponent'} />;
        return (
          <ShareCardH2H
            playerA={h2hData.playerA}
            playerB={h2hData.playerB}
            record={h2hData.record}
            recentH2H={h2hData.recentH2H}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      case 'palmares': {
        // Build season groups from tournaments data
        const finishedTournaments = tournaments.filter(t => t.status === 'Terminé');
        const seasonMap = new Map<number, { year: number; tournaments: Array<{ name: string; date: string; result?: string; format?: string; city?: string }>; titles: number; podiums: number; totalMatches: number; wins: number }>();
        finishedTournaments.forEach(t => {
          const year = new Date(t.date).getFullYear();
          if (!seasonMap.has(year)) seasonMap.set(year, { year, tournaments: [], titles: 0, podiums: 0, totalMatches: 0, wins: 0 });
          const sg = seasonMap.get(year)!;
          sg.tournaments.push({ name: t.name, date: t.date, result: t.finalResult, format: t.format, city: t.location?.city });
          if (t.finalResult === '1er') { sg.titles++; sg.podiums++; }
          else if (t.finalResult === '2ème' || t.finalResult === '3ème') sg.podiums++;
          const tMatches = matches.filter(m => m.tournamentId === t.id);
          sg.totalMatches += tMatches.length;
          sg.wins += tMatches.filter(m => m.winner === 'A').length;
        });
        const sortedSeasons = Array.from(seasonMap.values()).sort((a, b) => b.year - a.year);
        sortedSeasons.forEach(s => s.tournaments.sort((a, b) => {
          const ranks: Record<string, number> = { '1er': 1, '2ème': 2, '3ème': 3 };
          return (ranks[a.result || ''] || 99) - (ranks[b.result || ''] || 99);
        }));
        const totalFinished = finishedTournaments.length;
        const totalTitles = finishedTournaments.filter(t => t.finalResult === '1er').length;
        const totalPodiums = finishedTournaments.filter(t => ['1er', '2ème', '3ème'].includes(t.finalResult || '')).length;
        const palmaresMatches = matches.filter(m => finishedTournaments.some(t => t.id === m.tournamentId));
        const palmaresWins = palmaresMatches.filter(m => m.winner === 'A').length;
        const palmaresWinRate = palmaresMatches.length > 0 ? Math.round((palmaresWins / palmaresMatches.length) * 100) : 0;
        let totalCarreaux = 0;
        palmaresMatches.forEach(m => {
          if (m.playerActions) m.playerActions.filter(pa => pa.team === 'A').forEach(pa => { totalCarreaux += pa.actions.carreaux; });
        });
        if (totalFinished === 0) return <EmptyCard message={fr ? 'Aucun tournoi termine' : 'No finished tournaments'} />;
        return (
          <ShareCardPalmares
            playerName={playerName}
            eloRating={eloData?.rating}
            eloColor={eloData?.color}
            eloRankLabel={eloData?.label}
            clubName={clubName}
            geoRank={geoRank ? { city: geoRank.city?.rank ? { name: geoRank.city.name, rank: geoRank.city.rank } : undefined, country: geoRank.country?.rank ? { name: geoRank.country.name, rank: geoRank.country.rank } : undefined } : null}
            seasons={sortedSeasons}
            totalTournaments={totalFinished}
            totalTitles={totalTitles}
            totalPodiums={totalPodiums}
            totalMatches={palmaresMatches.length}
            totalWins={palmaresWins}
            avgWinRate={palmaresWinRate}
            totalCarreaux={totalCarreaux}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      }
      case 'event-leaderboard': {
        if (!eventLeaderboardData || eventLeaderboardData.entries.length === 0) return <EmptyCard message={fr ? 'Aucun classement disponible' : 'No leaderboard data'} />;
        const myRank = user?.id ? eventLeaderboardData.entries.findIndex(e => e.userId === user.id) + 1 : undefined;
        const lbEntries = eventLeaderboardData.entries.map(e => ({
          userName: e.userName,
          wins: e.wins,
          podiums: e.podiums,
          avgScore: e.avgScore,
          eventsCompleted: e.eventsCompleted,
          isCurrentUser: user?.id === e.userId,
        }));
        return (
          <ShareCardEventLeaderboard
            entries={lbEntries}
            totalEvents={eventLeaderboardData.totalEvents}
            totalParticipants={eventLeaderboardData.totalParticipants}
            playerName={playerName}
            playerRank={myRank && myRank > 0 ? myRank : undefined}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      }
      case 'sponsored-event':
        if (sponsoredEventLoading) return <EmptyCard message={fr ? 'Chargement...' : 'Loading...'} />;
        if (!sponsoredEvent) return <EmptyCard message={fr ? 'Evenement introuvable' : 'Event not found'} />;
        return (
          <ShareCardSponsoredEvent
            title={sponsoredEvent.title}
            challengeType={sponsoredEvent.challengeType}
            challengeMode={sponsoredEvent.challengeMode}
            eventDate={sponsoredEvent.eventDate}
            startTime={sponsoredEvent.startTime}
            endTime={sponsoredEvent.endTime}
            city={sponsoredEvent.city}
            country={sponsoredEvent.country}
            terrainName={sponsoredEvent.terrainName}
            scope={sponsoredEvent.scope}
            shareCode={sponsoredEvent.shareCode}
            ambassadorName={sponsoredEvent.ambassadorName}
            maxParticipants={sponsoredEvent.maxParticipants}
            acceptedCount={sponsoredEventParticipantCount}
            minWitnesses={sponsoredEvent.minWitnesses}
            status={sponsoredEvent.status}
            description={sponsoredEvent.description}
            qrUrl={`${config.appDownloadUrl}?event=${sponsoredEvent.shareCode}`}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      case 'league': {
        const leagueElo = selfPlayer?.eloRating || 1000;
        const leagueProg = getLeagueProgress(leagueElo);
        const leagueTier = leagueProg.tier;
        const eloHistPoints = [...leagueEloHistory].reverse().map(h => ({ elo: h.eloAfter, won: h.won }));
        const geoRankData2 = geoRank ? {
          city: geoRank.city?.rank ? { name: geoRank.city.name, rank: geoRank.city.rank } : undefined,
          country: geoRank.country?.rank ? { name: geoRank.country.name, rank: geoRank.country.rank } : undefined,
        } : null;
        return (
          <ShareCardLeague
            playerName={playerName}
            elo={leagueElo}
            leagueTier={leagueTier}
            worldRank={leagueWorldRank?.rank}
            worldTotal={leagueWorldRank?.total}
            progress={leagueProg.progress}
            eloToNext={leagueProg.eloToNext}
            nextTierEmblem={leagueProg.nextTier?.emblem}
            eloHistory={eloHistPoints}
            matchesPlayed={userStats.totalMatches || matches.length}
            wins={userStats.wins || 0}
            winRate={userStats.winRate || 0}
            clubName={clubName}
            geoRank={geoRankData2}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      }
      case 'weekly-digest': {
        if (!weeklyDigestData) return <EmptyCard message={fr ? 'Chargement...' : 'Loading...'} />;
        if (weeklyDigestData.weeklyMatches === 0) return <EmptyCard message={fr ? 'Aucun match cette semaine' : 'No matches this week'} />;
        const wdLeagueTier = getLeagueTier(selfPlayer?.eloRating || 1000);
        const wdGeoRank = geoRank ? {
          city: geoRank.city?.rank ? { name: geoRank.city.name, rank: geoRank.city.rank } : undefined,
          country: geoRank.country?.rank ? { name: geoRank.country.name, rank: geoRank.country.rank } : undefined,
        } : null;
        return (
          <ShareCardWeeklyDigest
            playerName={playerName}
            weekLabel={weeklyDigestData.weekLabel}
            weeklyRank={weeklyDigestData.weeklyRank}
            weeklyRankChange={weeklyDigestData.weeklyRankChange || undefined}
            matchesPlayed={weeklyDigestData.weeklyMatches}
            wins={weeklyDigestData.weeklyWins}
            winRate={weeklyDigestData.weeklyWinRate}
            eloDelta={weeklyDigestData.weeklyEloDelta}
            currentElo={selfPlayer?.eloRating || 1000}
            leagueTier={wdLeagueTier}
            tirRate={weeklyDigestData.weeklyTirRate}
            carreauCount={weeklyDigestData.weeklyCarreaux}
            bestPerformance={weeklyDigestData.bestPerformance || undefined}
            clubName={clubName}
            geoRank={wdGeoRank}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      }
      case 'milestone': {
        if (!milestoneData) return <EmptyCard message={fr ? 'Aucun jalon ELO' : 'No ELO milestone'} />;
        const msTier = getLeagueTier(milestoneData.elo);
        return (
          <ShareCardMilestone
            playerName={playerName}
            milestoneLabel={milestoneData.label}
            milestoneIcon={milestoneData.icon}
            milestoneColor={milestoneData.color}
            elo={milestoneData.elo}
            eloDelta={milestoneData.eloDelta}
            date={milestoneData.date}
            leagueTier={msTier}
            previousTier={milestoneData.previousTier || null}
            matchContext={milestoneData.matchContext}
            clubName={clubName}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      }
      case 'club': {
        if (!clubCardData?.club) return <EmptyCard message={fr ? 'Club introuvable' : 'Club not found'} />;
        const cd = clubCardData;
        return (
          <ShareCardClub
            clubName={cd.club.name}
            city={cd.club.city}
            country={cd.club.country}
            logo={cd.club.logo}
            membersCount={cd.club.membersCount}
            foundedYear={cd.club.foundedYear}
            membershipCost={cd.club.membershipCost}
            facilities={cd.club.facilities}
            description={cd.club.description}
            geoRank={cd.geoRank}
            topPlayers={cd.topPlayers.map((p: any) => ({ name: p.name, winRate: p.winRate, eloRating: p.eloRating, role: p.role }))}
            upcomingTournaments={(cd as any).upcomingTournaments}
            totalMatches={cd.totalMatches}
            avgWinRate={cd.avgWinRate}
            avgTirRate={cd.avgTirRate}
            avgCarreauRate={cd.avgCarreauRate}
            isVerified={cd.club.isVerified}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
      }
      case 'stats':
      default:
        return (
          <ShareCardStats
            playerName={playerName}
            eloRating={eloData?.rating}
            eloColor={eloData?.color}
            eloRankLabel={eloData?.label}
            matchesPlayed={userStats.totalMatches || matches.length}
            winRate={userStats.winRate || 0}
            tirRate={userStats.tirSuccessRate || 0}
            pointRate={userStats.pointSuccessRate || 0}
            carreauRate={userStats.carreauRate || 0}
            currentStreak={streakData.currentStreak}
            bestStreak={streakData.bestStreak}
            geoRank={geoRankData}
            clubName={clubName}
            podiumCount={podiumCount}
            handedness={selfPlayer?.handedness}
            experience={selfPlayer?.experience}
            mostPlayedRole={mostPlayedRole}
            boulesSetName={boulesSetName}
            language={language}
            colorTheme={activeTheme}
            format={activeFormat}
          />
        );
    }
  };

  const typeInfo = TYPE_INFO[cardType] || TYPE_INFO.stats;

  return (
    <SafeAreaView edges={['top']} style={st.container}>
      {/* Header */}
      <View style={st.header}>
        <Pressable style={st.headerBtn} onPress={() => router.back()} hitSlop={12}>
          <MaterialIcons name="close" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={st.headerCenter}>
          <MaterialIcons name={typeInfo.icon as any} size={16} color={theme.primary} />
          <Text style={st.headerTitle}>{fr ? 'Apercu de la carte' : 'Card Preview'}</Text>
        </View>
        <Pressable style={st.headerBtn} onPress={() => { Haptics.selectionAsync(); router.push('/card-gallery' as any); }} hitSlop={12}>
          <MaterialIcons name="photo-library" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Type label */}
        <Animated.View entering={FadeInDown.duration(300)}>
          <Text style={st.typeLabel}>{fr ? typeInfo.fr : typeInfo.en}</Text>
        </Animated.View>

        {/* H2H: Opponent Picker */}
        {cardType === 'h2h' ? (
          <Animated.View entering={FadeInDown.duration(300).delay(15)} style={st.h2hPickerContainer}>
            <Text style={st.h2hPickerLabel}>{fr ? 'ADVERSAIRE' : 'OPPONENT'}</Text>
            {h2hOpponents.length === 0 ? (
              <View style={st.h2hEmptyState}>
                <MaterialIcons name="people-outline" size={24} color={theme.textMuted} />
                <Text style={st.h2hEmptyText}>{fr ? 'Aucun adversaire trouve. Jouez des matchs pour debloquer cette carte.' : 'No opponents found. Play matches to unlock this card.'}</Text>
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.h2hOpponentScroll}>
                {h2hOpponents.slice(0, 10).map(opp => {
                  const isActive = selectedOpponentId === opp.id;
                  const oppP = players.find(p => p.id === opp.id);
                  const oppElo = oppP?.eloRating ? getEloRank(oppP.eloRating) : null;
                  return (
                    <Pressable
                      key={opp.id}
                      style={[st.h2hOpponentChip, isActive && { backgroundColor: '#8B5CF6' + '18', borderColor: '#8B5CF6' + '50' }]}
                      onPress={() => { Haptics.selectionAsync(); setSelectedOpponentId(opp.id); }}
                    >
                      <Text style={[st.h2hOpponentName, isActive && { color: '#8B5CF6' }]} numberOfLines={1}>{opp.name}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Text style={st.h2hOpponentCount}>{opp.matchCount}m</Text>
                        {oppElo ? <Text style={{ fontSize: 8, fontWeight: '700', color: oppElo.color }}>{oppP?.eloRating}</Text> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </Animated.View>
        ) : null}

        {/* Platform presets */}
        <Animated.View entering={FadeInDown.duration(300).delay(30)} style={st.platformRow}>
          {PLATFORM_PRESETS.map(preset => {
            const isActive = activeFormat === preset.format;
            return (
              <Pressable
                key={preset.id}
                style={[st.platformChip, isActive && { backgroundColor: preset.color + '18', borderColor: preset.color + '40' }]}
                onPress={() => { Haptics.selectionAsync(); setActiveFormat(preset.format); }}
              >
                <MaterialIcons name={preset.icon as any} size={14} color={isActive ? preset.color : theme.textMuted} />
                <Text style={[st.platformText, isActive && { color: preset.color, fontWeight: '700' }]}>{preset.label}</Text>
              </Pressable>
            );
          })}
        </Animated.View>

        {/* Format selector */}
        <Animated.View entering={FadeInDown.duration(300).delay(50)} style={st.formatRow}>
          {(Object.keys(CARD_DIMENSIONS) as ShareCardFormat[]).map(fmt => {
            const dim = CARD_DIMENSIONS[fmt];
            const isActive = activeFormat === fmt;
            return (
              <Pressable
                key={fmt}
                style={[st.formatChip, isActive && st.formatChipActive]}
                onPress={() => { Haptics.selectionAsync(); setActiveFormat(fmt); }}
              >
                <MaterialIcons name={dim.icon as any} size={16} color={isActive ? '#FFF' : theme.textSecondary} />
                <Text style={[st.formatChipText, isActive && st.formatChipTextActive]}>
                  {fr ? dim.labelFr : dim.label}
                </Text>
                <Text style={[st.formatChipSize, isActive && { color: 'rgba(255,255,255,0.6)' }]}>
                  {dim.width}x{dim.height}
                </Text>
              </Pressable>
            );
          })}
        </Animated.View>

        {/* Color theme selector */}
        <Animated.View entering={FadeInDown.duration(300).delay(70)} style={st.themeRow}>
          <Text style={st.themeSectionLabel}>{fr ? 'THEME' : 'THEME'}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.themeScroll}>
            {(Object.keys(CARD_COLOR_THEMES) as CardColorTheme[]).map(themeKey => {
              const t = CARD_COLOR_THEMES[themeKey];
              const isActive = activeTheme === themeKey;
              return (
                <Pressable
                  key={themeKey}
                  style={[st.themeChip, isActive && { borderColor: t.accent, borderWidth: 2.5 }]}
                  onPress={() => { Haptics.selectionAsync(); setActiveTheme(themeKey); }}
                >
                  <View style={[st.themePreview, { backgroundColor: t.gradients[0] }]}>
                    <View style={[st.themePreviewAccent, { backgroundColor: t.accent }]} />
                  </View>
                  <Text style={[st.themeChipText, isActive && { color: t.accent, fontWeight: '700' }]}>
                    {fr ? t.labelFr : t.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        {/* Card preview */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)} style={st.cardPreviewContainer}>
          <View
            ref={cardRef}
            collapsable={false}
            style={[st.cardWrapper, { width: cardWidth, height: Math.max(200, cardHeight) }]}
          >
            {renderCard()}
          </View>
        </Animated.View>

        {/* Download success */}
        {downloadSuccess ? (
          <Animated.View entering={FadeInDown.duration(200)} style={st.downloadSuccessBanner}>
            <MaterialIcons name="check-circle" size={18} color="#22C55E" />
            <Text style={st.downloadSuccessText}>{fr ? 'Image enregistree dans la galerie' : 'Image saved to gallery'}</Text>
          </Animated.View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Bottom action bar */}
      <View style={st.bottomBar}>
        <View style={st.bottomActions}>
          <Pressable
            style={[st.downloadBtn, downloading && st.btnDisabled]}
            onPress={handleDownload}
            disabled={downloading || sharing}
          >
            {downloading ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <>
                <MaterialIcons name="save-alt" size={20} color={theme.primary} />
                <Text style={st.downloadBtnText}>{fr ? 'Telecharger' : 'Download'}</Text>
              </>
            )}
          </Pressable>

          <Pressable
            style={[st.shareBtn, sharing && st.btnDisabled]}
            onPress={handleShare}
            disabled={sharing || downloading}
          >
            {sharing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <MaterialIcons name="share" size={20} color="#FFF" />
                <Text style={st.shareBtnText}>{fr ? 'Partager' : 'Share'}</Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

function EmptyCard({ message }: { message: string }) {
  return (
    <View style={{ padding: 40, alignItems: 'center', backgroundColor: '#1E293B', borderRadius: 20 }}>
      <MaterialIcons name="error-outline" size={40} color="#64748B" />
      <Text style={{ fontSize: 14, color: '#64748B', marginTop: 10 }}>{message}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 20 },
  typeLabel: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, letterSpacing: 0.5, marginBottom: 12, textAlign: 'center' },
  platformRow: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 12 },
  platformChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  platformText: { fontSize: 11, fontWeight: '600', color: theme.textMuted },
  formatRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 14 },
  formatChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1.5, borderColor: theme.border },
  formatChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  formatChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  formatChipTextActive: { color: '#FFF' },
  formatChipSize: { fontSize: 9, fontWeight: '500', color: theme.textMuted },
  themeRow: { marginBottom: 16 },
  themeSectionLabel: { fontSize: 10, fontWeight: '700', color: theme.textMuted, letterSpacing: 1, marginBottom: 8, textAlign: 'center' },
  themeScroll: { gap: 8, paddingHorizontal: 4 },
  themeChip: { alignItems: 'center', gap: 5, width: 62, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 4, borderWidth: 1.5, borderColor: theme.border, backgroundColor: theme.surface },
  themePreview: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  themePreviewAccent: { width: '100%', height: 6, borderRadius: 3 },
  themeChipText: { fontSize: 9, fontWeight: '600', color: theme.textSecondary, textAlign: 'center' },
  cardPreviewContainer: { alignItems: 'center', marginBottom: 16 },
  cardWrapper: { borderRadius: 20, overflow: 'hidden', ...theme.shadows.cardElevated, backgroundColor: '#0F172A' },
  downloadSuccessBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#22C55E15', paddingVertical: 10, borderRadius: 12, marginBottom: 8 },
  downloadSuccessText: { fontSize: 13, fontWeight: '600', color: '#22C55E' },
  bottomBar: { paddingHorizontal: 24, paddingVertical: 14, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  bottomActions: { flexDirection: 'row', gap: 10 },
  downloadBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15, borderRadius: 16, backgroundColor: theme.primary + '12', borderWidth: 1.5, borderColor: theme.primary + '30' },
  downloadBtnText: { fontSize: 15, fontWeight: '700', color: theme.primary },
  shareBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary, paddingVertical: 15, borderRadius: 16 },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  btnDisabled: { opacity: 0.6 },
  // H2H opponent picker
  h2hPickerContainer: { marginBottom: 14, backgroundColor: theme.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: theme.border },
  h2hPickerLabel: { fontSize: 9, fontWeight: '700', color: theme.textMuted, letterSpacing: 1, marginBottom: 8 },
  h2hEmptyState: { alignItems: 'center' as const, paddingVertical: 16, gap: 8 },
  h2hEmptyText: { fontSize: 12, color: theme.textMuted, textAlign: 'center' as const, lineHeight: 18 },
  h2hOpponentScroll: { gap: 6, paddingRight: 4 },
  h2hOpponentChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: theme.backgroundSecondary, borderWidth: 1.5, borderColor: theme.border, minWidth: 80, alignItems: 'center' as const },
  h2hOpponentName: { fontSize: 12, fontWeight: '700', color: theme.textPrimary, marginBottom: 2 },
  h2hOpponentCount: { fontSize: 9, fontWeight: '600', color: theme.textMuted },
});
