import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { 
  FadeIn, 
  FadeInDown, 
  FadeOut,
  ZoomIn,
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';

const { width: screenWidth } = Dimensions.get('window');

// ============================================
// TYPES & DEFINITIONS
// ============================================

// Shot Type - Including carreau and various miss types
export type SimpleShotType = 
  | 'au_fer'          // Direct hit
  | 'au_plomb'        // High arc
  | 'en_rafle'        // Rolling shot
  | 'court_ramasse'   // Short, picked up (success)
  | 'carreau'         // Carreau - ball takes place
  | 'court_droite'    // Short, to the right (miss)
  | 'court_gauche'    // Short, to the left (miss)
  | 'long'            // Long, behind target (miss)
  | 'tir_bouchon'     // Hit the jack (miss)
  | 'autre';          // Other

// Shot Quality - Contextual
export type SimpleShotQuality = 
  | 'gain_point'      // Gained point(s)
  | 'sans_effet'      // No change
  | 'negatif'         // Lost position
  | 'decisif';        // End of mène

// Point Type - Simplified (no "autre")
export type SimplePointType = 
  | 'roule'           // Rolled
  | 'plombe'          // Lobbed
  | 'demi_portee'     // Half lob
  | 'portee';         // High lob

// Point Quality - Distance based for success, specific for failure
export type SimplePointQuality = 
  | 'excellent'       // < 10cm
  | 'bon'             // < 30cm
  | 'moyen'           // < 50cm
  | 'au_bouchon'      // At the jack
  | 'devant_boule'    // In front of opponent's ball
  | 'rate'            // Missed target zone
  | 'crochete'        // Bad hand release
  | 'sorti';          // Out of bounds

// Shot Result Types (for failed tir - describes WHERE the shot went wrong)
export type SimpleShotResult = 
  | 'court_droite'    // Short, to the right
  | 'court_gauche'    // Short, to the left
  | 'long'            // Long, behind target
  | 'tir_bouchon';    // Hit the jack

// Complete Shot Record
export interface SimpleShotRecord {
  id: string;
  timestamp: string;
  playerId: string;
  playerName?: string;
  team: 'A' | 'B';
  
  // Basic result
  actionType: 'tir' | 'point';
  success: boolean;
  carreau?: boolean;
  
  // Advanced - Tir
  shotResult?: SimpleShotResult;
  shotType?: SimpleShotType;
  shotQuality?: SimpleShotQuality;
  
  // Advanced - Point
  pointType?: SimplePointType;
  pointQuality?: SimplePointQuality;
}

// ============================================
// CONFIG ARRAYS WITH TRANSLATION KEYS
// ============================================

const SHOT_TYPES_SUCCESS_CONFIG = [
  { id: 'au_fer' as SimpleShotType, labelKey: 'tirTendu', icon: 'gps-fixed', descKey: 'tirTenduDesc' },
  { id: 'au_plomb' as SimpleShotType, labelKey: 'tirCloche', icon: 'flight-takeoff', descKey: 'tirClocheDesc' },
  { id: 'en_rafle' as SimpleShotType, labelKey: 'enRafleSimple', icon: 'swap-horiz', descKey: 'enRafleSimpleDesc' },
  { id: 'court_ramasse' as SimpleShotType, labelKey: 'courtRamasse', icon: 'redo', descKey: 'courtRamasseDesc' },
  { id: 'carreau' as SimpleShotType, labelKey: 'carreauLabel', icon: 'stars', descKey: 'carreauTakesPlaceShort', special: true },
];

const SHOT_TYPES_FAILED_CONFIG = [
  { id: 'au_fer' as SimpleShotType, labelKey: 'tirTendu', icon: 'gps-fixed', descKey: 'tirTenduDesc' },
  { id: 'au_plomb' as SimpleShotType, labelKey: 'tirCloche', icon: 'flight-takeoff', descKey: 'tirClocheDesc' },
  { id: 'en_rafle' as SimpleShotType, labelKey: 'enRafleSimple', icon: 'swap-horiz', descKey: 'enRafleSimpleDesc' },
];

const SHOT_RESULTS_FAILED_CONFIG: { id: SimpleShotResult; labelKey: string; icon: string; descKey: string; color: string }[] = [
  { id: 'court_droite', labelKey: 'courtDroite', icon: 'subdirectory-arrow-right', descKey: 'courtDroiteDesc', color: '#E57373' },
  { id: 'court_gauche', labelKey: 'courtGauche', icon: 'subdirectory-arrow-left', descKey: 'courtGaucheDesc', color: '#EF5350' },
  { id: 'long', labelKey: 'longResult', icon: 'arrow-upward', descKey: 'longResultDesc', color: '#F44336' },
  { id: 'tir_bouchon', labelKey: 'tirBouchon', icon: 'adjust', descKey: 'tirBouchonDesc', color: theme.warning },
];

const SHOT_QUALITIES_CONFIG = [
  { id: 'gain_point' as SimpleShotQuality, labelKey: 'gainPoint', icon: 'trending-up', color: theme.success },
  { id: 'sans_effet' as SimpleShotQuality, labelKey: 'noEffect', icon: 'remove', color: theme.warning },
  { id: 'negatif' as SimpleShotQuality, labelKey: 'negative', icon: 'trending-down', color: theme.error },
  { id: 'decisif' as SimpleShotQuality, labelKey: 'decisive', icon: 'flag', color: theme.carreauColor },
];

const CARREAU_QUALITIES_CONFIG = [
  { id: 'gain_point' as SimpleShotQuality, labelKey: 'gainPoint', icon: 'trending-up', color: theme.success },
];

const POINT_TYPES_CONFIG = [
  { id: 'roule' as SimplePointType, labelKey: 'rouleSimple', icon: 'sports-baseball', descKey: 'rouleSimpleDesc' },
  { id: 'plombe' as SimplePointType, labelKey: 'plombeSimple', icon: 'flight-land', descKey: 'plombeSimpleDesc' },
  { id: 'demi_portee' as SimplePointType, labelKey: 'demiPorteeSimple', icon: 'height', descKey: 'demiPorteeSimpleDesc' },
  { id: 'portee' as SimplePointType, labelKey: 'portee', icon: 'flight', descKey: 'porteeDesc' },
];

const POINT_QUALITIES_SUCCESS_CONFIG = [
  { id: 'excellent' as SimplePointQuality, labelKey: 'excellent', icon: 'stars', color: theme.carreauColor, descKey: 'excellentDesc' },
  { id: 'bon' as SimplePointQuality, labelKey: 'bon', icon: 'check-circle', color: theme.success, descKey: 'bonDesc' },
  { id: 'moyen' as SimplePointQuality, labelKey: 'moyen', icon: 'radio-button-checked', color: theme.warning, descKey: 'moyenDesc' },
  { id: 'au_bouchon' as SimplePointQuality, labelKey: 'auBouchon', icon: 'adjust', color: theme.primary, descKey: 'auBouchonDesc' },
  { id: 'devant_boule' as SimplePointQuality, labelKey: 'devantBoule', icon: 'sports-baseball', color: theme.accent, descKey: 'devantBouleDesc' },
];

const POINT_QUALITIES_FAILED_CONFIG = [
  { id: 'rate' as SimplePointQuality, labelKey: 'rate', icon: 'cancel', color: theme.error, descKey: 'rateDesc' },
  { id: 'crochete' as SimplePointQuality, labelKey: 'crochete', icon: 'sync-problem', color: theme.warning, descKey: 'crocheteDesc' },
  { id: 'sorti' as SimplePointQuality, labelKey: 'sorti', icon: 'logout', color: theme.error, descKey: 'sortiDesc' },
];

// Backward-compatible exports
const SHOT_TYPES_SUCCESS = SHOT_TYPES_SUCCESS_CONFIG.map(s => ({ ...s, label: s.labelKey, desc: s.descKey }));
const SHOT_TYPES_FAILED = SHOT_TYPES_FAILED_CONFIG.map(s => ({ ...s, label: s.labelKey, desc: s.descKey }));
const SHOT_RESULTS_FAILED = SHOT_RESULTS_FAILED_CONFIG.map(s => ({ ...s, label: s.labelKey, desc: s.descKey }));
const SHOT_TYPES = SHOT_TYPES_SUCCESS;
const SHOT_QUALITIES = SHOT_QUALITIES_CONFIG.map(s => ({ ...s, label: s.labelKey }));
const POINT_TYPES = POINT_TYPES_CONFIG.map(s => ({ ...s, label: s.labelKey, desc: s.descKey }));
const POINT_QUALITIES_SUCCESS = POINT_QUALITIES_SUCCESS_CONFIG.map(s => ({ ...s, label: s.labelKey, desc: s.descKey }));
const POINT_QUALITIES_FAILED = POINT_QUALITIES_FAILED_CONFIG.map(s => ({ ...s, label: s.labelKey, desc: s.descKey }));
const POINT_QUALITIES = [...POINT_QUALITIES_SUCCESS, ...POINT_QUALITIES_FAILED];

// Helper to resolve translated config
function useTranslatedConfig<T extends { labelKey: string }>(
  config: T[],
  t: (section: string, key: string) => string
) {
  return useMemo(() => config.map(item => ({
    ...item,
    label: t('notation', item.labelKey),
    ...('descKey' in item ? { desc: t('notation', (item as any).descKey) } : {}),
  })), [config, t]);
}

// ============================================
// QUICK OPTION BUTTON
// ============================================

interface QuickOptionProps {
  icon: string;
  label: string;
  sublabel?: string;
  color?: string;
  selected?: boolean;
  onPress: () => void;
  size?: 'small' | 'medium' | 'large';
  special?: boolean;
}

function QuickOption({ icon, label, sublabel, color, selected, onPress, size = 'medium', special }: QuickOptionProps) {
  const scale = useSharedValue(1);

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 15 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const buttonColor = special ? theme.carreauColor : (color || theme.primary);
  const isSmall = size === 'small';
  const isLarge = size === 'large';

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.quickOption,
          isSmall && styles.quickOptionSmall,
          isLarge && styles.quickOptionLarge,
          special && styles.quickOptionSpecial,
          selected && { backgroundColor: buttonColor, borderColor: buttonColor },
          animatedStyle,
        ]}
      >
        <View style={[
          styles.quickOptionIcon,
          isSmall && styles.quickOptionIconSmall,
          isLarge && styles.quickOptionIconLarge,
          { backgroundColor: selected ? 'rgba(255,255,255,0.25)' : buttonColor + '15' },
          special && !selected && { backgroundColor: theme.carreauColor + '20' },
        ]}>
          <MaterialIcons 
            name={icon as any} 
            size={isSmall ? 18 : isLarge ? 28 : 22} 
            color={selected ? '#FFF' : buttonColor} 
          />
        </View>
        <Text style={[
          styles.quickOptionLabel, 
          isSmall && styles.quickOptionLabelSmall,
          special && !selected && { color: theme.carreauColor },
          selected && styles.quickOptionLabelSelected
        ]}>
          {label}
        </Text>
        {sublabel ? (
          <Text style={[
            styles.quickOptionSublabel, 
            selected && styles.quickOptionSublabelSelected,
            special && !selected && { color: theme.carreauColor + 'AA' }
          ]}>
            {sublabel}
          </Text>
        ) : null}
        {selected ? (
          <View style={styles.quickOptionCheck}>
            <MaterialIcons name="check" size={14} color="#FFF" />
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

// ============================================
// SIMPLIFIED SHOT NOTATION COMPONENT
// ============================================

interface SimplifiedShotNotationProps {
  visible: boolean;
  onClose: () => void;
  actionType: 'tir' | 'point';
  playerId: string;
  playerName: string;
  team: 'A' | 'B';
  onSubmit: (record: SimpleShotRecord) => void;
  quickMode?: boolean;
  initialRecord?: Partial<SimpleShotRecord>;
}

export function SimplifiedShotNotation({
  visible,
  onClose,
  actionType,
  playerId,
  playerName,
  team,
  onSubmit,
  quickMode = false,
  initialRecord,
}: SimplifiedShotNotationProps) {
  const { t } = useLanguage();
  const isEditMode = !!initialRecord;

  // Translated config arrays
  const translatedShotTypesSuccess = useTranslatedConfig(SHOT_TYPES_SUCCESS_CONFIG, t);
  const translatedShotTypesFailed = useTranslatedConfig(SHOT_TYPES_FAILED_CONFIG, t);
  const translatedShotResultsFailed = useTranslatedConfig(SHOT_RESULTS_FAILED_CONFIG, t);
  const translatedShotQualities = useTranslatedConfig(SHOT_QUALITIES_CONFIG, t);
  const translatedCarreauQualities = useTranslatedConfig(CARREAU_QUALITIES_CONFIG, t);
  const translatedPointTypes = useTranslatedConfig(POINT_TYPES_CONFIG, t);
  const translatedPointQualitiesSuccess = useTranslatedConfig(POINT_QUALITIES_SUCCESS_CONFIG, t);
  const translatedPointQualitiesFailed = useTranslatedConfig(POINT_QUALITIES_FAILED_CONFIG, t);

  // Combined shot types for label lookups
  const allShotTypes = useMemo(() => [...translatedShotTypesSuccess, ...translatedShotTypesFailed], [translatedShotTypesSuccess, translatedShotTypesFailed]);

  // State
  const [success, setSuccess] = useState<boolean | null>(null);
  const [shotResult, setShotResult] = useState<SimpleShotResult | null>(null);
  const [shotType, setShotType] = useState<SimpleShotType | null>(null);
  const [shotQuality, setShotQuality] = useState<SimpleShotQuality | null>(null);
  const [pointType, setPointType] = useState<SimplePointType | null>(null);
  const [pointQuality, setPointQuality] = useState<SimplePointQuality | null>(null);

  // Animation
  const progressWidth = useSharedValue(0);

  const isFailedTir = actionType === 'tir' && success === false;
  const totalSteps = isFailedTir ? 4 : 3;

  const getCurrentStep = useCallback(() => {
    if (success === null) return 1;
    if (actionType === 'tir') {
      if (success === false) {
        if (!shotResult) return 2;
        if (!shotType) return 3;
        if (!shotQuality) return 4;
        return 4;
      } else {
        if (!shotType) return 2;
        if (!shotQuality) return 3;
        return 3;
      }
    } else {
      if (!pointType) return 2;
      if (!pointQuality) return 3;
      return 3;
    }
  }, [success, actionType, shotResult, shotType, shotQuality, pointType, pointQuality]);

  // Pre-fill state when opening in edit mode
  useEffect(() => {
    if (visible && initialRecord) {
      if (initialRecord.success !== undefined && initialRecord.success !== null) {
        setSuccess(initialRecord.success);
      }
      if (initialRecord.shotResult) setShotResult(initialRecord.shotResult as SimpleShotResult);
      if (initialRecord.shotType) setShotType(initialRecord.shotType as SimpleShotType);
      if (initialRecord.pointType) setPointType(initialRecord.pointType as SimplePointType);
      // Don't pre-fill quality — user must re-confirm to save
    }
    if (visible) {
      progressWidth.value = withTiming(0, { duration: 0 });
    }
  }, [visible]);

  useEffect(() => {
    const currentStep = getCurrentStep();
    let progress = 0;
    if (totalSteps === 4) {
      if (currentStep === 1) progress = 0;
      else if (currentStep === 2) progress = 25;
      else if (currentStep === 3) progress = 50;
      else if (currentStep === 4) progress = 75;
      if (shotQuality) progress = 100;
    } else {
      if (currentStep === 1) progress = 0;
      else if (currentStep === 2) progress = 33;
      else if (currentStep === 3) progress = 66;
      if (shotQuality || pointQuality) progress = 100;
    }
    
    progressWidth.value = withTiming(progress, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [success, shotResult, shotType, pointType, shotQuality, pointQuality, getCurrentStep, progressWidth, totalSteps]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progressWidth.value}%`,
  }));

  const resetState = useCallback(() => {
    setSuccess(null);
    setShotResult(null);
    setShotType(null);
    setShotQuality(null);
    setPointType(null);
    setPointQuality(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const handleQuickResult = useCallback((isSuccess: boolean) => {
    Haptics.impactAsync(isSuccess ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    
    if (quickMode) {
      const record: SimpleShotRecord = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        playerId,
        playerName,
        team,
        actionType,
        success: isSuccess,
        carreau: false,
      };
      onSubmit(record);
      handleClose();
    } else {
      setSuccess(isSuccess);
    }
  }, [quickMode, playerId, playerName, team, actionType, onSubmit, handleClose]);

  const handleShotResultSelect = useCallback((result: SimpleShotResult) => {
    Haptics.selectionAsync();
    setShotResult(result);
  }, []);

  const handleTypeSelect = useCallback((type: SimpleShotType | SimplePointType) => {
    Haptics.selectionAsync();
    if (actionType === 'tir') {
      setShotType(type as SimpleShotType);
    } else {
      setPointType(type as SimplePointType);
    }
  }, [actionType]);

  const handleQualitySelect = useCallback((quality: SimpleShotQuality | SimplePointQuality | null) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    const isCarreau = shotType === 'carreau';
    
    const record: SimpleShotRecord = {
      id: initialRecord?.id || Date.now().toString(),
      timestamp: initialRecord?.timestamp || new Date().toISOString(),
      playerId,
      playerName,
      team,
      actionType,
      success: success!,
      carreau: isCarreau,
      shotResult: actionType === 'tir' && !success ? shotResult || undefined : undefined,
      shotType: actionType === 'tir' ? shotType || undefined : undefined,
      shotQuality: actionType === 'tir' ? (quality as SimpleShotQuality) || undefined : undefined,
      pointType: actionType === 'point' ? pointType || undefined : undefined,
      pointQuality: actionType === 'point' ? (quality as SimplePointQuality) || undefined : undefined,
    };
    
    onSubmit(record);
    handleClose();
  }, [playerId, playerName, team, actionType, success, shotType, pointType, onSubmit, handleClose, shotResult, initialRecord]);

  const handleSkip = useCallback(() => {
    if (success !== null) {
      handleQualitySelect(null);
    }
  }, [success, handleQualitySelect]);

  const handleBack = useCallback(() => {
    Haptics.selectionAsync();
    if (shotQuality || pointQuality) {
      setShotQuality(null);
      setPointQuality(null);
    } else if (shotType || pointType) {
      setShotType(null);
      setPointType(null);
    } else if (shotResult) {
      setShotResult(null);
    } else if (success !== null) {
      setSuccess(null);
      setShotResult(null);
    }
  }, [shotQuality, pointQuality, shotType, pointType, shotResult, success]);

  const isTir = actionType === 'tir';
  const teamColor = team === 'A' ? theme.primary : theme.accent;
  const currentStep = getCurrentStep();
  const canGoBack = success !== null;
  const isCarreau = shotType === 'carreau';

  const stepLabels = isTir 
    ? (isFailedTir 
        ? [t('notation', 'resultStep'), t('notation', 'detailedResult'), t('notation', 'typeStep'), t('notation', 'impactStep')] 
        : [t('notation', 'resultStep'), t('notation', 'typeStep'), t('notation', 'impactStep')])
    : [t('notation', 'resultStep'), t('notation', 'typeStep'), t('notation', 'qualityStep')];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable style={styles.headerBtn} onPress={canGoBack ? handleBack : handleClose}>
            <MaterialIcons 
              name={canGoBack ? 'arrow-back' : 'close'} 
              size={24} 
              color={theme.textPrimary} 
            />
          </Pressable>
          
          <View style={styles.headerCenter}>
            <View style={[styles.headerBadge, { backgroundColor: teamColor + '20' }]}>
              <MaterialIcons 
                name={isTir ? 'gps-fixed' : 'adjust'} 
                size={16} 
                color={teamColor} 
              />
              <Text style={[styles.headerBadgeText, { color: teamColor }]}>
                {isTir ? t('notation', 'tirLabel') : t('notation', 'pointLabel')}
              </Text>
            </View>
            <Text style={styles.headerPlayer}>{playerName}</Text>
          </View>
          
          {success !== null ? (
            <Pressable style={styles.headerBtn} onPress={handleSkip}>
              <Text style={styles.skipText}>{t('notation', 'finish')}</Text>
            </Pressable>
          ) : (
            <View style={{ width: 60 }} />
          )}
        </View>

        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { backgroundColor: teamColor }, progressStyle]} />
          </View>
          <View style={styles.progressSteps}>
            {stepLabels.map((label, i) => {
              const stepNumber = i + 1;
              const isCompleted = currentStep > stepNumber || 
                (stepNumber === 3 && (shotQuality || pointQuality));
              const isActive = currentStep === stepNumber;
              
              return (
                <View key={`${label}-${i}`} style={styles.progressStep}>
                  <View style={[
                    styles.progressDot,
                    isCompleted && styles.progressDotDone,
                    isActive && [styles.progressDotActive, { borderColor: teamColor, backgroundColor: teamColor + '20' }],
                  ]}>
                    {isCompleted ? (
                      <MaterialIcons name="check" size={10} color="#FFF" />
                    ) : (
                      <Text style={[
                        styles.progressDotText,
                        isActive && { color: teamColor, fontWeight: '700' }
                      ]}>{stepNumber}</Text>
                    )}
                  </View>
                  <Text style={[
                    styles.progressLabel,
                    isActive && { color: teamColor, fontWeight: '600' }
                  ]}>{label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <ScrollView 
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
        >
          {/* STEP 1: Result */}
          {success === null && (
            <Animated.View entering={FadeIn.duration(200)}>
              <Text style={styles.stepTitle}>
                {isTir ? t('notation', 'shotResultTitle') : t('notation', 'pointResultTitle')}
              </Text>
              <Text style={styles.stepSubtitle}>
                {isTir ? t('notation', 'wasBallTouched') : t('notation', 'isPointSuccessful')}
              </Text>

              <View style={styles.resultGrid}>
                <Pressable
                  style={[styles.resultCard, styles.resultCardSuccess]}
                  onPress={() => handleQuickResult(true)}
                >
                  <Animated.View entering={ZoomIn.duration(200).delay(100)}>
                    <MaterialIcons name="check" size={48} color="#FFF" />
                  </Animated.View>
                  <Text style={styles.resultCardLabel}>{t('notation', 'succeeded')}</Text>
                </Pressable>

                <Pressable
                  style={[styles.resultCard, styles.resultCardFail]}
                  onPress={() => handleQuickResult(false)}
                >
                  <Animated.View entering={ZoomIn.duration(200).delay(150)}>
                    <MaterialIcons name="close" size={48} color="#FFF" />
                  </Animated.View>
                  <Text style={styles.resultCardLabel}>{t('notation', 'missed')}</Text>
                </Pressable>
              </View>

              {!isEditMode && (
                <View style={styles.quickModeHint}>
                  <MaterialIcons name="info-outline" size={16} color={theme.textMuted} />
                  <Text style={styles.quickModeHintText}>
                    {t('notation', 'optionalContinue')}
                  </Text>
                </View>
              )}
            </Animated.View>
          )}

          {/* STEP 2 for failed tir: Shot Result (where the shot went) */}
          {isTir && success === false && !shotResult && (
            <Animated.View entering={FadeIn.duration(200)}>
              <View style={styles.resultSummary}>
                <MaterialIcons name="cancel" size={20} color={theme.error} />
                <Text style={styles.resultSummaryText}>{t('notation', 'missed')}</Text>
              </View>

              <Text style={styles.stepTitle}>{t('notation', 'shotResultTitle')}</Text>
              <Text style={styles.stepSubtitle}>{t('notation', 'whereDidBallGo')}</Text>

              <View style={styles.qualityList}>
                {translatedShotResultsFailed.map((result, index) => (
                  <Animated.View key={result.id} entering={FadeInDown.duration(200).delay(index * 50)}>
                    <Pressable
                      style={[styles.qualityItem, { borderLeftColor: result.color }]}
                      onPress={() => handleShotResultSelect(result.id)}
                    >
                      <View style={[styles.qualityItemIcon, { backgroundColor: result.color + '15' }]}>
                        <MaterialIcons name={result.icon as any} size={22} color={result.color} />
                      </View>
                      <View style={styles.qualityItemContent}>
                        <Text style={styles.qualityItemLabel}>{result.label}</Text>
                        <Text style={styles.qualityItemDesc}>{result.desc}</Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* STEP: Type selection */}
          {success !== null && !shotType && !pointType && (isFailedTir ? shotResult !== null : true) && !(isTir && success === false && !shotResult) && (
            <Animated.View entering={FadeIn.duration(200)}>
              <View style={styles.resultSummary}>
                <MaterialIcons 
                  name={success ? 'check-circle' : 'cancel'} 
                  size={20} 
                  color={success ? theme.success : theme.error} 
                />
                <Text style={styles.resultSummaryText}>
                  {success ? t('notation', 'succeeded') : t('notation', 'missed')}
                </Text>
                {shotResult ? (
                  <>
                    <View style={styles.resultSummaryDivider} />
                    <MaterialIcons 
                      name={translatedShotResultsFailed.find(r => r.id === shotResult)?.icon as any} 
                      size={18} 
                      color={theme.error} 
                    />
                    <Text style={[styles.resultSummaryText, { color: theme.error }]}>
                      {translatedShotResultsFailed.find(r => r.id === shotResult)?.label}
                    </Text>
                  </>
                ) : null}
              </View>

              <Text style={styles.stepTitle}>
                {isTir ? t('notation', 'shotTypeTitle') : t('notation', 'pointTypeTitle')}
              </Text>
              <Text style={styles.stepSubtitle}>
                {isTir ? t('notation', 'howDidYouShoot') : t('notation', 'howDidYouPoint')}
              </Text>

              <View style={styles.typeGrid}>
                {(isTir 
                  ? (success ? translatedShotTypesSuccess : translatedShotTypesFailed) 
                  : translatedPointTypes
                ).map((type, index) => (
                  <Animated.View key={type.id} entering={FadeInDown.duration(200).delay(index * 50)}>
                    <QuickOption
                      icon={type.icon}
                      label={type.label}
                      sublabel={type.desc}
                      color={isTir ? theme.tirColor : theme.pointColor}
                      onPress={() => handleTypeSelect(type.id)}
                      size="medium"
                      special={'special' in type ? (type as any).special : false}
                    />
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          )}

          {/* STEP 3: Quality */}
          {(shotType || pointType) ? (
            <Animated.View entering={FadeIn.duration(200)}>
              <View style={styles.resultSummary}>
                <MaterialIcons 
                  name={success ? (isCarreau ? 'stars' : 'check-circle') : 'cancel'} 
                  size={18} 
                  color={success ? (isCarreau ? theme.carreauColor : theme.success) : theme.error} 
                />
                <Text style={styles.resultSummaryText}>
                  {success ? (isCarreau ? t('notation', 'carreauLabel') : t('notation', 'succeeded')) : t('notation', 'missed')}
                </Text>
                {shotResult ? (
                  <>
                    <View style={styles.resultSummaryDivider} />
                    <Text style={[styles.resultSummaryText, { color: theme.error }]}>
                      {translatedShotResultsFailed.find(r => r.id === shotResult)?.label}
                    </Text>
                  </>
                ) : null}
                <View style={styles.resultSummaryDivider} />
                <MaterialIcons 
                  name={(isTir ? allShotTypes : translatedPointTypes).find(tp => tp.id === (shotType || pointType))?.icon as any} 
                  size={18} 
                  color={isCarreau ? theme.carreauColor : theme.textSecondary} 
                />
                <Text style={[
                  styles.resultSummaryText,
                  isCarreau && { color: theme.carreauColor, fontWeight: '600' }
                ]}>
                  {(isTir ? allShotTypes : translatedPointTypes).find(tp => tp.id === (shotType || pointType))?.label}
                </Text>
              </View>

              <Text style={styles.stepTitle}>
                {isTir ? t('notation', 'shotImpactTitle') : t('notation', 'pointQualityTitle')}
              </Text>
              <Text style={styles.stepSubtitle}>
                {isCarreau 
                  ? t('notation', 'carreauAutoGain')
                  : isTir 
                    ? t('notation', 'effectOnEnd') 
                    : success 
                      ? t('notation', 'precisionVsJack')
                      : t('notation', 'whatHappened')
                }
              </Text>

              {isCarreau ? (
                <Animated.View entering={FadeInDown.duration(200)} style={styles.carreauInfo}>
                  <MaterialIcons name="info" size={20} color={theme.carreauColor} />
                  <Text style={styles.carreauInfoText}>
                    {t('notation', 'carreauAlwaysGain')}
                  </Text>
                </Animated.View>
              ) : null}

              <View style={styles.qualityList}>
                {(isTir 
                  ? (isCarreau ? translatedCarreauQualities : translatedShotQualities) 
                  : (success ? translatedPointQualitiesSuccess : translatedPointQualitiesFailed)
                ).map((quality, index) => (
                  <Animated.View key={quality.id} entering={FadeInDown.duration(200).delay(index * 40)}>
                    <Pressable
                      style={[styles.qualityItem, { borderLeftColor: quality.color }]}
                      onPress={() => handleQualitySelect(quality.id)}
                    >
                      <View style={[styles.qualityItemIcon, { backgroundColor: quality.color + '15' }]}>
                        <MaterialIcons name={quality.icon as any} size={22} color={quality.color} />
                      </View>
                      <View style={styles.qualityItemContent}>
                        <Text style={styles.qualityItemLabel}>{quality.label}</Text>
                        {'desc' in quality && quality.desc ? (
                          <Text style={styles.qualityItemDesc}>{quality.desc}</Text>
                        ) : null}
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color={theme.textMuted} />
                    </Pressable>
                  </Animated.View>
                ))}
              </View>
            </Animated.View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ============================================
// QUICK SHOT BAR (Inline component for match)
// ============================================

interface QuickShotBarProps {
  playerId: string;
  playerName: string;
  team: 'A' | 'B';
  onQuickShot: (actionType: 'tir' | 'point' | 'carreau', success: boolean) => void;
  onDetailedShot: (actionType: 'tir' | 'point') => void;
  stats?: { tirs: number; tirsSuccess: number; points: number; pointsSuccess: number; carreaux: number };
  compact?: boolean;
}

export function QuickShotBar({
  playerId,
  playerName,
  team,
  onQuickShot,
  onDetailedShot,
  stats,
  compact = false,
}: QuickShotBarProps) {
  const { t } = useLanguage();
  const teamColor = team === 'A' ? theme.primary : theme.accent;

  if (compact) {
    return (
      <View style={[styles.quickBarCompact, { borderLeftColor: teamColor }]}>
        <Text style={styles.quickBarName} numberOfLines={1}>{playerName.split(' ')[0]}</Text>
        <View style={styles.quickBarActions}>
          <Pressable
            style={[styles.quickBarBtn, { backgroundColor: theme.tirColor }]}
            onPress={() => onQuickShot('tir', true)}
            onLongPress={() => onDetailedShot('tir')}
          >
            <MaterialIcons name="gps-fixed" size={16} color="#FFF" />
          </Pressable>
          <Pressable
            style={[styles.quickBarBtn, { backgroundColor: theme.pointColor }]}
            onPress={() => onQuickShot('point', true)}
            onLongPress={() => onDetailedShot('point')}
          >
            <MaterialIcons name="adjust" size={16} color="#FFF" />
          </Pressable>
          <Pressable
            style={[styles.quickBarBtn, { backgroundColor: theme.carreauColor }]}
            onPress={() => onQuickShot('carreau', true)}
          >
            <MaterialIcons name="stars" size={16} color="#FFF" />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.quickBar, { borderColor: teamColor + '30' }]}>
      <View style={styles.quickBarHeader}>
        <View style={[styles.quickBarDot, { backgroundColor: teamColor }]} />
        <Text style={styles.quickBarNameFull}>{playerName}</Text>
        {stats ? (
          <Text style={styles.quickBarStats}>
            T:{stats.tirsSuccess}/{stats.tirs} P:{stats.pointsSuccess}/{stats.points} C:{stats.carreaux}
          </Text>
        ) : null}
      </View>
      
      <View style={styles.quickBarRow}>
        {/* TIR Section */}
        <View style={styles.quickBarSection}>
          <Text style={styles.quickBarSectionLabel}>{t('notation', 'tirLabel')}</Text>
          <View style={styles.quickBarSectionBtns}>
            <Pressable
              style={[styles.quickBarActionBtn, { backgroundColor: theme.success }]}
              onPress={() => onQuickShot('tir', true)}
              onLongPress={() => onDetailedShot('tir')}
            >
              <MaterialIcons name="check" size={18} color="#FFF" />
            </Pressable>
            <Pressable
              style={[styles.quickBarActionBtn, { backgroundColor: theme.error }]}
              onPress={() => onQuickShot('tir', false)}
            >
              <MaterialIcons name="close" size={18} color="#FFF" />
            </Pressable>
          </View>
        </View>

        {/* POINT Section */}
        <View style={styles.quickBarSection}>
          <Text style={styles.quickBarSectionLabel}>{t('notation', 'pointLabel')}</Text>
          <View style={styles.quickBarSectionBtns}>
            <Pressable
              style={[styles.quickBarActionBtn, { backgroundColor: theme.success }]}
              onPress={() => onQuickShot('point', true)}
              onLongPress={() => onDetailedShot('point')}
            >
              <MaterialIcons name="check" size={18} color="#FFF" />
            </Pressable>
            <Pressable
              style={[styles.quickBarActionBtn, { backgroundColor: theme.error }]}
              onPress={() => onQuickShot('point', false)}
            >
              <MaterialIcons name="close" size={18} color="#FFF" />
            </Pressable>
          </View>
        </View>

        {/* CARREAU Button */}
        <Pressable
          style={styles.quickBarCarreauBtn}
          onPress={() => onQuickShot('carreau', true)}
        >
          <MaterialIcons name="stars" size={22} color={theme.carreauColor} />
          <Text style={styles.quickBarCarreauText}>{t('notation', 'carreauLabel')}</Text>
        </Pressable>
      </View>

      <Text style={styles.quickBarHint}>
        {t('notation', 'longPressDetailed')}
      </Text>
    </View>
  );
}

// ============================================
// EXPORTS
// ============================================

export { SHOT_TYPES, SHOT_TYPES_SUCCESS, SHOT_TYPES_FAILED, SHOT_RESULTS_FAILED, SHOT_QUALITIES, POINT_TYPES, POINT_QUALITIES, POINT_QUALITIES_SUCCESS };

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerBtn: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 4,
  },
  headerBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  headerPlayer: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.primary,
  },
  // Progress
  progressContainer: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  progressTrack: {
    height: 4,
    backgroundColor: theme.border,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressSteps: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  progressStep: {
    alignItems: 'center',
  },
  progressDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 2,
    borderColor: theme.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  progressDotActive: {
    borderWidth: 2,
  },
  progressDotDone: {
    backgroundColor: theme.success,
    borderColor: theme.success,
  },
  progressDotText: {
    fontSize: 10,
    fontWeight: '600',
    color: theme.textMuted,
  },
  progressLabel: {
    fontSize: 11,
    color: theme.textMuted,
  },
  // Content
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 20,
    paddingBottom: 40,
  },
  stepTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  stepSubtitle: {
    fontSize: 14,
    color: theme.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  // Result Summary
  resultSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.surface,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    marginBottom: 20,
    gap: 8,
  },
  resultSummaryText: {
    fontSize: 13,
    fontWeight: '500',
    color: theme.textSecondary,
  },
  resultSummaryDivider: {
    width: 1,
    height: 16,
    backgroundColor: theme.border,
    marginHorizontal: 6,
  },
  // Result Grid
  resultGrid: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
  },
  resultCard: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.xl,
    ...theme.shadows.cardElevated,
  },
  resultCardSuccess: {
    backgroundColor: theme.success,
  },
  resultCardFail: {
    backgroundColor: theme.error,
  },
  resultCardLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
    marginTop: 10,
  },
  // Carreau Info
  carreauInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.carreauColor + '15',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: theme.borderRadius.md,
    marginBottom: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: theme.carreauColor + '30',
  },
  carreauInfoText: {
    flex: 1,
    fontSize: 13,
    color: theme.carreauColor,
    fontWeight: '500',
  },
  // Quick Mode Hint
  quickModeHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
  },
  quickModeHintText: {
    fontSize: 12,
    color: theme.textMuted,
    flex: 1,
  },
  // Type Grid
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  // Quick Option
  quickOption: {
    width: (screenWidth - 52) / 2,
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.border,
    position: 'relative',
    ...theme.shadows.card,
  },
  quickOptionSmall: {
    width: (screenWidth - 64) / 3,
    padding: 12,
  },
  quickOptionLarge: {
    width: screenWidth - 40,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 14,
  },
  quickOptionSpecial: {
    borderColor: theme.carreauColor + '50',
    backgroundColor: theme.carreauColor + '08',
  },
  quickOptionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickOptionIconSmall: {
    width: 40,
    height: 40,
    marginBottom: 8,
  },
  quickOptionIconLarge: {
    marginBottom: 0,
  },
  quickOptionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    textAlign: 'center',
  },
  quickOptionLabelSmall: {
    fontSize: 12,
  },
  quickOptionLabelSelected: {
    color: '#FFF',
  },
  quickOptionSublabel: {
    fontSize: 11,
    color: theme.textSecondary,
    marginTop: 4,
    textAlign: 'center',
  },
  quickOptionSublabelSelected: {
    color: 'rgba(255,255,255,0.8)',
  },
  quickOptionCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Quality List
  qualityList: {
    gap: 10,
  },
  qualityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    padding: 14,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 4,
    gap: 12,
    ...theme.shadows.card,
  },
  qualityItemIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qualityItemContent: {
    flex: 1,
  },
  qualityItemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  qualityItemDesc: {
    fontSize: 12,
    color: theme.textSecondary,
    marginTop: 2,
  },
  // Quick Bar Styles
  quickBarCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.borderRadius.md,
    borderLeftWidth: 3,
    gap: 10,
  },
  quickBarName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: theme.textPrimary,
  },
  quickBarActions: {
    flexDirection: 'row',
    gap: 6,
  },
  quickBarBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Full Quick Bar
  quickBar: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 14,
    borderWidth: 2,
    marginBottom: 10,
  },
  quickBarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  quickBarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  quickBarNameFull: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  quickBarStats: {
    fontSize: 10,
    color: theme.textMuted,
    fontVariant: ['tabular-nums'],
  },
  quickBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickBarSection: {
    alignItems: 'center',
  },
  quickBarSectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: theme.textMuted,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  quickBarSectionBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  quickBarActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBarCarreauBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: theme.carreauColor + '15',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.carreauColor + '40',
  },
  quickBarCarreauText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.carreauColor,
  },
  quickBarHint: {
    fontSize: 10,
    color: theme.textMuted,
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
});
