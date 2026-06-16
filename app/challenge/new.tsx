import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  Dimensions,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { 
  FadeInDown, 
  FadeIn, 
  ZoomIn, 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming, 
  withSequence, 
  Easing 
} from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { SimplifiedShotNotation, SimpleShotRecord } from '@/components';
import ShareModal from '@/components/ui/ShareModal';
import ShareRequestModal from '@/components/ui/ShareRequestModal';
import { showInterstitial } from '@/services/adService';
import { Ambassador } from '@/services/ambassadorService';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
import { getSponsoredEvents, getMyParticipationStatus, submitEventResult, SponsoredEvent } from '@/services/sponsoredEventService';
import { Image } from 'expo-image';
import { ActivityIndicator } from 'react-native';
import {
  ChallengeType, 
  ChallengeShot,
  ChallengeMode,
  ChallengePlayerResult,
  PrecisionAtelier,
  PrecisionDistance,
  PrecisionShot,
  PrecisionAtelierConfig,
  PrecisionScoringOption,
  Player,
} from '@/types/petanque';
import { PRECISION_ATELIERS, PRECISION_DISTANCES } from '@/constants/challengeConfig';

const getScreenWidth = () => Math.max(1, Dimensions.get('window').width);
const INITIAL_WIDTH = getScreenWidth();

// ============================================
// UTILITY FUNCTIONS
// ============================================

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

// ============================================
// COUNTDOWN TIMER COMPONENT
// ============================================

interface CountdownTimerProps {
  seconds: number;
  isRunning: boolean;
  onStart: () => void;
  onTimeUp: () => void;
  startLabel: string;
}

function CountdownTimer({ seconds, isRunning, onStart, onTimeUp, startLabel }: CountdownTimerProps) {
  const [timeLeft, setTimeLeft] = useState(seconds);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTimeUpRef = useRef(onTimeUp);
  const progress = useSharedValue(1);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    onTimeUpRef.current = onTimeUp;
  }, [onTimeUp]);

  useEffect(() => {
    if (!isRunning) {
      setTimeLeft(seconds);
      progress.value = 1;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    setTimeLeft(seconds);
    progress.value = withTiming(0, { duration: seconds * 1000, easing: Easing.linear });
    
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          timerRef.current = null;
          onTimeUpRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, seconds, progress]);

  useEffect(() => {
    if (timeLeft <= 5 && timeLeft > 0 && isRunning) {
      pulseScale.value = withSequence(
        withTiming(1.1, { duration: 100 }),
        withTiming(1, { duration: 100 })
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [timeLeft, isRunning, pulseScale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  const color = timeLeft <= 5 ? theme.error : timeLeft <= 10 ? theme.warning : theme.success;

  return (
    <View style={styles.countdownContainer}>
      <View style={[styles.countdownOuter, { borderColor: color + '20' }]}>
        <Animated.View style={[styles.countdownCircle, animatedStyle, { borderColor: color }]}>
          <Text style={[styles.countdownText, { color }]}>{timeLeft}</Text>
          <Text style={styles.countdownLabel}>sec</Text>
        </Animated.View>
      </View>
      <View style={styles.countdownBar}>
        <Animated.View style={[styles.countdownBarFill, progressStyle, { backgroundColor: color }]} />
      </View>
      {!isRunning && (
        <Pressable style={styles.startTimerButton} onPress={onStart}>
          <MaterialIcons name="play-arrow" size={28} color="#FFF" />
          <Text style={styles.startTimerButtonText}>{startLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function NewChallengeScreen() {
  const insets = useSafeAreaInsets();
  const { userStats, selfPlayer, players, matches, challenges: pastChallenges, boulesSets, terrains } = useAppData();
  const { addChallenge } = useAppActions();
  const { t, language } = useLanguage();

  // Responsive dimensions
  const [screenWidth, setScreenWidth] = useState(INITIAL_WIDTH);
  useEffect(() => {
    const update = () => setScreenWidth(getScreenWidth());
    update();
    const sub = Dimensions.addEventListener('change', update);
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  // ============================================
  // CONFIGURATION (translated)
  // ============================================
  const CHALLENGE_CONFIG = useMemo(() => ({
    '10_tirs': {
      name: t('challenge', 'tenShots'),
      description: t('challenge', 'tenShotsDesc'),
      icon: 'gps-fixed' as const,
      totalShots: 10,
      color: theme.tirColor,
    },
    '10_tirs_sautee': {
      name: t('challenge', 'tenShotsLob'),
      description: t('challenge', 'tenShotsLobDesc'),
      icon: 'sports' as const,
      totalShots: 10,
      color: theme.primary,
    },
    'precision': {
      name: t('challenge', 'precision'),
      description: t('challenge', 'precisionDesc'),
      icon: 'stars' as const,
      totalShots: 20,
      color: theme.carreauColor,
    },
  } as const), [t]);

  // Translated precision ateliers
  const TRANSLATED_ATELIERS = useMemo(() => {
    return PRECISION_ATELIERS.map(atelier => ({
      ...atelier,
      name: t('precisionWorkshops', atelier.id),
      description: t('precisionWorkshops', atelier.id + 'Desc'),
      scoringOptions: atelier.scoringOptions.map(opt => ({
        ...opt,
        label: opt.points === 0 ? t('precisionWorkshops', 'rate') :
               opt.points === 5 ? t('precisionWorkshops', 'carreau') :
               opt.label === 'Touch\u00e9' ? t('precisionWorkshops', 'touche') :
               t('precisionWorkshops', 'sorti'),
        description: t('precisionWorkshops', `${atelier.id}_${opt.points === 0 ? 'rate' : opt.points === 5 ? 'carreau' : opt.label === 'Touch\u00e9' ? 'touche' : 'sorti'}`),
      })),
    }));
  }, [t]);

  // Navigation state
  const [selectedType, setSelectedType] = useState<ChallengeType | null>(null);
  const [challengeMode, setChallengeMode] = useState<ChallengeMode | null>(null);
  const [selectedOpponent, setSelectedOpponent] = useState<Player | null>(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedBoulesSetId, setSelectedBoulesSetId] = useState<string | null>(() => {
    const primary = boulesSets.find(bs => bs.isPrimary);
    return primary ? primary.id : null;
  });
  const [selectedTerrainId, setSelectedTerrainId] = useState<string | null>(() => selfPlayer?.terrainId || null);
  
  // Challenge state
  const [isStarted, setIsStarted] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [currentTurn, setCurrentTurn] = useState<'player' | 'opponent'>('player');

  // Standard challenge (10 tirs)
  const [shots, setShots] = useState<ChallengeShot[]>([]);
  const [currentShot, setCurrentShot] = useState(1);
  const [opponentShots, setOpponentShots] = useState<ChallengeShot[]>([]);
  const [opponentCurrentShot, setOpponentCurrentShot] = useState(1);

  // Precision challenge
  const [precisionShots, setPrecisionShots] = useState<PrecisionShot[]>([]);
  const [currentAtelierIndex, setCurrentAtelierIndex] = useState(0);
  const [currentDistanceIndex, setCurrentDistanceIndex] = useState(0);
  const [opponentPrecisionShots, setOpponentPrecisionShots] = useState<PrecisionShot[]>([]);
  const [opponentAtelierIndex, setOpponentAtelierIndex] = useState(0);
  const [opponentDistanceIndex, setOpponentDistanceIndex] = useState(0);
  const [shotTimerRunning, setShotTimerRunning] = useState(false);
  const [shotStartTime, setShotStartTime] = useState(0);

  // Notation
  const [showNotation, setShowNotation] = useState(false);
  const [notationRecords, setNotationRecords] = useState<SimpleShotRecord[]>([]);
  const [pendingNotationIsOpponent, setPendingNotationIsOpponent] = useState(false);
  const [savedChallengeIdForShare, setSavedChallengeIdForShare] = useState<string | null>(null);
  const [showPostChallengeShare, setShowPostChallengeShare] = useState(false);
  const [isSavingForShare, setIsSavingForShare] = useState(false);
  const [showShareRequestModal, setShowShareRequestModal] = useState(false);
  const [shareRequestItemId, setShareRequestItemId] = useState<string | null>(null);
  const [shareRequestPlayerIds, setShareRequestPlayerIds] = useState<string[]>([]);

  // Picker modals for terrain & boules set
  const [showChallTerrainPicker, setShowChallTerrainPicker] = useState(false);
  const [showChallBoulesSetPicker, setShowChallBoulesSetPicker] = useState(false);
  const [challTerrainSearch, setChallTerrainSearch] = useState('');

  // Sponsor state (auto-set from active event)
  const [selectedSponsor, setSelectedSponsor] = useState<Ambassador | null>(null);

  // Sponsored event detection
  const [activeEvent, setActiveEvent] = useState<SponsoredEvent | null>(null);
  const [linkToEvent, setLinkToEvent] = useState(false);
  const [eventDetectionDone, setEventDetectionDone] = useState(false);

  // Detect active sponsored events the user is registered for
  useEffect(() => {
    if (eventDetectionDone) return;
    (async () => {
      try {
        const { events } = await getSponsoredEvents();
        const now = new Date();
        // Find events that are active right now (within time window)
        for (const ev of events) {
          const start = new Date(ev.startTime);
          const end = new Date(ev.endTime);
          if ((ev.status === 'active' || ev.status === 'upcoming') && now >= start && now <= end) {
            const status = await getMyParticipationStatus(ev.id);
            if (status === 'accepted') {
              setActiveEvent(ev);
              setLinkToEvent(true);
              break;
            }
          }
        }
      } catch { /* silent */ }
      setEventDetectionDone(true);
    })();
  }, [eventDetectionDone]);

  // Auto-sync sponsor from active event
  useEffect(() => {
    if (activeEvent && linkToEvent) {
      setSelectedSponsor({
        id: activeEvent.ambassadorId,
        displayName: activeEvent.ambassadorName || '',
        photo: activeEvent.ambassadorPhoto || null,
        badgeType: (activeEvent.ambassadorBadgeType || 'ambassador') as any,
        userId: activeEvent.creatorUserId,
        isActive: true,
        isFeatured: false,
        sortOrder: 0,
      } as Ambassador);
    } else {
      setSelectedSponsor(null);
    }
  }, [activeEvent, linkToEvent]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const config = selectedType ? CHALLENGE_CONFIG[selectedType] : null;

  // Track navigation direction to avoid replaying entering animations on back
  const maxStepReached = useRef(0); // 0=type, 1=mode, 2=opponent/ready
  const currentStep = !selectedType ? 0 : !challengeMode ? 1 : (challengeMode === '1v1' && !selectedOpponent && !isStarted) ? 2 : 3;
  if (currentStep > maxStepReached.current) maxStepReached.current = currentStep;
  const isRevisit = currentStep < maxStepReached.current;
  // Reset max step when going all the way back to type selection
  if (currentStep === 0) maxStepReached.current = 0;

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const playerStats = useMemo(() => ({
    successCount: shots.filter(s => s.success).length,
    carreauCount: shots.filter(s => s.carreau).length,
    successRate: shots.length > 0 ? Math.round((shots.filter(s => s.success).length / shots.length) * 100) : 0,
    totalPrecisionPoints: precisionShots.reduce((sum, s) => sum + s.points, 0),
  }), [shots, precisionShots]);

  const opponentStats = useMemo(() => ({
    successCount: opponentShots.filter(s => s.success).length,
    carreauCount: opponentShots.filter(s => s.carreau).length,
    successRate: opponentShots.length > 0 ? Math.round((opponentShots.filter(s => s.success).length / opponentShots.length) * 100) : 0,
    totalPrecisionPoints: opponentPrecisionShots.reduce((sum, s) => sum + s.points, 0),
  }), [opponentShots, opponentPrecisionShots]);

  const currentAtelier = TRANSLATED_ATELIERS[currentAtelierIndex];
  const currentDistance = PRECISION_DISTANCES[currentDistanceIndex];
  const currentPrecisionShotNumber = currentAtelierIndex * 4 + currentDistanceIndex + 1;

  const opponentAtelier = TRANSLATED_ATELIERS[opponentAtelierIndex];
  const opponentDistance = PRECISION_DISTANCES[opponentDistanceIndex];
  const opponentPrecisionShotNumber = opponentAtelierIndex * 4 + opponentDistanceIndex + 1;

  const atelierScores = useMemo(() => 
    PRECISION_ATELIERS.reduce((acc, atelier) => {
      acc[atelier.id] = precisionShots.filter(s => s.atelier === atelier.id).reduce((sum, s) => sum + s.points, 0);
      return acc;
    }, {} as Record<PrecisionAtelier, number>
  ), [precisionShots]);

  const opponentAtelierScores = useMemo(() => 
    PRECISION_ATELIERS.reduce((acc, atelier) => {
      acc[atelier.id] = opponentPrecisionShots.filter(s => s.atelier === atelier.id).reduce((sum, s) => sum + s.points, 0);
      return acc;
    }, {} as Record<PrecisionAtelier, number>
  ), [opponentPrecisionShots]);

  const filteredChallTerrains = useMemo(() => {
    const s = challTerrainSearch.toLowerCase();
    return terrains.filter(tr => !s || tr.name.toLowerCase().includes(s) || tr.city.toLowerCase().includes(s));
  }, [terrains, challTerrainSearch]);

  const selectedTerrainObj = useMemo(() => selectedTerrainId ? terrains.find(tr => tr.id === selectedTerrainId) || null : null, [selectedTerrainId, terrains]);
  const selectedBoulesSetObj = useMemo(() => selectedBoulesSetId ? boulesSets.find(bs => bs.id === selectedBoulesSetId) || null : null, [selectedBoulesSetId, boulesSets]);

  const filteredPlayers = useMemo(() => {
    let result = players.filter(p => !selfPlayer || p.id !== selfPlayer.id);
    if (playerSearch.trim()) {
      const search = playerSearch.toLowerCase();
      result = result.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.club?.toLowerCase().includes(search) ||
        p.role.toLowerCase().includes(search)
      );
    }
    return result;
  }, [players, selfPlayer, playerSearch]);

  // Sort opponents by confrontation frequency (most faced first)
  const sortedOpponents = useMemo(() => {
    const selfId = selfPlayer?.id || userStats.playerId;
    const confrontationCount: Record<string, number> = {};
    matches.forEach(m => {
      const selfInA = m.teamA.players.includes(selfId);
      const selfInB = m.teamB.players.includes(selfId);
      if (selfInA) {
        m.teamB.players.forEach(pid => {
          confrontationCount[pid] = (confrontationCount[pid] || 0) + 1;
        });
      } else if (selfInB) {
        m.teamA.players.forEach(pid => {
          confrontationCount[pid] = (confrontationCount[pid] || 0) + 1;
        });
      }
    });
    pastChallenges.forEach(c => {
      if (c.mode === '1v1' && c.opponentId) {
        confrontationCount[c.opponentId] = (confrontationCount[c.opponentId] || 0) + 1;
      }
    });
    return [...filteredPlayers]
      .map(p => ({ ...p, _confrontations: confrontationCount[p.id] || 0 }))
      .sort((a, b) => b._confrontations - a._confrontations);
  }, [filteredPlayers, matches, pastChallenges, selfPlayer, userStats.playerId]);

  // ============================================
  // EFFECTS
  // ============================================

  useEffect(() => {
    if (isStarted && !isFinished) {
      timerRef.current = setInterval(() => setElapsedTime(prev => prev + 1), 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isStarted, isFinished]);

  // ============================================
  // HANDLERS
  // ============================================

  const startChallenge = useCallback(() => {
    if (!selectedType || !challengeMode) return;
    if (challengeMode === '1v1' && !selectedOpponent) {
      Alert.alert(t('common', 'error'), t('challenge', 'selectOpponent'));
      return;
    }
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsStarted(true);
    setShots([]);
    setOpponentShots([]);
    setPrecisionShots([]);
    setOpponentPrecisionShots([]);
    setCurrentShot(1);
    setOpponentCurrentShot(1);
    setCurrentAtelierIndex(0);
    setCurrentDistanceIndex(0);
    setOpponentAtelierIndex(0);
    setOpponentDistanceIndex(0);
    setElapsedTime(0);
    setIsFinished(false);
    setCurrentTurn('player');
    setShotTimerRunning(false);
    setShotStartTime(0);
  }, [selectedType, challengeMode, selectedOpponent, t]);

  const recordShot = useCallback((success: boolean, carreau: boolean = false, isOpponent: boolean = false) => {
    if (!config || selectedType === 'precision') return;

    Haptics.impactAsync(success ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);

    const newShot: ChallengeShot = {
      number: isOpponent ? opponentCurrentShot : currentShot,
      success,
      carreau: success && carreau ? true : undefined,
      timestamp: new Date().toISOString(),
    };

    if (isOpponent) {
      if (opponentShots.length >= config.totalShots) return;
      setOpponentShots(prev => [...prev, newShot]);

      if (opponentCurrentShot >= config.totalShots) {
        if (shots.length >= config.totalShots) {
          setIsFinished(true);
          if (timerRef.current) clearInterval(timerRef.current);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setCurrentTurn('player');
        }
      } else {
        setOpponentCurrentShot(prev => prev + 1);
      }
    } else {
      if (shots.length >= config.totalShots) return;
      setShots(prev => [...prev, newShot]);

      if (currentShot >= config.totalShots) {
        if (challengeMode === 'solo' || opponentShots.length >= config.totalShots) {
          setIsFinished(true);
          if (timerRef.current) clearInterval(timerRef.current);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          setCurrentTurn('opponent');
        }
      } else {
        setCurrentShot(prev => prev + 1);
      }
    }
  }, [config, selectedType, currentShot, opponentCurrentShot, challengeMode, shots, opponentShots]);

  const recordPrecisionShot = useCallback((points: 0 | 1 | 3 | 5, isOpponent: boolean = false) => {
    if (!isStarted || selectedType !== 'precision') return;

    Haptics.impactAsync(points >= 3 ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    setShotTimerRunning(false);
    const timeUsed = Math.min(Math.round((Date.now() - shotStartTime) / 1000), 30);

    if (isOpponent) {
      if (opponentPrecisionShots.length >= 20) return;

      const newShot: PrecisionShot = {
        atelier: opponentAtelier.id,
        distance: opponentDistance,
        points,
        timeUsed,
        timestamp: new Date().toISOString(),
      };

      setOpponentPrecisionShots(prev => [...prev, newShot]);
      const newCount = opponentPrecisionShots.length + 1;

      if (opponentDistanceIndex < 3) {
        setOpponentDistanceIndex(prev => prev + 1);
      } else if (opponentAtelierIndex < 4) {
        setOpponentAtelierIndex(prev => prev + 1);
        setOpponentDistanceIndex(0);
      }

      if (newCount >= 20 && precisionShots.length >= 20) {
        setIsFinished(true);
        if (timerRef.current) clearInterval(timerRef.current);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else if (newCount >= 20) {
        setCurrentTurn('player');
      } else if (precisionShots.length < 20) {
        setCurrentTurn('player');
      }
    } else {
      if (precisionShots.length >= 20) return;

      const newShot: PrecisionShot = {
        atelier: currentAtelier.id,
        distance: currentDistance,
        points,
        timeUsed,
        timestamp: new Date().toISOString(),
      };

      setPrecisionShots(prev => [...prev, newShot]);
      const newCount = precisionShots.length + 1;

      if (currentDistanceIndex < 3) {
        setCurrentDistanceIndex(prev => prev + 1);
      } else if (currentAtelierIndex < 4) {
        setCurrentAtelierIndex(prev => prev + 1);
        setCurrentDistanceIndex(0);
      }

      if (challengeMode === 'solo') {
        if (newCount >= 20) {
          setIsFinished(true);
          if (timerRef.current) clearInterval(timerRef.current);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } else {
        if (newCount >= 20 && opponentPrecisionShots.length >= 20) {
          setIsFinished(true);
          if (timerRef.current) clearInterval(timerRef.current);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (newCount >= 20) {
          setCurrentTurn('opponent');
        } else if (opponentPrecisionShots.length < 20) {
          setCurrentTurn('opponent');
        }
      }
    }
    setShotStartTime(0);
  }, [isStarted, selectedType, currentAtelier, currentDistance, currentAtelierIndex, currentDistanceIndex,
      opponentAtelier, opponentDistance, opponentAtelierIndex, opponentDistanceIndex, shotStartTime,
      challengeMode, precisionShots, opponentPrecisionShots]);

  const handleTimeUp = useCallback(() => {
    recordPrecisionShot(0, currentTurn === 'opponent');
  }, [recordPrecisionShot, currentTurn]);

  const startShotTimer = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShotTimerRunning(true);
    setShotStartTime(Date.now());
  }, []);

  const openNotationModal = useCallback((isOpponent: boolean) => {
    setPendingNotationIsOpponent(isOpponent);
    setShowNotation(true);
  }, []);

  const handleNotationSubmit = useCallback((record: SimpleShotRecord) => {
    setNotationRecords(prev => [...prev, record]);
    recordShot(record.success, record.carreau || false, pendingNotationIsOpponent);
    setShowNotation(false);
    setPendingNotationIsOpponent(false);
  }, [pendingNotationIsOpponent, recordShot]);

  const getWinner = useCallback((): 'player' | 'opponent' | 'draw' => {
    if (selectedType === 'precision') {
      if (playerStats.totalPrecisionPoints > opponentStats.totalPrecisionPoints) return 'player';
      if (opponentStats.totalPrecisionPoints > playerStats.totalPrecisionPoints) return 'opponent';
      return 'draw';
    }
    if (playerStats.successRate > opponentStats.successRate) return 'player';
    if (opponentStats.successRate > playerStats.successRate) return 'opponent';
    if (playerStats.carreauCount > opponentStats.carreauCount) return 'player';
    if (opponentStats.carreauCount > playerStats.carreauCount) return 'opponent';
    return 'draw';
  }, [selectedType, playerStats, opponentStats]);

  const buildChallengeData = useCallback(() => {
    if (!selectedType || !challengeMode) return null;
    
    const opponentResult: ChallengePlayerResult | undefined = challengeMode === '1v1' && selectedOpponent ? {
      playerId: selectedOpponent.id,
      playerName: selectedOpponent.name,
      shots: selectedType !== 'precision' ? opponentShots : undefined,
      precisionShots: selectedType === 'precision' ? opponentPrecisionShots : undefined,
      successCount: opponentStats.successCount,
      totalShots: opponentShots.length,
      carreauCount: opponentStats.carreauCount,
      successRate: opponentStats.successRate,
      totalPoints: selectedType === 'precision' ? opponentStats.totalPrecisionPoints : undefined,
      atelierScores: selectedType === 'precision' ? opponentAtelierScores : undefined,
    } : undefined;

    const winner = challengeMode === '1v1' ? getWinner() : undefined;

    const detailedShots = notationRecords.map((record, idx) => ({
      id: `shot-${idx}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actionType: record.actionType,
      success: record.success,
      carreau: record.carreau,
      shotType: record.shotType,
      shotResult: record.shotResult,
      shotQuality: record.shotQuality,
      pointType: record.pointType,
      pointQuality: record.pointQuality,
    }));

    const sponsorFields = selectedSponsor ? {
      sponsorId: selectedSponsor.id,
      sponsorName: selectedSponsor.displayName,
      sponsorPhoto: selectedSponsor.photo || undefined,
    } : {};

    if (selectedType === 'precision') {
      return {
        type: selectedType,
        mode: challengeMode,
        date: new Date().toISOString(),
        playerId: selfPlayer?.id || userStats.playerId,
        playerName: selfPlayer?.name || userStats.playerName,
        opponentId: selectedOpponent?.id,
        opponentName: selectedOpponent?.name,
        opponentResult,
        winner,
        precisionShots,
        totalPoints: playerStats.totalPrecisionPoints,
        maxPoints: 100,
        atelierScores,
        duration: elapsedTime,
        boulesSetId: selectedBoulesSetId || undefined,
        terrainId: selectedTerrainId || undefined,
        ...sponsorFields,
      };
    } else {
      return {
        type: selectedType,
        mode: challengeMode,
        date: new Date().toISOString(),
        playerId: selfPlayer?.id || userStats.playerId,
        playerName: selfPlayer?.name || userStats.playerName,
        opponentId: selectedOpponent?.id,
        opponentName: selectedOpponent?.name,
        opponentResult,
        winner,
        shots,
        successCount: playerStats.successCount,
        totalShots: shots.length,
        carreauCount: playerStats.carreauCount,
        successRate: playerStats.successRate,
        duration: elapsedTime,
        detailedShots: detailedShots.length > 0 ? detailedShots : undefined,
        boulesSetId: selectedBoulesSetId || undefined,
        terrainId: selectedTerrainId || undefined,
        ...sponsorFields,
      };
    }
  }, [selectedType, challengeMode, selectedOpponent, opponentShots, opponentPrecisionShots,
      opponentStats, opponentAtelierScores, getWinner, notationRecords, precisionShots,
      playerStats, atelierScores, elapsedTime, shots, selfPlayer, userStats]);

  const saveChallenge = useCallback(() => {
    const data = buildChallengeData();
    if (!data) return;
    const newId = addChallenge(data);
    // Submit to event if linked
    if (activeEvent && linkToEvent) {
      const score = selectedType === 'precision' ? playerStats.totalPrecisionPoints : playerStats.successRate;
      submitEventResult(activeEvent.id, '', score).catch(() => {});
    }
    if (selectedSponsor) trackAmbassadorEvent(selectedSponsor.id, 'sponsored_challenge');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Detect linked players for share request (1v1 opponent)
    const challengePlayerIds: string[] = [];
    if (selfPlayer?.id) challengePlayerIds.push(selfPlayer.id);
    if (selectedOpponent?.id) challengePlayerIds.push(selectedOpponent.id);
    if (challengePlayerIds.length > 0 && newId) {
      setShareRequestItemId(newId as string);
      setShareRequestPlayerIds(challengePlayerIds);
      setShowShareRequestModal(true);
      return; // Don't navigate yet, modal will handle it
    }

    // Show interstitial ad after saving challenge
    showInterstitial().finally(() => {
      router.back();
    });
  }, [buildChallengeData, addChallenge, activeEvent, linkToEvent, selectedType, playerStats, selectedSponsor, selfPlayer, selectedOpponent]);

  const handleSaveAndShare = useCallback(async () => {
    const data = buildChallengeData();
    if (!data) return;
    setIsSavingForShare(true);
    const newId = await addChallenge(data);
    if (selectedSponsor) trackAmbassadorEvent(selectedSponsor.id, 'sponsored_challenge');
    setIsSavingForShare(false);
    if (newId) {
      setSavedChallengeIdForShare(newId);
      // Detect linked players for cross-player sharing
      const challengePlayerIds: string[] = [];
      if (selfPlayer?.id) challengePlayerIds.push(selfPlayer.id);
      if (selectedOpponent?.id) challengePlayerIds.push(selectedOpponent.id);
      if (challengePlayerIds.length > 0) {
        setShareRequestItemId(newId);
        setShareRequestPlayerIds(challengePlayerIds);
        setShowShareRequestModal(true);
      } else {
        setShowPostChallengeShare(true);
      }
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [buildChallengeData, addChallenge, selectedSponsor, selfPlayer, selectedOpponent]);

  const cancelChallenge = useCallback(() => {
    Alert.alert(t('challenge', 'quitChallenge'), t('challenge', 'challengeWillBeLost'), [
      { text: t('challenge', 'continueLabel'), style: 'cancel' },
      { text: t('challenge', 'quitLabel'), style: 'destructive', onPress: () => {
        if (timerRef.current) clearInterval(timerRef.current);
        router.back();
      }},
    ]);
  }, [t]);

  const resetChallenge = useCallback(() => {
    Alert.alert(t('challenge', 'challengeFinished'), t('challenge', 'whatToDo'), [
      {
        text: t('challenge', 'restartLabel'),
        onPress: async () => {
          // Save current challenge before restarting
          const data = buildChallengeData();
          if (data) {
            await addChallenge(data);
          }
          setIsStarted(false);
          setShots([]);
          setOpponentShots([]);
          setPrecisionShots([]);
          setOpponentPrecisionShots([]);
          setCurrentShot(1);
          setOpponentCurrentShot(1);
          setCurrentAtelierIndex(0);
          setCurrentDistanceIndex(0);
          setOpponentAtelierIndex(0);
          setOpponentDistanceIndex(0);
          setElapsedTime(0);
          setIsFinished(false);
          setShotTimerRunning(false);
          setCurrentTurn('player');
          setNotationRecords([]);
        },
      },
      {
        text: t('challenge', 'exitChallenges'),
        style: 'destructive',
        onPress: () => {
          if (timerRef.current) clearInterval(timerRef.current);
          router.back();
        },
      },
    ]);
  }, [t, buildChallengeData, addChallenge]);

  // ============================================
  // RENDER: Challenge Type Selection
  // ============================================

  if (!selectedType) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => router.back()}>
            <MaterialIcons name="close" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('challenge', 'newChallenge')}</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={isRevisit ? undefined : FadeInDown.duration(400)} style={styles.heroSection}>
            <View style={styles.heroIcon}>
              <MaterialIcons name="emoji-events" size={40} color={theme.carreauColor} />
            </View>
            <Text style={styles.heroTitle}>{t('challenge', 'chooseChallenge')}</Text>
            <Text style={styles.heroSubtitle}>{t('challenge', 'trainAndProgress')}</Text>
          </Animated.View>

          {(Object.entries(CHALLENGE_CONFIG) as [ChallengeType, typeof CHALLENGE_CONFIG[ChallengeType]][]).map(([type, cfg], index) => (
            <Animated.View key={type} entering={isRevisit ? undefined : FadeInDown.duration(400).delay(100 + index * 80)}>
              <Pressable
                style={[styles.challengeCard, { borderLeftColor: cfg.color }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSelectedType(type);
                }}
              >
                <View style={[styles.challengeCardIcon, { backgroundColor: cfg.color + '15' }]}>
                  <MaterialIcons name={cfg.icon} size={28} color={cfg.color} />
                </View>
                <View style={styles.challengeCardContent}>
                  <Text style={styles.challengeCardTitle}>{cfg.name}</Text>
                  <Text style={styles.challengeCardDesc}>{cfg.description}</Text>
                  <View style={styles.challengeCardMeta}>
                    <View style={[styles.metaBadge, { backgroundColor: cfg.color + '10' }]}>
                      <Text style={[styles.metaBadgeText, { color: cfg.color }]}>
                        {type === 'precision' ? `5 ${t('challenge', 'workshops')}` : `${cfg.totalShots} ${t('challenge', 'shots')}`}
                      </Text>
                    </View>
                  </View>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={theme.textMuted} />
              </Pressable>
            </Animated.View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ============================================
  // RENDER: Mode Selection
  // ============================================

  if (!challengeMode) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => { setSelectedType(null); setChallengeMode(null); setSelectedOpponent(null); setPlayerSearch(''); }}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{config?.name}</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.modeContent} showsVerticalScrollIndicator={false}>
          <Animated.View entering={isRevisit ? undefined : FadeInDown.duration(400)} style={styles.modeHeader}>
            <View style={[styles.modeHeaderIcon, { backgroundColor: config?.color + '15' }]}>
              <MaterialIcons name={config?.icon || 'sports'} size={28} color={config?.color} />
            </View>
            <Text style={styles.modeHeaderTitle}>{t('challenge', 'howToPlay')}</Text>
          </Animated.View>

          <View style={styles.modeGrid}>
            <Animated.View entering={isRevisit ? undefined : ZoomIn.duration(400).delay(100)} style={styles.modeCardWrapper}>
              <Pressable
                style={styles.modeCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setChallengeMode('solo');
                }}
              >
                <View style={[styles.modeCardIconBg, { backgroundColor: theme.primary }]}>
                  <MaterialIcons name="person" size={36} color="#FFF" />
                </View>
                <Text style={styles.modeCardTitle}>{t('challenge', 'solo')}</Text>
                <Text style={styles.modeCardDesc}>{t('challenge', 'personalTraining')}</Text>
                <View style={[styles.modeCardBtn, { backgroundColor: theme.primary }]}>
                  <Text style={styles.modeCardBtnText}>{t('challenge', 'start')}</Text>
                </View>
              </Pressable>
            </Animated.View>

            <Animated.View entering={isRevisit ? undefined : ZoomIn.duration(400).delay(200)} style={styles.modeCardWrapper}>
              <Pressable
                style={styles.modeCard}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setChallengeMode('1v1');
                }}
              >
                <View style={[styles.modeCardIconBg, { backgroundColor: theme.accent }]}>
                  <MaterialIcons name="people" size={36} color="#FFF" />
                </View>
                <Text style={styles.modeCardTitle}>{t('challenge', 'oneVsOne')}</Text>
                <Text style={styles.modeCardDesc}>{t('challenge', 'challengeOpponent')}</Text>
                <View style={[styles.modeCardBtn, { backgroundColor: theme.accent }]}>
                  <Text style={styles.modeCardBtnText}>{t('challenge', 'choose')}</Text>
                </View>
              </Pressable>
            </Animated.View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ============================================
  // RENDER: Opponent Selection (1v1)
  // ============================================

  if (challengeMode === '1v1' && !selectedOpponent && !isStarted) {
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => { setChallengeMode(null); setPlayerSearch(''); }}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('challenge', 'opponentLabel')}</Text>
          <View style={styles.headerBtn} />
        </View>

        <View style={styles.opponentSearchContainer}>
          <MaterialIcons name="search" size={20} color={theme.textMuted} />
          <TextInput
            style={styles.opponentSearchInput}
            value={playerSearch}
            onChangeText={setPlayerSearch}
            placeholder={`${t('common', 'search')}...`}
            placeholderTextColor={theme.textMuted}
          />
          {playerSearch.length > 0 ? (
            <Pressable onPress={() => setPlayerSearch('')}>
              <MaterialIcons name="close" size={20} color={theme.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.opponentBanner}>
          <View style={styles.opponentBannerPlayers}>
            <View style={styles.opponentBannerAvatar}>
              <MaterialIcons name="person" size={20} color="#FFF" />
            </View>
            <View style={styles.opponentBannerVs}>
              <Text style={styles.opponentBannerVsText}>VS</Text>
            </View>
            <View style={[styles.opponentBannerAvatar, styles.opponentBannerAvatarEmpty]}>
              <MaterialIcons name="help-outline" size={20} color={theme.accent} />
            </View>
          </View>
          <Text style={styles.opponentBannerTitle}>{t('challenge', 'whoToChallenge')}</Text>
        </View>

        <FlatList
          data={sortedOpponents}
          keyExtractor={item => item.id}
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32, paddingTop: 16 }]}
          showsVerticalScrollIndicator={false}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={5}
          renderItem={({ item: player }) => (
            <Pressable
              style={styles.opponentCard}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelectedOpponent(player);
              }}
            >
              <View style={styles.opponentAvatar}>
                <Text style={styles.opponentAvatarText}>
                  {player.name.split(' ').map(n => n[0]).join('')}
                </Text>
              </View>
              <View style={styles.opponentInfo}>
                <View style={styles.opponentNameRow}>
                  <Text style={styles.opponentName}>{player.name}</Text>
                  {(player as any)._confrontations > 0 ? (
                    <View style={styles.confrontationBadge}>
                      <MaterialIcons name="sports" size={10} color={theme.accent} />
                      <Text style={styles.confrontationBadgeText}>{(player as any)._confrontations}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.opponentMeta}>{player.club || '-'} • {player.role}</Text>
              </View>
              <View style={styles.opponentBtn}>
                <Text style={styles.opponentBtnText}>{t('challenge', 'challengeBtn')}</Text>
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="person-search" size={48} color={theme.textMuted} />
              <Text style={styles.emptyStateText}>{t('challenge', 'noPlayers')}</Text>
              <Pressable style={styles.emptyStateBtn} onPress={() => router.push('/player/new')}>
                <MaterialIcons name="person-add" size={18} color={theme.primary} />
                <Text style={styles.emptyStateBtnText}>{t('challenge', 'createPlayer')}</Text>
              </Pressable>
            </View>
          }
        />
      </SafeAreaView>
    );
  }

  // ============================================
  // RENDER: Ready Screen
  // ============================================

  if (!isStarted) {
    const isPrecision = selectedType === 'precision';
    
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => {
            if (challengeMode === '1v1' && selectedOpponent) { setSelectedOpponent(null); setPlayerSearch(''); }
            else { setChallengeMode(null); setSelectedOpponent(null); setPlayerSearch(''); }
          }}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{config?.name}</Text>
          <View style={styles.headerBtn} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.readyContent, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View entering={ZoomIn.duration(400)} style={styles.readyHero}>
            <View style={[styles.readyHeroIcon, { backgroundColor: config?.color + '15' }]}>
              <MaterialIcons name={config?.icon || 'sports'} size={56} color={config?.color} />
            </View>
            <Text style={styles.readyHeroTitle}>{config?.name}</Text>
            <Text style={styles.readyHeroDesc}>{config?.description}</Text>
            
            <View style={[styles.modeBadge, challengeMode === '1v1' && styles.modeBadge1v1]}>
              <MaterialIcons 
                name={challengeMode === 'solo' ? 'person' : 'people'} 
                size={16} 
                color={challengeMode === 'solo' ? theme.primary : theme.accent} 
              />
              <Text style={[styles.modeBadgeText, challengeMode === '1v1' && styles.modeBadgeText1v1]}>
                {challengeMode === 'solo' ? t('challenge', 'solo') : `vs ${selectedOpponent?.name}`}
              </Text>
            </View>
          </Animated.View>

          {/* Sponsored Event Detection */}
          {activeEvent ? (
            <Animated.View entering={FadeInDown.duration(300).delay(80)} style={styles.readyPickersSection}>
              {linkToEvent ? (
                <View style={[styles.readyPickerBtn, { backgroundColor: '#7C3AED08', borderColor: '#7C3AED30', borderWidth: 1.5 }]}>
                  <View style={[styles.readyPickerIcon, { backgroundColor: '#7C3AED15' }]}>
                    {activeEvent.ambassadorPhoto ? (
                      <Image source={{ uri: activeEvent.ambassadorPhoto }} style={{ width: 44, height: 44, borderRadius: 12 }} contentFit="cover" />
                    ) : (
                      <MaterialIcons name="campaign" size={20} color="#7C3AED" />
                    )}
                  </View>
                  <View style={styles.readyPickerContent}>
                    <Text style={[styles.readyPickerLabel, { color: '#7C3AED' }]}>{t('challenge', 'sponsoredChallenge')}</Text>
                    <Text style={styles.readyPickerValue} numberOfLines={1}>{activeEvent.title}</Text>
                    {activeEvent.ambassadorName ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
                        <MaterialIcons name="verified" size={10} color="#7C3AED" />
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#7C3AED' }}>{activeEvent.ambassadorName}</Text>
                      </View>
                    ) : null}
                    <Text style={{ fontSize: 10, color: theme.textMuted, marginTop: 2 }}>
                      {language === 'fr' ? 'Votre resultat sera lie a cet evenement' : 'Your result will be linked to this event'}
                    </Text>
                  </View>
                  <Pressable onPress={() => { setLinkToEvent(false); Haptics.selectionAsync(); }} hitSlop={8}>
                    <MaterialIcons name="close" size={18} color={theme.textMuted} />
                  </Pressable>
                </View>
              ) : (
                <Pressable style={[styles.readyPickerBtn, { borderColor: '#7C3AED20' }]} onPress={() => { setLinkToEvent(true); Haptics.selectionAsync(); }}>
                  <View style={[styles.readyPickerIcon, { backgroundColor: '#7C3AED10' }]}>
                    <MaterialIcons name="campaign" size={20} color="#7C3AED" />
                  </View>
                  <View style={styles.readyPickerContent}>
                    <Text style={styles.readyPickerLabel}>{language === 'fr' ? 'Evenement disponible' : 'Event available'}</Text>
                    <Text style={[styles.readyPickerValue, { color: '#7C3AED' }]} numberOfLines={1}>{activeEvent.title}</Text>
                  </View>
                  <MaterialIcons name="add-circle-outline" size={20} color="#7C3AED" />
                </Pressable>
              )}
            </Animated.View>
          ) : null}

          {/* Terrain & Boules Set Selectors */}
          <Animated.View entering={FadeInDown.duration(300).delay(100)} style={styles.readyPickersSection}>
            <Pressable style={styles.readyPickerBtn} onPress={() => { setChallTerrainSearch(''); setShowChallTerrainPicker(true); }}>
              <View style={[styles.readyPickerIcon, { backgroundColor: selectedTerrainObj ? theme.primary + '15' : theme.textMuted + '10' }]}>
                <MaterialIcons name="place" size={20} color={selectedTerrainObj ? theme.primary : theme.textMuted} />
              </View>
              <View style={styles.readyPickerContent}>
                <Text style={styles.readyPickerLabel}>{t('challenge', 'terrain')}</Text>
                <Text style={[styles.readyPickerValue, !selectedTerrainObj && styles.readyPickerPlaceholder]} numberOfLines={1}>
                  {selectedTerrainObj ? `${selectedTerrainObj.name} • ${selectedTerrainObj.city}` : t('match', 'chooseTerrain')}
                </Text>
              </View>
              {selectedTerrainObj ? (
                <Pressable onPress={(e) => { e.stopPropagation(); setSelectedTerrainId(null); Haptics.selectionAsync(); }} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={theme.textMuted} />
                </Pressable>
              ) : (
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              )}
            </Pressable>

            <Pressable style={styles.readyPickerBtn} onPress={() => setShowChallBoulesSetPicker(true)}>
              <View style={[styles.readyPickerIcon, { backgroundColor: selectedBoulesSetObj ? theme.accent + '15' : theme.textMuted + '10' }]}>
                <MaterialIcons name="sports-baseball" size={20} color={selectedBoulesSetObj ? theme.accent : theme.textMuted} />
              </View>
              <View style={styles.readyPickerContent}>
                <Text style={styles.readyPickerLabel}>{t('challenge', 'boulesSet')}</Text>
                <Text style={[styles.readyPickerValue, !selectedBoulesSetObj && styles.readyPickerPlaceholder]} numberOfLines={1}>
                  {selectedBoulesSetObj ? `${selectedBoulesSetObj.name}${selectedBoulesSetObj.diameter ? ` • ${selectedBoulesSetObj.diameter}mm` : ''}${selectedBoulesSetObj.weight ? ` • ${selectedBoulesSetObj.weight}g` : ''}` : t('match', 'chooseBoulesSet')}
                </Text>
              </View>
              {selectedBoulesSetObj ? (
                <Pressable onPress={(e) => { e.stopPropagation(); setSelectedBoulesSetId(null); Haptics.selectionAsync(); }} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={theme.textMuted} />
                </Pressable>
              ) : (
                <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
              )}
            </Pressable>
          </Animated.View>

          {isPrecision && (
            <View style={styles.readySection}>
              <Text style={styles.readySectionTitle}>{t('challenge', 'theWorkshops')}</Text>
              {TRANSLATED_ATELIERS.map((atelier, index) => (
                <Animated.View key={atelier.id} entering={FadeInDown.duration(300).delay(100 + index * 60)}>
                  <View style={styles.atelierCard}>
                    <View style={[styles.atelierIcon, { backgroundColor: theme.primary + '15' }]}>
                      <MaterialIcons name={atelier.icon as any} size={20} color={theme.primary} />
                    </View>
                    <Text style={styles.atelierName}>{atelier.name}</Text>
                    <Text style={styles.atelierDesc}>{atelier.description}</Text>
                    <Text style={styles.atelierDist}>6-9m</Text>
                  </View>
                </Animated.View>
              ))}
            </View>
          )}

          {!isPrecision && (
            <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.readyInfoCard}>
              <View style={styles.readyInfoRow}>
                <MaterialIcons name="timer" size={18} color={theme.textSecondary} />
                <Text style={styles.readyInfoText}>{t('challenge', 'timedAuto')}</Text>
              </View>
              <View style={styles.readyInfoRow}>
                <MaterialIcons name="stars" size={18} color={theme.carreauColor} />
                <Text style={styles.readyInfoText}>{t('challenge', 'carreauxCounted')}</Text>
              </View>
              <View style={styles.readyInfoRow}>
                <MaterialIcons name="save" size={18} color={theme.primary} />
                <Text style={styles.readyInfoText}>{t('challenge', 'resultsSaved')}</Text>
              </View>
            </Animated.View>
          )}

        </ScrollView>

        <View style={[styles.bottomAction, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={[styles.startBtn, { backgroundColor: config?.color }]} onPress={startChallenge}>
            <MaterialIcons name="play-arrow" size={28} color="#FFF" />
            <Text style={styles.startBtnText}>{t('challenge', 'start')}</Text>
          </Pressable>
        </View>

        {/* Terrain Picker Modal */}
        <Modal visible={showChallTerrainPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowChallTerrainPicker(false)}>
          <SafeAreaView style={styles.pickerModalContainer}>
            <View style={styles.pickerModalHeader}>
              <Pressable style={styles.pickerModalCloseBtn} onPress={() => setShowChallTerrainPicker(false)}>
                <MaterialIcons name="close" size={24} color={theme.textPrimary} />
              </Pressable>
              <Text style={styles.pickerModalTitle}>{t('challenge', 'terrain')}</Text>
              <View style={{ width: 40 }} />
            </View>
            <View style={styles.pickerModalSearch}>
              <MaterialIcons name="search" size={20} color={theme.textMuted} />
              <TextInput style={styles.pickerModalSearchInput} value={challTerrainSearch} onChangeText={setChallTerrainSearch} placeholder={`${t('common', 'search')}...`} placeholderTextColor={theme.textMuted} autoFocus />
              {challTerrainSearch.length > 0 ? <Pressable onPress={() => setChallTerrainSearch('')}><MaterialIcons name="close" size={20} color={theme.textMuted} /></Pressable> : null}
            </View>
            <Pressable style={[styles.pickerModalItem, !selectedTerrainId && styles.pickerModalItemActive]} onPress={() => { Haptics.selectionAsync(); setSelectedTerrainId(null); setShowChallTerrainPicker(false); }}>
              <View style={[styles.pickerModalItemIcon, { backgroundColor: theme.textMuted + '15' }]}><MaterialIcons name="block" size={20} color={theme.textMuted} /></View>
              <Text style={styles.pickerModalItemName}>{t('terrain', 'noneLabel')}</Text>
              {!selectedTerrainId ? <MaterialIcons name="check-circle" size={20} color={theme.primary} /> : null}
            </Pressable>
            <FlatList
              data={filteredChallTerrains}
              keyExtractor={item => item.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item: tr }) => (
                <Pressable style={[styles.pickerModalItem, { marginHorizontal: 0 }, selectedTerrainId === tr.id && styles.pickerModalItemActive]} onPress={() => { Haptics.selectionAsync(); setSelectedTerrainId(tr.id); setShowChallTerrainPicker(false); }}>
                  <View style={[styles.pickerModalItemIcon, { backgroundColor: selectedTerrainId === tr.id ? theme.primary : theme.primary + '15' }]}>
                    <MaterialIcons name="place" size={20} color={selectedTerrainId === tr.id ? '#FFF' : theme.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerModalItemName}>{tr.name}</Text>
                    <Text style={styles.pickerModalItemSub}>{tr.city} • {tr.type}</Text>
                  </View>
                  {selectedTerrainId === tr.id ? <MaterialIcons name="check-circle" size={20} color={theme.primary} /> : null}
                </Pressable>
              )}
              ListEmptyComponent={<View style={styles.pickerModalEmpty}><MaterialIcons name="place" size={40} color={theme.textMuted} /><Text style={styles.pickerModalEmptyText}>{t('common', 'noResults')}</Text></View>}
            />
          </SafeAreaView>
        </Modal>

        {/* Boules Set Picker Modal */}
        <Modal visible={showChallBoulesSetPicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowChallBoulesSetPicker(false)}>
          <SafeAreaView style={styles.pickerModalContainer}>
            <View style={styles.pickerModalHeader}>
              <Pressable style={styles.pickerModalCloseBtn} onPress={() => setShowChallBoulesSetPicker(false)}>
                <MaterialIcons name="close" size={24} color={theme.textPrimary} />
              </Pressable>
              <Text style={styles.pickerModalTitle}>{t('challenge', 'boulesSet')}</Text>
              <View style={{ width: 40 }} />
            </View>
            <Pressable style={[styles.pickerModalItem, !selectedBoulesSetId && styles.pickerModalItemActive]} onPress={() => { Haptics.selectionAsync(); setSelectedBoulesSetId(null); setShowChallBoulesSetPicker(false); }}>
              <View style={[styles.pickerModalItemIcon, { backgroundColor: theme.textMuted + '15' }]}><MaterialIcons name="block" size={20} color={theme.textMuted} /></View>
              <Text style={styles.pickerModalItemName}>{t('terrain', 'noneLabel')}</Text>
              {!selectedBoulesSetId ? <MaterialIcons name="check-circle" size={20} color={theme.accent} /> : null}
            </Pressable>
            <FlatList
              data={boulesSets}
              keyExtractor={item => item.id}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
              renderItem={({ item: bs }) => (
                <Pressable style={[styles.pickerModalItem, { marginHorizontal: 0 }, selectedBoulesSetId === bs.id && styles.pickerModalItemActive]} onPress={() => { Haptics.selectionAsync(); setSelectedBoulesSetId(bs.id); setShowChallBoulesSetPicker(false); }}>
                  <View style={[styles.pickerModalItemIcon, { backgroundColor: selectedBoulesSetId === bs.id ? theme.accent : theme.accent + '15' }]}>
                    <MaterialIcons name="sports-baseball" size={20} color={selectedBoulesSetId === bs.id ? '#FFF' : theme.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerModalItemName}>{bs.name}</Text>
                    <Text style={styles.pickerModalItemSub}>{[bs.brand, bs.diameter ? `${bs.diameter}mm` : '', bs.weight ? `${bs.weight}g` : '', bs.hardness].filter(Boolean).join(' • ')}</Text>
                  </View>
                  {bs.isPrimary ? <View style={styles.pickerModalPrimaryBadge}><MaterialIcons name="star" size={10} color="#FFF" /></View> : null}
                  {selectedBoulesSetId === bs.id ? <MaterialIcons name="check-circle" size={20} color={theme.accent} /> : null}
                </Pressable>
              )}
              ListEmptyComponent={<View style={styles.pickerModalEmpty}><MaterialIcons name="sports-baseball" size={40} color={theme.textMuted} /><Text style={styles.pickerModalEmptyText}>{t('match', 'noBoulesSet')}</Text></View>}
            />
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    );
  }

  // ============================================
  // RENDER: Results Screen
  // ============================================

  if (isFinished) {
    const winner = challengeMode === '1v1' ? getWinner() : null;
    const isPrecision = selectedType === 'precision';
    const score = isPrecision ? playerStats.totalPrecisionPoints : playerStats.successRate;
    const opScore = isPrecision ? opponentStats.totalPrecisionPoints : opponentStats.successRate;
    const scoreColor = score >= 70 ? theme.success : score >= 50 ? theme.warning : theme.error;
    
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={() => router.back()}>
            <MaterialIcons name="close" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('challenge', 'results')}</Text>
          <View style={styles.headerBtn} />
        </View>

        {/* Sponsor branding banner on results */}
        {selectedSponsor ? (
          <View style={styles.sponsorResultBanner}>
            <View style={styles.sponsorResultBannerInner}>
              {selectedSponsor.photo ? (
                <Image source={{ uri: selectedSponsor.photo }} style={styles.sponsorResultPhoto} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.sponsorResultPhoto, { backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center' }]}>
                  <MaterialIcons name="campaign" size={18} color="#F59E0B" />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.sponsorResultLabel}>{t('challenge', 'sponsoredBy')}</Text>
                <Text style={styles.sponsorResultName}>{selectedSponsor.displayName}</Text>
              </View>
              <View style={styles.sponsoredResultBadge}>
                <MaterialIcons name="verified" size={12} color="#FFF" />
                <Text style={styles.sponsoredResultBadgeText}>{t('challenge', 'sponsoredBadge')}</Text>
              </View>
            </View>
          </View>
        ) : null}

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {challengeMode === '1v1' && (
            <Animated.View entering={FadeInDown.duration(400)} style={[
              styles.winnerBanner,
              winner === 'player' && styles.winnerBannerWin,
              winner === 'opponent' && styles.winnerBannerLoss,
              winner === 'draw' && styles.winnerBannerDraw,
            ]}>
              <MaterialIcons 
                name={winner === 'draw' ? 'handshake' : winner === 'player' ? 'emoji-events' : 'sentiment-dissatisfied'} 
                size={28} 
                color="#FFF" 
              />
              <Text style={styles.winnerBannerText}>
                {winner === 'draw' ? t('challenge', 'drawResult') : winner === 'player' ? t('challenge', 'victoryResult') : `${selectedOpponent?.name} ${t('challenge', 'winsResult')}`}
              </Text>
            </Animated.View>
          )}

          <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.resultCard}>
            {challengeMode === '1v1' && (
              <View style={styles.resultHeader}>
                <MaterialIcons name="person" size={18} color={theme.primary} />
                <Text style={styles.resultHeaderText}>{selfPlayer?.name || userStats.playerName}</Text>
                {winner === 'player' && <MaterialIcons name="emoji-events" size={18} color={theme.carreauColor} />}
              </View>
            )}
            
            <View style={[styles.resultBadge, { backgroundColor: scoreColor }]}>
              <Text style={styles.resultBadgeText}>
                {score >= 70 ? t('challenge', 'excellent') : score >= 50 ? t('challenge', 'well') : t('challenge', 'toImprove')}
              </Text>
            </View>

            <Text style={styles.resultScore}>{score}{isPrecision ? '' : '%'}</Text>
            <Text style={styles.resultLabel}>{isPrecision ? '/ 100 points' : t('challenge', 'successRate')}</Text>

            <View style={styles.resultGrid}>
              {!isPrecision && (
                <>
                  <View style={styles.resultGridItem}>
                    <MaterialIcons name="check-circle" size={22} color={theme.success} />
                    <Text style={styles.resultGridValue}>{playerStats.successCount}</Text>
                    <Text style={styles.resultGridLabel}>{t('challenge', 'succeeded')}</Text>
                  </View>
                  <View style={styles.resultGridItem}>
                    <MaterialIcons name="cancel" size={22} color={theme.error} />
                    <Text style={styles.resultGridValue}>{shots.length - playerStats.successCount}</Text>
                    <Text style={styles.resultGridLabel}>{t('challenge', 'missed')}</Text>
                  </View>
                </>
              )}
              <View style={styles.resultGridItem}>
                <MaterialIcons name="stars" size={22} color={theme.carreauColor} />
                <Text style={styles.resultGridValue}>
                  {isPrecision ? precisionShots.filter(s => s.points === 5).length : playerStats.carreauCount}
                </Text>
                <Text style={styles.resultGridLabel}>{t('history', 'carreaux')}</Text>
              </View>
              <View style={styles.resultGridItem}>
                <MaterialIcons name="timer" size={22} color={theme.primary} />
                <Text style={styles.resultGridValue}>{formatTime(elapsedTime)}</Text>
                <Text style={styles.resultGridLabel}>{t('history', 'duration')}</Text>
              </View>
            </View>
          </Animated.View>

          {challengeMode === '1v1' && selectedOpponent && (
            <Animated.View entering={FadeInDown.duration(400).delay(200)} style={styles.resultCard}>
              <View style={styles.resultHeader}>
                <MaterialIcons name="person" size={18} color={theme.accent} />
                <Text style={[styles.resultHeaderText, { color: theme.accent }]}>{selectedOpponent.name}</Text>
                {winner === 'opponent' && <MaterialIcons name="emoji-events" size={18} color={theme.carreauColor} />}
              </View>
              
              <Text style={styles.resultScore}>{opScore}{isPrecision ? '' : '%'}</Text>
              <Text style={styles.resultLabel}>{isPrecision ? '/ 100 points' : t('challenge', 'successRate')}</Text>
            </Animated.View>
          )}

          <View style={styles.resultActions}>
            <Pressable style={styles.retryBtn} onPress={resetChallenge}>
              <MaterialIcons name="refresh" size={20} color={theme.primary} />
              <Text style={styles.retryBtnText}>{t('challenge', 'retry')}</Text>
            </Pressable>
            <Pressable style={styles.saveBtn} onPress={saveChallenge}>
              <MaterialIcons name="save" size={20} color="#FFF" />
              <Text style={styles.saveBtnText}>{t('challenge', 'saveChallenge')}</Text>
            </Pressable>
          </View>

          <Pressable 
            style={styles.shareParticipantsBtn} 
            onPress={handleSaveAndShare}
            disabled={isSavingForShare}
          >
            {isSavingForShare ? (
              <Text style={styles.shareParticipantsBtnText}>{t('matchEdit', 'savingMatch')}</Text>
            ) : (
              <>
                <MaterialIcons name="share" size={20} color={theme.primary} />
                <Text style={styles.shareParticipantsBtnText}>{t('matchEdit', 'shareWithParticipants')}</Text>
              </>
            )}
          </Pressable>

          {savedChallengeIdForShare ? (
            <ShareModal
              visible={showPostChallengeShare}
              onClose={() => {
                setShowPostChallengeShare(false);
                router.back();
              }}
              itemType="challenge"
              itemId={savedChallengeIdForShare}
              itemName={`${config?.name || ''} - ${selfPlayer?.name || userStats.playerName}`}
              forceReadOnly
            />
          ) : null}

          {/* Cross-player Share Request Modal */}
          <ShareRequestModal
            visible={showShareRequestModal}
            onClose={() => {
              setShowShareRequestModal(false);
              // After share request, show the regular share modal if we have an ID
              if (savedChallengeIdForShare) {
                setTimeout(() => setShowPostChallengeShare(true), 300);
              } else {
                showInterstitial().finally(() => { router.back(); });
              }
            }}
            itemType="challenge"
            itemId={shareRequestItemId}
            playerIds={shareRequestPlayerIds}
            senderName={selfPlayer?.name || userStats.playerName}
            itemSummary={`${config?.name || ''} - ${challengeMode === '1v1' ? `vs ${selectedOpponent?.name}` : 'Solo'}`}
            language={language}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ============================================
  // RENDER: In Progress - Precision
  // ============================================

  if (selectedType === 'precision') {
    const sponsorBannerPrecision = selectedSponsor ? (
      <View style={styles.sponsorInProgressBanner}>
        {selectedSponsor.photo ? (
          <Image source={{ uri: selectedSponsor.photo }} style={styles.sponsorInProgressPhoto} contentFit="cover" />
        ) : (
          <View style={[styles.sponsorInProgressPhoto, { backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center' }]}>
            <MaterialIcons name="campaign" size={14} color="#F59E0B" />
          </View>
        )}
        <Text style={styles.sponsorInProgressText}>{t('challenge', 'sponsoredBy')} <Text style={{ fontWeight: '700' }}>{selectedSponsor.displayName}</Text></Text>
        <MaterialIcons name="verified" size={14} color="#F59E0B" />
      </View>
    ) : null;

    const isOpponentTurn = currentTurn === 'opponent';
    const displayAtelier = isOpponentTurn ? opponentAtelier : currentAtelier;
    const displayDistance = isOpponentTurn ? opponentDistance : currentDistance;
    const displayShotNumber = isOpponentTurn ? opponentPrecisionShotNumber : currentPrecisionShotNumber;
    const displayTotalPoints = isOpponentTurn ? opponentStats.totalPrecisionPoints : playerStats.totalPrecisionPoints;
    
    return (
      <SafeAreaView edges={['top']} style={styles.container}>
        {sponsorBannerPrecision}
        <View style={styles.header}>
          <Pressable style={styles.cancelHeaderBtn} onPress={cancelChallenge}>
            <Text style={styles.cancelHeaderBtnText}>{t('common', 'cancel')}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{t('challenge', 'precision')}</Text>
          <View style={styles.timerBadge}>
            <MaterialIcons name="timer" size={14} color={theme.primary} />
            <Text style={styles.timerText}>{formatTime(elapsedTime)}</Text>
          </View>
        </View>

        {challengeMode === '1v1' && (
          <View style={[styles.turnIndicator, isOpponentTurn && styles.turnIndicatorOpponent]}>
            <MaterialIcons name="person" size={16} color="#FFF" />
            <Text style={styles.turnIndicatorText}>
              {isOpponentTurn ? `${t('challenge', 'turnOf')} ${selectedOpponent?.name}` : t('challenge', 'yourTurn')}
            </Text>
          </View>
        )}

        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.gameContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.atelierInfoCard}>
            <View style={[styles.atelierInfoIcon, { backgroundColor: theme.primary + '15' }]}>
              <MaterialIcons name={displayAtelier.icon as any} size={24} color={theme.primary} />
            </View>
            <View style={styles.atelierInfoContent}>
              <Text style={styles.atelierInfoName}>{displayAtelier.name}</Text>
              <Text style={styles.atelierInfoDesc}>{displayAtelier.description}</Text>
            </View>
            <View style={styles.distanceBadge}>
              <Text style={styles.distanceBadgeText}>{displayDistance}m</Text>
            </View>
          </View>

          {/* Atelier Step Indicators */}
          <View style={styles.atelierStepsRow}>
            {TRANSLATED_ATELIERS.map((at, idx) => {
              const isCurrent = isOpponentTurn ? idx === opponentAtelierIndex : idx === currentAtelierIndex;
              const isDone = isOpponentTurn ? idx < opponentAtelierIndex : idx < currentAtelierIndex;
              return (
                <View key={at.id} style={[styles.atelierStep, isCurrent && styles.atelierStepCurrent, isDone && styles.atelierStepDone]}>
                  {isDone ? (
                    <MaterialIcons name="check" size={14} color="#FFF" />
                  ) : (
                    <Text style={[styles.atelierStepText, isCurrent && styles.atelierStepTextCurrent, isDone && styles.atelierStepTextDone]}>{idx + 1}</Text>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.progressInfo}>
            <Text style={styles.progressInfoText}>{t('challenge', 'shots').charAt(0).toUpperCase() + t('challenge', 'shots').slice(1)} {displayShotNumber} / 20</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressBarFill, { width: `${((displayShotNumber - 1) / 20) * 100}%` }]} />
            </View>
          </View>

          <CountdownTimer seconds={30} isRunning={shotTimerRunning} onStart={startShotTimer} onTimeUp={handleTimeUp} startLabel={t('challenge', 'start')} />

          <View style={styles.scoreCard}>
            <Text style={styles.scoreCardLabel}>
              {challengeMode === '1v1' ? (isOpponentTurn ? `${t('challenge', 'scoreOf')} ${selectedOpponent?.name}` : t('challenge', 'yourScore')) : t('match', 'score')}
            </Text>
            <View style={styles.scoreCardRing}>
              <Text style={styles.scoreCardValue}>{displayTotalPoints}</Text>
            </View>
            <Text style={styles.scoreCardMax}>/ 100 pts</Text>
          </View>

          {challengeMode === '1v1' && (
            <View style={styles.scoresCompare}>
              <View style={styles.scoreCompareSide}>
                <Text style={styles.scoreCompareName}>{t('challenge', 'youLabel')}</Text>
                <Text style={[styles.scoreCompareValue, !isOpponentTurn && styles.scoreCompareValueActive]}>
                  {playerStats.totalPrecisionPoints}
                </Text>
              </View>
              <Text style={styles.scoreCompareSep}>-</Text>
              <View style={styles.scoreCompareSide}>
                <Text style={styles.scoreCompareName}>{selectedOpponent?.name?.split(' ')[0]}</Text>
                <Text style={[styles.scoreCompareValue, isOpponentTurn && styles.scoreCompareValueActive]}>
                  {opponentStats.totalPrecisionPoints}
                </Text>
              </View>
            </View>
          )}

          {/* Scoring Options */}
          <View style={styles.scoringSection}>
            <Text style={styles.scoringSectionTitle}>{t('challenge', 'shotResult')}</Text>
            {displayAtelier.scoringOptions.map((option, index) => {
              const colors: Record<number, string> = { 0: theme.error, 1: theme.warning, 3: theme.success, 5: theme.carreauColor };
              const icons: Record<number, string> = { 0: 'close', 1: 'radio-button-checked', 3: 'check-circle', 5: 'stars' };
              return (
                <Pressable 
                  key={index}
                  style={({ pressed }) => [styles.scoringOptionCard, { borderLeftColor: colors[option.points] }, pressed && styles.scoringOptionCardPressed]}
                  onPress={() => recordPrecisionShot(option.points, isOpponentTurn)}
                >
                  <View style={[styles.scoringOptionBadge, { backgroundColor: colors[option.points] }]}>
                    <Text style={styles.scoringOptionPts}>{option.points}</Text>
                    <Text style={styles.scoringOptionPtsUnit}>pts</Text>
                  </View>
                  <View style={styles.scoringOptionContent}>
                    <View style={styles.scoringOptionHeader}>
                      <MaterialIcons name={icons[option.points] as any} size={16} color={colors[option.points]} />
                      <Text style={[styles.scoringOptionLabel, { color: colors[option.points] }]}>{option.label}</Text>
                    </View>
                    <Text style={styles.scoringOptionDesc}>{option.description}</Text>
                  </View>
                  <View style={[styles.scoringOptionTap, { backgroundColor: colors[option.points] + '12' }]}>
                    <MaterialIcons name="touch-app" size={20} color={colors[option.points]} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ============================================
  // RENDER: In Progress - Standard (10 tirs)
  // ============================================

  const sponsorBannerStandard = selectedSponsor ? (
    <View style={styles.sponsorInProgressBanner}>
      {selectedSponsor.photo ? (
        <Image source={{ uri: selectedSponsor.photo }} style={styles.sponsorInProgressPhoto} contentFit="cover" />
      ) : (
        <View style={[styles.sponsorInProgressPhoto, { backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center' }]}>
          <MaterialIcons name="campaign" size={14} color="#F59E0B" />
        </View>
      )}
      <Text style={styles.sponsorInProgressText}>{t('challenge', 'sponsoredBy')} <Text style={{ fontWeight: '700' }}>{selectedSponsor.displayName}</Text></Text>
      <MaterialIcons name="verified" size={14} color="#F59E0B" />
    </View>
  ) : null;

  const isOpponentTurn = currentTurn === 'opponent';
  const displayCurrentShot = isOpponentTurn ? opponentCurrentShot : currentShot;
  const displayShots = isOpponentTurn ? opponentShots : shots;
  const displayStats = isOpponentTurn ? opponentStats : playerStats;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {sponsorBannerStandard}
      <View style={styles.header}>
        <Pressable style={styles.cancelHeaderBtn} onPress={cancelChallenge}>
          <Text style={styles.cancelHeaderBtnText}>{t('common', 'cancel')}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{config?.name}</Text>
        <View style={styles.timerBadge}>
          <MaterialIcons name="timer" size={14} color={theme.primary} />
          <Text style={styles.timerText}>{formatTime(elapsedTime)}</Text>
        </View>
      </View>

      {challengeMode === '1v1' && (
        <View style={[styles.turnIndicator, isOpponentTurn && styles.turnIndicatorOpponent]}>
          <MaterialIcons name="person" size={16} color="#FFF" />
          <Text style={styles.turnIndicatorText}>
            {isOpponentTurn ? `${t('challenge', 'turnOf')} ${selectedOpponent?.name}` : t('challenge', 'yourTurn')}
          </Text>
        </View>
      )}

      <View style={styles.progressSection}>
        <View style={styles.progressBar}>
          <Animated.View style={[styles.progressBarFill, { width: `${(displayCurrentShot / (config?.totalShots || 10)) * 100}%`, backgroundColor: config?.color }]} />
        </View>
        <Text style={styles.progressText}>{t('challenge', 'shots').charAt(0).toUpperCase() + t('challenge', 'shots').slice(1)} {displayCurrentShot} / {config?.totalShots}</Text>
      </View>

      <View style={styles.shotsIndicator}>
        {Array.from({ length: config?.totalShots || 10 }).map((_, index) => {
          const shot = displayShots[index];
          const isCurrent = index === displayCurrentShot - 1 && displayShots.length < (config?.totalShots || 10);
          return (
            <View
              key={index}
              style={[
                styles.shotDot,
                shot?.success && { backgroundColor: shot.carreau ? theme.carreauColor : theme.success, borderColor: shot.carreau ? theme.carreauColor : theme.success },
                shot && !shot.success && { backgroundColor: theme.error, borderColor: theme.error },
                isCurrent && { backgroundColor: config?.color + '25', borderColor: config?.color, borderWidth: 2.5 },
              ]}
            >
              {shot?.carreau ? <MaterialIcons name="star" size={12} color="#FFF" /> : shot?.success ? <MaterialIcons name="check" size={12} color="#FFF" /> : shot && !shot.success ? <MaterialIcons name="close" size={12} color="#FFF" /> : isCurrent ? <Text style={[styles.shotDotNum, { color: config?.color }]}>{index + 1}</Text> : <Text style={styles.shotDotNum}>{index + 1}</Text>}
            </View>
          );
        })}
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <View style={[styles.statIconCircle, { backgroundColor: theme.success + '18' }]}>
            <MaterialIcons name="check-circle" size={20} color={theme.success} />
          </View>
          <Text style={[styles.statValue, { color: theme.success }]}>{displayStats.successCount}</Text>
          <Text style={styles.statLabel}>{t('challenge', 'succeeded')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <View style={[styles.statIconCircle, { backgroundColor: theme.error + '18' }]}>
            <MaterialIcons name="cancel" size={20} color={theme.error} />
          </View>
          <Text style={[styles.statValue, { color: theme.error }]}>{displayShots.length - displayStats.successCount}</Text>
          <Text style={styles.statLabel}>{t('challenge', 'missed')}</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <View style={[styles.statIconCircle, { backgroundColor: theme.carreauColor + '18' }]}>
            <MaterialIcons name="stars" size={20} color={theme.carreauColor} />
          </View>
          <Text style={[styles.statValue, { color: theme.carreauColor }]}>{displayStats.carreauCount}</Text>
          <Text style={styles.statLabel}>{t('history', 'carreaux')}</Text>
        </View>
      </View>

      {challengeMode === '1v1' && (
        <View style={styles.scoresCompare}>
          <View style={styles.scoreCompareSide}>
            <Text style={styles.scoreCompareName}>{t('challenge', 'youLabel')}</Text>
            <Text style={[styles.scoreCompareValue, !isOpponentTurn && styles.scoreCompareValueActive]}>
              {playerStats.successCount}/{shots.length}
            </Text>
          </View>
          <Text style={styles.scoreCompareSep}>vs</Text>
          <View style={styles.scoreCompareSide}>
            <Text style={styles.scoreCompareName}>{selectedOpponent?.name?.split(' ')[0]}</Text>
            <Text style={[styles.scoreCompareValue, isOpponentTurn && styles.scoreCompareValueActive]}>
              {opponentStats.successCount}/{opponentShots.length}
            </Text>
          </View>
        </View>
      )}

      <View style={styles.shotButtonsContainer}>
        <Text style={styles.shotButtonsTitle}>
          {challengeMode === '1v1' ? (isOpponentTurn ? `${t('challenge', 'turnOf')} ${selectedOpponent?.name}` : t('challenge', 'yourTurn')) : t('challenge', 'shotResult')}
        </Text>
        
        <View style={styles.quickBtnsGrid}>
          <Pressable style={[styles.quickBtnLarge, { backgroundColor: theme.error }]} onPress={() => recordShot(false, false, isOpponentTurn)}>
            <MaterialIcons name="close" size={32} color="#FFF" />
            <Text style={styles.quickBtnLargeText}>{t('challenge', 'missedBtn')}</Text>
          </Pressable>
          <Pressable style={[styles.quickBtnLarge, { backgroundColor: theme.success }]} onPress={() => recordShot(true, false, isOpponentTurn)}>
            <MaterialIcons name="check" size={32} color="#FFF" />
            <Text style={styles.quickBtnLargeText}>{t('challenge', 'succeededBtn')}</Text>
          </Pressable>
          <Pressable style={[styles.quickBtnLarge, styles.quickBtnCarreau]} onPress={() => recordShot(true, true, isOpponentTurn)}>
            <MaterialIcons name="stars" size={32} color="#FFF" />
            <Text style={styles.quickBtnLargeText}>{t('challenge', 'carreauBtn')}</Text>
          </Pressable>
          <Pressable style={[styles.quickBtnLarge, styles.quickBtnNotation]} onPress={() => openNotationModal(isOpponentTurn)}>
            <MaterialIcons name="gps-fixed" size={32} color={theme.tirColor} />
            <Text style={[styles.quickBtnLargeText, { color: theme.tirColor }]}>{t('challenge', 'detailedNotation')}</Text>
          </Pressable>
        </View>
      </View>

      <SimplifiedShotNotation
        visible={showNotation}
        onClose={() => { setShowNotation(false); setPendingNotationIsOpponent(false); }}
        actionType="tir"
        playerId={pendingNotationIsOpponent ? (selectedOpponent?.id || '') : (selfPlayer?.id || userStats.playerId)}
        playerName={pendingNotationIsOpponent ? (selectedOpponent?.name || t('challenge', 'opponentLabel')) : (selfPlayer?.name || userStats.playerName)}
        team={pendingNotationIsOpponent ? 'B' : 'A'}
        onSubmit={handleNotationSubmit}
      />
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  
  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  cancelHeaderBtn: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: theme.error + '15', borderRadius: 10 },
  cancelHeaderBtnText: { fontSize: 14, fontWeight: '600', color: theme.error },
  timerBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.primary + '15', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20 },
  timerText: { fontSize: 14, fontWeight: '600', color: theme.primary, fontVariant: ['tabular-nums'] },
  
  // Scroll
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20, maxWidth: 700, alignSelf: 'center' as const, width: '100%' },
  
  // Hero Section (Type Selection)
  heroSection: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 8 },
  heroIcon: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.carreauColor + '18', alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 2, borderColor: theme.carreauColor + '25' },
  heroTitle: { fontSize: 26, fontWeight: '800', color: theme.textPrimary, marginBottom: 6, letterSpacing: -0.5 },
  heroSubtitle: { fontSize: 15, color: theme.textSecondary, textAlign: 'center' },
  
  // Challenge Card
  challengeCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 20, padding: 18, marginBottom: 14, borderLeftWidth: 0, borderWidth: 1.5, borderColor: theme.border, ...theme.shadows.cardElevated },
  challengeCardTablet: { padding: 24 },
  challengeCardIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  challengeCardIconTablet: { width: 72, height: 72, borderRadius: 22 },
  challengeCardContent: { flex: 1 },
  challengeCardTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary, marginBottom: 3 },
  challengeCardDesc: { fontSize: 13, color: theme.textSecondary, marginBottom: 10, lineHeight: 18 },
  challengeCardMeta: { flexDirection: 'row' },
  metaBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  metaBadgeText: { fontSize: 11, fontWeight: '700' },
  
  // Mode Selection
  modeContent: { paddingHorizontal: 16, paddingTop: 32, paddingBottom: 40, flexGrow: 1, justifyContent: 'center', maxWidth: 600, alignSelf: 'center' as const, width: '100%' },
  modeHeader: { alignItems: 'center', marginBottom: 36 },
  modeHeaderIcon: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)' },
  modeHeaderTitle: { fontSize: 24, fontWeight: '800', color: theme.textPrimary, letterSpacing: -0.5 },
  modeGrid: { flexDirection: 'row', gap: 14 },
  modeGridTablet: { gap: 24, paddingHorizontal: 20 },
  modeCardWrapper: { flex: 1 },
  modeCard: { flex: 1, backgroundColor: theme.surface, borderRadius: 24, padding: 24, alignItems: 'center', ...theme.shadows.cardElevated, borderWidth: 1.5, borderColor: theme.border },
  modeCardTablet: { padding: 36, borderRadius: 28 },
  modeCardIconBg: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  modeCardTitle: { fontSize: 18, fontWeight: '800', color: theme.textPrimary, marginBottom: 6 },
  modeCardDesc: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 18, flex: 1 },
  modeCardBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14, width: '100%', alignItems: 'center' },
  modeCardBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  
  // Opponent Selection
  opponentSearchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface,
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: 14, gap: 10, borderWidth: 1, borderColor: theme.border,
  },
  opponentSearchInput: { flex: 1, fontSize: 16, color: theme.textPrimary, padding: 0 },
  opponentBanner: { backgroundColor: theme.accent, paddingVertical: 20, alignItems: 'center', borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  opponentBannerPlayers: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  opponentBannerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  opponentBannerAvatarEmpty: { backgroundColor: theme.surface, borderWidth: 2, borderStyle: 'dashed', borderColor: theme.accent },
  opponentBannerVs: { backgroundColor: theme.warning, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  opponentBannerVsText: { fontSize: 11, fontWeight: '900', color: '#FFF', letterSpacing: 1 },
  opponentBannerTitle: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  opponentCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 16, padding: 14, marginBottom: 10, ...theme.shadows.card, borderWidth: 1, borderColor: theme.border },
  opponentAvatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: theme.accent, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  opponentAvatarText: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  opponentInfo: { flex: 1 },
  opponentNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  opponentName: { fontSize: 16, fontWeight: '600', color: theme.textPrimary },
  opponentMeta: { fontSize: 12, color: theme.textMuted },
  confrontationBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.accent + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  confrontationBadgeText: { fontSize: 11, fontWeight: '700', color: theme.accent },
  opponentBtn: { backgroundColor: theme.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  opponentBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyStateText: { fontSize: 15, color: theme.textMuted, marginTop: 12 },
  emptyStateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.primary + '15', borderRadius: 12 },
  emptyStateBtnText: { fontSize: 14, fontWeight: '600', color: theme.primary },
  
  // Ready Screen
  readyContent: { paddingHorizontal: 16, paddingTop: 32, alignItems: 'center', maxWidth: 600, alignSelf: 'center' as const, width: '100%' },
  readyHero: { alignItems: 'center', marginBottom: 32 },
  readyHeroIcon: { width: 110, height: 110, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 20, borderWidth: 2.5, borderColor: 'rgba(0,0,0,0.05)' },
  readyHeroTitle: { fontSize: 28, fontWeight: '800', color: theme.textPrimary, marginBottom: 8, letterSpacing: -0.5 },
  readyHeroDesc: { fontSize: 15, color: theme.textSecondary, textAlign: 'center', lineHeight: 22 },
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.primary + '12', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, marginTop: 18, borderWidth: 1.5, borderColor: theme.primary + '25' },
  modeBadge1v1: { backgroundColor: theme.accent + '12', borderColor: theme.accent + '25' },
  modeBadgeText: { fontSize: 14, fontWeight: '700', color: theme.primary },
  modeBadgeText1v1: { color: theme.accent },
  readySection: { width: '100%', marginTop: 24 },
  readySectionTitle: { fontSize: 12, fontWeight: '700', color: theme.textMuted, letterSpacing: 1.5, marginBottom: 12, textTransform: 'uppercase', textAlign: 'center' },
  atelierCard: { alignItems: 'center', backgroundColor: theme.surface, borderRadius: 16, padding: 18, marginBottom: 10, ...theme.shadows.card, borderWidth: 1, borderColor: theme.border },
  atelierIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  atelierInfo: { flex: 1 },
  atelierName: { fontSize: 14, fontWeight: '700', color: theme.textPrimary, textAlign: 'center' },
  atelierDesc: { fontSize: 11, color: theme.textSecondary, marginTop: 2, textAlign: 'center', lineHeight: 16 },
  atelierDist: { fontSize: 12, fontWeight: '700', color: theme.primary, backgroundColor: theme.primary + '12', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, marginTop: 10 },
  readyInfoCard: { width: '100%', backgroundColor: theme.surface, borderRadius: 20, padding: 20, gap: 14, alignItems: 'center', ...theme.shadows.card, borderWidth: 1, borderColor: theme.border },
  readyInfoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14 },
  readyInfoText: { fontSize: 14, color: theme.textSecondary },
  bottomAction: { paddingHorizontal: 16, paddingTop: 14, backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border },
  startBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 18, borderRadius: 18, ...theme.shadows.cardElevated },
  startBtnText: { fontSize: 18, fontWeight: '700', color: '#FFF' },
  
  // Results
  winnerBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, paddingVertical: 18, borderRadius: 20, marginBottom: 18 },
  winnerBannerWin: { backgroundColor: theme.success },
  winnerBannerLoss: { backgroundColor: theme.error },
  winnerBannerDraw: { backgroundColor: theme.warning },
  winnerBannerText: { fontSize: 20, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  resultCard: { backgroundColor: theme.surface, borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 14, ...theme.shadows.cardElevated, borderWidth: 1, borderColor: theme.border },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border, width: '100%', justifyContent: 'center' },
  resultHeaderText: { fontSize: 16, fontWeight: '700', color: theme.primary },
  resultBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 24, marginBottom: 16 },
  resultBadgeText: { fontSize: 13, fontWeight: '700', color: '#FFF', letterSpacing: 0.5 },
  resultScore: { fontSize: 72, fontWeight: '900', color: theme.textPrimary, letterSpacing: -3 },
  resultLabel: { fontSize: 14, color: theme.textMuted, marginBottom: 24 },
  resultGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  resultGridItem: { width: '50%', alignItems: 'center', paddingVertical: 14 },
  resultGridValue: { fontSize: 28, fontWeight: '900', color: theme.textPrimary, marginTop: 8 },
  resultGridLabel: { fontSize: 12, color: theme.textSecondary, marginTop: 3 },
  resultActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  retryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.surface, paddingVertical: 16, borderRadius: 16, borderWidth: 2, borderColor: theme.primary },
  retryBtnText: { fontSize: 15, fontWeight: '700', color: theme.primary },
  saveBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary, paddingVertical: 16, borderRadius: 16 },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  shareParticipantsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14, paddingVertical: 16, borderRadius: 16, backgroundColor: theme.primary + '10', borderWidth: 1.5, borderColor: theme.primary + '30' },
  shareParticipantsBtnText: { fontSize: 15, fontWeight: '700', color: theme.primary },
  
  // In Progress
  turnIndicator: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary, paddingVertical: 12, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  turnIndicatorOpponent: { backgroundColor: theme.accent },
  turnIndicatorText: { fontSize: 14, fontWeight: '700', color: '#FFF', letterSpacing: 0.3 },
  progressSection: { paddingHorizontal: 16, paddingVertical: 16 },
  progressBar: { height: 8, backgroundColor: theme.border, borderRadius: 4, overflow: 'hidden', marginBottom: 10 },
  progressBarFill: { height: '100%', backgroundColor: theme.primary, borderRadius: 4 },
  progressText: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, textAlign: 'center' },
  shotsIndicator: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingHorizontal: 12, marginBottom: 20 },
  shotDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.border + '60', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  shotDotNum: { fontSize: 10, fontWeight: '700', color: theme.textMuted },
  statsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: theme.surface, marginHorizontal: 16, paddingVertical: 18, borderRadius: 22, ...theme.shadows.cardElevated, borderWidth: 1, borderColor: theme.border },
  statItem: { flex: 1, alignItems: 'center' },
  statIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  statValue: { fontSize: 30, fontWeight: '900' },
  statLabel: { fontSize: 10, color: theme.textSecondary, marginTop: 3, fontWeight: '600', letterSpacing: 0.3 },
  statDivider: { width: 1, height: 56, backgroundColor: theme.border },
  scoresCompare: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface, marginHorizontal: 16, marginTop: 14, paddingVertical: 16, borderRadius: 18, ...theme.shadows.card, borderWidth: 1, borderColor: theme.border },
  scoreCompareSide: { flex: 1, alignItems: 'center' },
  scoreCompareName: { fontSize: 11, color: theme.textSecondary, marginBottom: 4, fontWeight: '600' },
  scoreCompareValue: { fontSize: 22, fontWeight: '800', color: theme.textMuted },
  scoreCompareValueActive: { color: theme.primary },
  scoreCompareSep: { fontSize: 14, fontWeight: '800', color: theme.textMuted, paddingHorizontal: 10 },
  shotButtonsContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 20, alignItems: 'center', maxWidth: 600, alignSelf: 'center' as const, width: '100%' },
  shotButtonsTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginBottom: 16 },
  quickBtnsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%' },
  quickBtnLarge: { flex: 1, minWidth: '22%' as const, alignItems: 'center', justifyContent: 'center', paddingVertical: 22, paddingHorizontal: 6, borderRadius: 20, ...theme.shadows.cardElevated },
  quickBtnCarreau: { backgroundColor: theme.carreauColor },
  quickBtnNotation: { backgroundColor: theme.surface, borderWidth: 2, borderColor: theme.tirColor + '40' },
  quickBtnLargeText: { fontSize: 13, fontWeight: '800', color: '#FFF', marginTop: 6, letterSpacing: 0.3, textAlign: 'center', width: '100%' },
  
  // Precision In Progress
  gameContent: { paddingHorizontal: 16, paddingTop: 16, maxWidth: 600, alignSelf: 'center' as const, width: '100%' },
  atelierInfoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 22, padding: 18, marginBottom: 16, ...theme.shadows.cardElevated, borderWidth: 1.5, borderColor: theme.primary + '20' },
  atelierInfoIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  atelierInfoContent: { flex: 1 },
  atelierInfoName: { fontSize: 18, fontWeight: '800', color: theme.textPrimary, letterSpacing: -0.3 },
  atelierInfoDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 4, lineHeight: 16 },
  distanceBadge: { backgroundColor: theme.primary, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16 },
  distanceBadgeText: { fontSize: 18, fontWeight: '900', color: '#FFF' },
  progressInfo: { marginBottom: 16 },
  progressInfoText: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, textAlign: 'center', marginBottom: 10 },
  countdownContainer: { alignItems: 'center', marginBottom: 20 },
  countdownOuter: { width: 116, height: 116, borderRadius: 58, borderWidth: 3, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  countdownCircle: { width: 96, height: 96, borderRadius: 48, borderWidth: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface, ...theme.shadows.card },
  countdownText: { fontSize: 40, fontWeight: '900' },
  countdownLabel: { fontSize: 10, color: theme.textMuted, marginTop: -2, fontWeight: '600', letterSpacing: 1 },
  countdownBar: { width: '100%', height: 5, backgroundColor: theme.border, borderRadius: 2.5, overflow: 'hidden' },
  countdownBarFill: { height: '100%', borderRadius: 2.5 },
  startTimerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.success, paddingVertical: 16, paddingHorizontal: 32, borderRadius: 20, marginTop: 14, ...theme.shadows.cardElevated },
  startTimerButtonText: { fontSize: 17, fontWeight: '800', color: '#FFF' },
  scoreCard: { backgroundColor: theme.surface, borderRadius: 24, padding: 24, alignItems: 'center', marginBottom: 16, ...theme.shadows.cardElevated, borderWidth: 1, borderColor: theme.border },
  scoreCardLabel: { fontSize: 11, color: theme.textSecondary, marginBottom: 10, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  scoreCardRing: { width: 100, height: 100, borderRadius: 50, borderWidth: 4, borderColor: theme.primary + '30', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  scoreCardValue: { fontSize: 42, fontWeight: '900', color: theme.primary, letterSpacing: -1 },
  scoreCardMax: { fontSize: 13, color: theme.textMuted, marginTop: 4, fontWeight: '600' },
  // Precision scoring - vertical cards
  scoringSection: { marginTop: 24, marginBottom: 8 },
  scoringSectionTitle: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, textAlign: 'center', marginBottom: 14, letterSpacing: 0.5, textTransform: 'uppercase' as const },
  scoringOptionCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 18, padding: 14, marginBottom: 10, ...theme.shadows.card, borderWidth: 1, borderColor: theme.border, borderLeftWidth: 5, gap: 12 },
  scoringOptionCardPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  scoringOptionBadge: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  scoringOptionPts: { fontSize: 22, fontWeight: '900', color: '#FFF', lineHeight: 24 },
  scoringOptionPtsUnit: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.8)', letterSpacing: 0.5, marginTop: -2 },
  scoringOptionContent: { flex: 1 },
  scoringOptionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  scoringOptionLabel: { fontSize: 15, fontWeight: '700' },
  scoringOptionDesc: { fontSize: 12, color: theme.textSecondary, lineHeight: 17 },
  scoringOptionTap: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  // Atelier step indicators
  atelierStepsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, paddingHorizontal: 16, marginBottom: 14 },
  atelierStep: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.border + '80', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  atelierStepCurrent: { backgroundColor: theme.primary + '20', borderColor: theme.primary },
  atelierStepDone: { backgroundColor: theme.success, borderColor: theme.success },
  atelierStepText: { fontSize: 12, fontWeight: '700', color: theme.textMuted },
  atelierStepTextCurrent: { color: theme.primary },
  atelierStepTextDone: { color: '#FFF' },
  // Ready screen picker buttons
  readyPickersSection: { width: '100%', marginTop: 4, marginBottom: 8, gap: 10 },
  readyPickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderRadius: 16, padding: 14, gap: 12, ...theme.shadows.card, borderWidth: 1, borderColor: theme.border },
  readyPickerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  readyPickerContent: { flex: 1 },
  readyPickerLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, letterSpacing: 0.3, marginBottom: 2 },
  readyPickerValue: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  readyPickerPlaceholder: { color: theme.textMuted, fontStyle: 'italic', fontWeight: '400' },
  // Picker modal styles
  pickerModalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  pickerModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  pickerModalCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pickerModalTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  pickerModalSearch: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, marginHorizontal: 16, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, gap: 10, borderWidth: 1, borderColor: theme.border },
  pickerModalSearchInput: { flex: 1, fontSize: 15, color: theme.textPrimary, padding: 0 },
  pickerModalItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: theme.surface, borderRadius: 12, marginHorizontal: 16, marginBottom: 8, ...theme.shadows.card },
  pickerModalItemActive: { borderWidth: 2, borderColor: theme.primary },
  pickerModalItemIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pickerModalItemName: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  pickerModalItemSub: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
  pickerModalEmpty: { alignItems: 'center', paddingVertical: 40 },
  pickerModalEmptyText: { fontSize: 14, color: theme.textMuted, marginTop: 10 },
  pickerModalPrimaryBadge: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.carreauColor, alignItems: 'center', justifyContent: 'center', marginRight: 4 },
  // Sponsor styles
  sponsoredBadgeSmall: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginRight: 6 },
  sponsoredBadgeSmallText: { fontSize: 8, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
  sponsorPickerAvatar: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#F59E0B10', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' as const },
  sponsorPickerBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#F59E0B15', alignItems: 'center', justifyContent: 'center', marginRight: 6 },

  sponsorInProgressBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FEF3C7', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#FDE68A' },
  sponsorInProgressPhoto: { width: 28, height: 28, borderRadius: 8, overflow: 'hidden' as const },
  sponsorInProgressText: { flex: 1, fontSize: 12, color: '#92400E', fontWeight: '500' },
  sponsorResultBanner: { marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
  sponsorResultBannerInner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFBEB', borderRadius: 16, padding: 14, borderWidth: 1.5, borderColor: '#FDE68A' },
  sponsorResultPhoto: { width: 40, height: 40, borderRadius: 12, overflow: 'hidden' as const },
  sponsorResultLabel: { fontSize: 10, color: '#92400E', fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase' as const },
  sponsorResultName: { fontSize: 15, fontWeight: '700', color: '#78350F', marginTop: 1 },
  sponsoredResultBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F59E0B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  sponsoredResultBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF', letterSpacing: 0.5 },
});
