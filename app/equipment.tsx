import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Line, Circle as SvgCircle, Path, Polygon, G, Text as SvgText } from 'react-native-svg';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import * as ImagePicker from '@/services/imagePicker';
import theme, { blurhash } from '@/constants/theme';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth } from '@/template';
import { BoulesSet } from '@/types/petanque';
import { uploadBoulesSetPhoto } from '@/services/storageService';
import { BOULES_BRANDS, BOULES_DATABASE, getModelsByBrand, findModel, BoulesModel, getBrandImage } from '@/constants/boulesDatabase';
import AdBanner from '@/components/ui/AdBanner';

// ============================================
// Mini Win Chart
// ============================================
function MiniWinChart({ data, chartWidth }: { data: { cumWinRate: number }[]; chartWidth: number }) {
  if (data.length < 2) return null;
  const W = Math.max(100, chartWidth);
  const H = 72;
  const pad = { top: 10, right: 10, bottom: 10, left: 10 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;
  const pts = data.map((d, i) => ({
    x: pad.left + (i / (data.length - 1)) * cW,
    y: pad.top + cH - (d.cumWinRate / 100) * cH,
  }));
  const polyline = pts.map(p => `${p.x},${p.y}`).join(' ');
  const area = `M ${pad.left},${pad.top + cH} L ${pts.map(p => `${p.x},${p.y}`).join(' L ')} L ${pad.left + cW},${pad.top + cH} Z`;
  const mid = pad.top + cH / 2;
  return (
    <Svg width={W} height={H}>
      <Line x1={pad.left} y1={mid} x2={pad.left + cW} y2={mid} stroke={theme.border} strokeWidth={1} strokeDasharray="4,4" />
      <Path d={area} fill={theme.success + '12'} />
      <Polyline points={polyline} fill="none" stroke={theme.success} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <SvgCircle key={i} cx={p.x} cy={p.y} r={3} fill={data[i].cumWinRate >= 50 ? theme.success : theme.error} stroke="#FFF" strokeWidth={1.5} />
      ))}
    </Svg>
  );
}

// ============================================
// Radar Chart for Comparison
// ============================================
function RadarChart({ setA, setB, labels, size, colorA, colorB }: {
  setA: number[];
  setB: number[];
  labels: string[];
  size: number;
  colorA: string;
  colorB: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const R = (size - 60) / 2;
  const n = labels.length;
  const angleStep = (2 * Math.PI) / n;
  const levels = [25, 50, 75, 100];

  const getPoint = (angle: number, value: number) => ({
    x: cx + (value / 100) * R * Math.sin(angle),
    y: cy - (value / 100) * R * Math.cos(angle),
  });

  const makePolygon = (values: number[]) =>
    values.map((v, i) => {
      const p = getPoint(i * angleStep, v);
      return `${p.x},${p.y}`;
    }).join(' ');

  return (
    <Svg width={size} height={size}>
      {/* Grid levels */}
      {levels.map(level => {
        const pts = Array.from({ length: n }, (_, i) => {
          const p = getPoint(i * angleStep, level);
          return `${p.x},${p.y}`;
        }).join(' ');
        return <Polygon key={level} points={pts} fill="none" stroke={theme.border} strokeWidth={0.8} opacity={0.5} />;
      })}
      {/* Axes */}
      {labels.map((_, i) => {
        const p = getPoint(i * angleStep, 100);
        return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={theme.border} strokeWidth={0.8} opacity={0.5} />;
      })}
      {/* Set B polygon */}
      <Polygon points={makePolygon(setB)} fill={colorB + '15'} stroke={colorB} strokeWidth={2} opacity={0.8} />
      {/* Set A polygon */}
      <Polygon points={makePolygon(setA)} fill={colorA + '15'} stroke={colorA} strokeWidth={2} opacity={0.8} />
      {/* Data points A */}
      {setA.map((v, i) => {
        const p = getPoint(i * angleStep, v);
        return <SvgCircle key={`a-${i}`} cx={p.x} cy={p.y} r={4} fill={colorA} stroke="#FFF" strokeWidth={1.5} />;
      })}
      {/* Data points B */}
      {setB.map((v, i) => {
        const p = getPoint(i * angleStep, v);
        return <SvgCircle key={`b-${i}`} cx={p.x} cy={p.y} r={4} fill={colorB} stroke="#FFF" strokeWidth={1.5} />;
      })}
      {/* Labels */}
      {labels.map((label, i) => {
        const p = getPoint(i * angleStep, 115);
        return (
          <SvgText key={`l-${i}`} x={p.x} y={p.y + 4} fontSize="11" fill={theme.textSecondary} textAnchor="middle" fontWeight="600">
            {label}
          </SvgText>
        );
      })}
    </Svg>
  );
}

export default function EquipmentScreen() {
  const insets = useSafeAreaInsets();
  const { boulesSets, matches, challenges } = useAppData();
  const { addBoulesSet, updateBoulesSet, deleteBoulesSet, setPrimaryBoulesSet } = useAppActions();
  const { t, language } = useLanguage();
  const { user } = useAuth();

  const [showForm, setShowForm] = useState(false);
  const [editingSet, setEditingSet] = useState<BoulesSet | null>(null);


  // Form state
  const [formName, setFormName] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formCustomBrand, setFormCustomBrand] = useState('');
  const [formCustomModel, setFormCustomModel] = useState('');
  const [formDiameter, setFormDiameter] = useState('');
  const [formWeight, setFormWeight] = useState('');
  const [formSerialNumber, setFormSerialNumber] = useState('');
  const [formHardness, setFormHardness] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsPrimary, setFormIsPrimary] = useState(false);
  const [formPhoto, setFormPhoto] = useState<string | null>(null);
  const [formPurchasePrice, setFormPurchasePrice] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showBrandPicker, setShowBrandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);

  // Resolved selected model from database
  const selectedDbModel: BoulesModel | undefined = useMemo(() => {
    if (!formBrand || formBrand === '__other__' || !formModel) return undefined;
    return findModel(formBrand, formModel);
  }, [formBrand, formModel]);

  const availableModels = useMemo(() => {
    if (!formBrand || formBrand === '__other__') return [];
    return getModelsByBrand(formBrand);
  }, [formBrand]);

  // Effective brand/model for display
  const effectiveBrandDisplay = formBrand === '__other__' ? formCustomBrand : formBrand;
  const effectiveModelDisplay = formBrand === '__other__' ? formCustomModel : formModel;

  // Detailed stats per set
  const setStats = useMemo(() => {
    const stats: Record<string, { matches: number; wins: number; challenges: number; totalTirs: number; tirsSuccess: number; totalPoints: number; pointsSuccess: number; carreaux: number; winRate: number; tirRate: number; pointRate: number; carreauRate: number; evolution: { cumWinRate: number }[] }> = {};
    boulesSets.forEach(bs => {
      const bsMatches = matches.filter(m => m.boulesSetId === bs.id).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const bsChallenges = challenges.filter(c => c.boulesSetId === bs.id);
      let totalTirs = 0, tirsSuccess = 0, totalPoints = 0, pointsSuccess = 0, carreaux = 0;
      const wins = bsMatches.filter(m => m.winner === 'A').length;
      bsMatches.forEach(m => {
        if (m.playerActions) {
          m.playerActions.filter(pa => pa.team === 'A').forEach(pa => {
            totalTirs += pa.actions.tirs;
            tirsSuccess += pa.actions.tirsSuccess;
            totalPoints += pa.actions.points;
            pointsSuccess += pa.actions.pointsSuccess;
            carreaux += pa.actions.carreaux;
          });
        }
      });
      let cumWins = 0;
      const evolution = bsMatches.map((m, i) => {
        if (m.winner === 'A') cumWins++;
        return { cumWinRate: Math.round((cumWins / (i + 1)) * 100) };
      });
      stats[bs.id] = {
        matches: bsMatches.length, wins, challenges: bsChallenges.length,
        totalTirs, tirsSuccess, totalPoints, pointsSuccess, carreaux,
        winRate: bsMatches.length > 0 ? Math.round((wins / bsMatches.length) * 100) : 0,
        tirRate: totalTirs > 0 ? Math.round((tirsSuccess / totalTirs) * 100) : 0,
        pointRate: totalPoints > 0 ? Math.round((pointsSuccess / totalPoints) * 100) : 0,
        carreauRate: tirsSuccess > 0 ? Math.round((carreaux / tirsSuccess) * 100) : 0,
        evolution,
      };
    });
    return stats;
  }, [boulesSets, matches, challenges]);

  const resetForm = useCallback(() => {
    setFormName('');
    setFormBrand('');
    setFormModel('');
    setFormCustomBrand('');
    setFormCustomModel('');
    setFormDiameter('');
    setFormWeight('');
    setFormSerialNumber('');
    setFormHardness('');
    setFormNotes('');
    setFormIsPrimary(false);
    setFormPhoto(null);
    setFormPurchasePrice('');
    setEditingSet(null);
  }, []);

  const openNewForm = useCallback(() => {
    resetForm();
    setFormIsPrimary(boulesSets.length === 0);
    setShowForm(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [boulesSets.length, resetForm]);

  const openEditForm = useCallback((set: BoulesSet) => {
    setEditingSet(set);
    setFormName(set.name);
    // Try to match existing brand/model from database
    const brandStr = set.brand || '';
    const dbMatch = BOULES_DATABASE.find(b => {
      const nameUpper = set.name.toUpperCase();
      return b.brand === brandStr && nameUpper.includes(b.model.toUpperCase());
    });
    if (dbMatch) {
      setFormBrand(dbMatch.brand);
      setFormModel(dbMatch.model);
      setFormCustomBrand('');
      setFormCustomModel('');
    } else if (brandStr && BOULES_BRANDS.includes(brandStr as any)) {
      setFormBrand(brandStr);
      setFormModel('');
      setFormCustomBrand('');
      setFormCustomModel('');
    } else if (brandStr) {
      setFormBrand('__other__');
      setFormCustomBrand(brandStr);
      setFormModel('');
      setFormCustomModel('');
    } else {
      setFormBrand('');
      setFormModel('');
      setFormCustomBrand('');
      setFormCustomModel('');
    }
    setFormDiameter(set.diameter ? String(set.diameter) : '');
    setFormWeight(set.weight ? String(set.weight) : '');
    setFormSerialNumber(set.serialNumber || '');
    setFormHardness(set.hardness || '');
    setFormNotes(set.notes || '');
    setFormIsPrimary(set.isPrimary || false);
    setFormPhoto(set.photo || null);
    setFormPurchasePrice(set.purchasePrice ? String(set.purchasePrice) : '');
    setShowForm(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handlePickPhoto = useCallback(async () => {
    Alert.alert(
      t('equipment', 'setPhoto'),
      t('equipment', 'chooseOption'),
      [
        {
          text: t('equipment', 'takePhoto'),
          onPress: async () => {
            const { status } = await ImagePicker.requestCameraPermissionsAsync();
            if (status !== 'granted') { Alert.alert(t('profile', 'permissionRequired'), t('profile', 'cameraPermission')); return; }
            const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], quality: 0.8 });
            if (!result.canceled && result.assets[0]) await uploadPhoto(result.assets[0].uri);
          },
        },
        {
          text: t('equipment', 'chooseFromGallery'),
          onPress: async () => {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') { Alert.alert(t('profile', 'permissionRequired'), t('profile', 'galleryPermission')); return; }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.8 });
            if (!result.canceled && result.assets[0]) await uploadPhoto(result.assets[0].uri);
          },
        },
        ...(formPhoto ? [{ text: t('equipment', 'removePhoto'), style: 'destructive' as const, onPress: () => { setFormPhoto(null); Haptics.selectionAsync(); } }] : []),
        { text: t('common', 'cancel'), style: 'cancel' as const },
      ]
    );
  }, [formPhoto, language, t]);

  const uploadPhoto = useCallback(async (uri: string) => {
    if (!user?.id) return;
    setUploadingPhoto(true);
    try {
      const publicUrl = await uploadBoulesSetPhoto(user.id, uri);
      if (publicUrl) { setFormPhoto(publicUrl); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
      else Alert.alert(t('common', 'error'), t('equipment', 'uploadError'));
    } catch (e) {
      console.log('Error uploading boules photo:', e);
      Alert.alert(t('common', 'error'), t('equipment', 'uploadErrorGeneric'));
    } finally { setUploadingPhoto(false); }
  }, [user?.id, t, language]);

  const handleSave = useCallback(async () => {
    if (!formName.trim()) { Alert.alert(t('common', 'error'), t('equipment', 'nameRequired')); return; }
    const finalBrand = formBrand === '__other__' ? formCustomBrand.trim() : formBrand;
    const resolvedHardness = selectedDbModel ? selectedDbModel.hardness : formHardness;
    const setData: Omit<BoulesSet, 'id'> = {
      name: formName.trim(),
      brand: finalBrand || undefined,
      diameter: formDiameter ? parseFloat(formDiameter) : undefined,
      weight: formWeight ? parseInt(formWeight, 10) : undefined,
      serialNumber: formSerialNumber.trim() || undefined,
      hardness: resolvedHardness || undefined,
      isPrimary: formIsPrimary,
      notes: formNotes.trim() || undefined,
      photo: formPhoto || undefined,
      purchasePrice: formPurchasePrice ? parseFloat(formPurchasePrice) : undefined,
    };
    if (editingSet) {
      await updateBoulesSet(editingSet.id, setData);
      if (formIsPrimary && !editingSet.isPrimary) await setPrimaryBoulesSet(editingSet.id);
    } else {
      await addBoulesSet(setData);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setShowForm(false);
    resetForm();
  }, [formName, formBrand, formDiameter, formWeight, formSerialNumber, formHardness, formNotes, formIsPrimary, formPhoto, formPurchasePrice, editingSet, addBoulesSet, updateBoulesSet, setPrimaryBoulesSet, resetForm, t, language]);

  const handleDelete = useCallback((set: BoulesSet) => {
    Alert.alert(t('common', 'delete'), `${t('equipment', 'deleteConfirm')} "${set.name}" ?`, [
      { text: t('common', 'cancel'), style: 'cancel' },
      { text: t('common', 'delete'), style: 'destructive', onPress: async () => { await deleteBoulesSet(set.id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } },
    ]);
  }, [deleteBoulesSet, t, language]);

  const handleSetPrimary = useCallback(async (set: BoulesSet) => {
    await setPrimaryBoulesSet(set.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [setPrimaryBoulesSet]);

  const primarySet = boulesSets.find(s => s.isPrimary);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('equipment', 'title')}</Text>
        <View style={styles.headerRight}>
          <Pressable style={styles.addBtn} onPress={openNewForm}>
            <MaterialIcons name="add" size={24} color={theme.primary} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View entering={FadeInDown.duration(400)} style={styles.heroCard}>
          <View style={styles.heroIconBg}>
            <MaterialIcons name="sports-baseball" size={36} color={theme.accent} />
          </View>
          <Text style={styles.heroTitle}>{t('equipment', 'myBoulesSets')}</Text>
          <Text style={styles.heroSubtitle}>
            {boulesSets.length} {t('equipment', 'setsRegistered')}
          </Text>
          {primarySet ? (
            <View style={styles.heroPrimaryBadge}>
              <MaterialIcons name="star" size={14} color={theme.carreauColor} />
              <Text style={styles.heroPrimaryText}>{t('equipment', 'primary')}: {primarySet.name}</Text>
            </View>
          ) : null}
        </Animated.View>

        {/* Sets List */}
        {boulesSets.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(400).delay(100)} style={styles.emptyState}>
            <View style={styles.emptyIconBg}>
              <MaterialIcons name="sports-baseball" size={48} color={theme.textMuted} />
            </View>
            <Text style={styles.emptyTitle}>{t('equipment', 'noSets')}</Text>
            <Text style={styles.emptyDesc}>
              {t('equipment', 'noSetsDesc')}
            </Text>
            <Pressable style={styles.emptyBtn} onPress={openNewForm}>
              <MaterialIcons name="add" size={20} color="#FFF" />
              <Text style={styles.emptyBtnText}>{t('equipment', 'addBoulesSet')}</Text>
            </Pressable>
          </Animated.View>
        ) : (
          boulesSets.map((set, idx) => {
            const stats = setStats[set.id] || { matches: 0, wins: 0, challenges: 0, totalTirs: 0, tirsSuccess: 0, totalPoints: 0, pointsSuccess: 0, carreaux: 0, winRate: 0, tirRate: 0, pointRate: 0, carreauRate: 0, evolution: [] };
            const chartWidth = Math.max(1, (Dimensions.get('window').width || 375) - 96);
            return (
              <Animated.View key={set.id} entering={FadeInDown.duration(400).delay(100 + idx * 60)}>
                <Pressable
                  style={[
                    styles.setCard,
                    set.isPrimary && styles.setCardPrimary,
                  ]}
                  onPress={() => openEditForm(set)}
                >
                  {/* Primary badge */}
                  {set.isPrimary ? (
                    <View style={styles.primaryBadge}>
                      <MaterialIcons name="star" size={12} color="#FFF" />
                      <Text style={styles.primaryBadgeText}>{t('equipment', 'primary')}</Text>
                    </View>
                  ) : null}

                  {/* Header row */}
                  <View style={styles.setHeader}>
                    {set.photo ? (
                      <View style={styles.setPhotoBg}>
                        <Image source={{ uri: set.photo }} style={styles.setPhoto} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.default }} cachePolicy="memory-disk" />
                      </View>
                    ) : (() => {
                      const brandLogo = set.brand ? getBrandImage(set.brand) : null;
                      return brandLogo ? (
                        <View style={[styles.setIconBg, { backgroundColor: '#FFF', overflow: 'hidden' as const }]}>
                          <Image source={brandLogo} style={{ width: 48, height: 48, borderRadius: 14 }} contentFit="contain" transition={200} />
                        </View>
                      ) : (
                        <View style={[styles.setIconBg, set.isPrimary && { backgroundColor: theme.accent + '20' }]}>
                          <MaterialIcons name="sports-baseball" size={24} color={set.isPrimary ? theme.accent : theme.textSecondary} />
                        </View>
                      );
                    })()}
                    <View style={styles.setInfo}>
                      <Text style={styles.setName}>{set.name}</Text>
                      <Text style={styles.setMeta}>
                        {[set.brand, set.diameter ? `${set.diameter} mm` : '', set.weight ? `${set.weight} g` : '', set.hardness].filter(Boolean).join(' • ')}
                      </Text>
                      {(() => { const dbM = set.brand ? BOULES_DATABASE.find(b => b.brand === set.brand && set.name.toUpperCase().includes(b.model.toUpperCase())) : null; return dbM ? <Text style={{ fontSize: 11, color: theme.accent, fontWeight: '500', marginTop: 2 }}>{dbM.targetUsage} {"•"} {dbM.particularities}</Text> : null; })()}
                    </View>
                    <View style={styles.setActions}>
                      {!set.isPrimary ? (
                        <Pressable style={styles.setActionBtn} onPress={(e) => { e.stopPropagation(); handleSetPrimary(set); }} hitSlop={8}>
                          <MaterialIcons name="star-outline" size={20} color={theme.textMuted} />
                        </Pressable>
                      ) : null}
                      <Pressable style={[styles.setActionBtn, { backgroundColor: theme.error + '10' }]} onPress={(e) => { e.stopPropagation(); handleDelete(set); }} hitSlop={8}>
                        <MaterialIcons name="delete-outline" size={20} color={theme.error} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Serial + Price */}
                  {(set.serialNumber || set.purchasePrice) ? (
                    <View style={styles.serialRow}>
                      {set.serialNumber ? (
                        <View style={styles.serialItem}>
                          <MaterialIcons name="tag" size={14} color={theme.textMuted} />
                          <Text style={styles.serialText}>N°{set.serialNumber}</Text>
                        </View>
                      ) : null}
                      {set.purchasePrice ? (
                        <View style={styles.serialItem}>
                          <MaterialIcons name="sell" size={14} color={theme.textMuted} />
                          <Text style={styles.serialText}>{set.purchasePrice} €</Text>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Specs bars */}
                  {(set.diameter || set.weight) ? (
                    <View style={styles.specsBars}>
                      {set.diameter ? (
                        <View style={styles.specBar}>
                          <View style={styles.specHeader}>
                            <Text style={styles.specLabel}>{t('equipment', 'diameter')}</Text>
                            <Text style={styles.specValue}>{set.diameter} mm</Text>
                          </View>
                          <View style={styles.specTrack}>
                            <View style={[styles.specFill, { width: `${Math.max(0, Math.min(100, ((Number(set.diameter) - 70.5) / (80 - 70.5)) * 100))}%`, backgroundColor: theme.primary }]} />
                          </View>
                          <View style={styles.specRange}>
                            <Text style={styles.specRangeText}>70.5 mm</Text>
                            <Text style={styles.specRangeText}>80.0 mm</Text>
                          </View>
                        </View>
                      ) : null}
                      {set.weight ? (
                        <View style={styles.specBar}>
                          <View style={styles.specHeader}>
                            <Text style={styles.specLabel}>{t('equipment', 'weight')}</Text>
                            <Text style={styles.specValue}>{set.weight} g</Text>
                          </View>
                          <View style={styles.specTrack}>
                            <View style={[styles.specFill, { width: `${Math.max(0, Math.min(100, ((set.weight - 650) / (800 - 650)) * 100))}%`, backgroundColor: theme.accent }]} />
                          </View>
                          <View style={styles.specRange}>
                            <Text style={styles.specRangeText}>650 g</Text>
                            <Text style={styles.specRangeText}>800 g</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  ) : null}

                  {/* Performance */}
                  {stats.matches > 0 ? (
                    <View style={styles.perfSection}>
                      <View style={styles.perfHeader}>
                        <MaterialIcons name="analytics" size={14} color={theme.textSecondary} />
                        <Text style={styles.perfTitle}>{t('equipment', 'performance')}</Text>
                        <Text style={styles.perfMatchCount}>{stats.matches} {t('equipment', 'matchesLabel')}{stats.challenges > 0 ? ` • ${stats.challenges} ${t('equipment', 'challengesLabel')}` : ''}</Text>
                      </View>
                      <View style={styles.perfBars}>
                        {[
                          { icon: 'emoji-events', label: t('equipment', 'winsLabel'), rate: stats.winRate, color: theme.success },
                          stats.totalTirs > 0 ? { icon: 'gps-fixed', label: t('equipment', 'shotsLabel'), rate: stats.tirRate, color: theme.accent } : null,
                          stats.totalPoints > 0 ? { icon: 'adjust', label: 'Points', rate: stats.pointRate, color: theme.primary } : null,
                          stats.tirsSuccess > 0 ? { icon: 'stars', label: 'Carreaux', rate: stats.carreauRate, color: theme.carreauColor } : null,
                        ].filter(Boolean).map((bar: any, i) => (
                          <View key={i} style={styles.perfBarRow}>
                            <MaterialIcons name={bar.icon} size={13} color={bar.color} />
                            <Text style={styles.perfBarLabel}>{bar.label}</Text>
                            <View style={styles.perfBarTrack}>
                              <View style={[styles.perfBarFill, { width: `${bar.rate}%`, backgroundColor: bar.color }]} />
                            </View>
                            <Text style={[styles.perfBarValue, { color: bar.color }]}>{bar.rate}%</Text>
                          </View>
                        ))}
                      </View>
                      {stats.evolution.length >= 2 ? (
                        <View style={styles.perfChartSection}>
                          <Text style={styles.perfChartTitle}>{t('equipment', 'winRateEvolution')}</Text>
                          <View style={styles.perfChartContainer}>
                            <View style={{ flex: 1 }}>
                              <MiniWinChart data={stats.evolution} chartWidth={chartWidth} />
                            </View>
                            <View style={styles.perfChartLabels}>
                              <Text style={styles.perfChartLabelText}>100%</Text>
                              <Text style={styles.perfChartLabelText}>50%</Text>
                              <Text style={styles.perfChartLabelText}>0%</Text>
                            </View>
                          </View>
                        </View>
                      ) : null}
                      <View style={styles.perfCounters}>
                        <View style={styles.perfCounter}>
                          <Text style={styles.perfCounterValue}>{stats.wins}/{stats.matches}</Text>
                          <Text style={styles.perfCounterLabel}>{t('equipment', 'winsOverMatches')}</Text>
                        </View>
                        {stats.totalTirs > 0 ? (
                          <View style={styles.perfCounter}>
                            <Text style={styles.perfCounterValue}>{stats.tirsSuccess}/{stats.totalTirs}</Text>
                            <Text style={styles.perfCounterLabel}>{t('equipment', 'shotsLabel')}</Text>
                          </View>
                        ) : null}
                        {stats.totalPoints > 0 ? (
                          <View style={styles.perfCounter}>
                            <Text style={styles.perfCounterValue}>{stats.pointsSuccess}/{stats.totalPoints}</Text>
                            <Text style={styles.perfCounterLabel}>Pts</Text>
                          </View>
                        ) : null}
                        {stats.carreaux > 0 ? (
                          <View style={styles.perfCounter}>
                            <Text style={[styles.perfCounterValue, { color: theme.carreauColor }]}>{stats.carreaux}</Text>
                            <Text style={styles.perfCounterLabel}>C</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ) : stats.challenges > 0 ? (
                    <View style={styles.statsRow}>
                      <View style={styles.statItem}>
                        <MaterialIcons name="flag" size={14} color={theme.accent} />
                        <Text style={styles.statValue}>{stats.challenges}</Text>
                        <Text style={styles.statLabel}>{t('equipment', 'challengesLabel')}</Text>
                      </View>
                    </View>
                  ) : null}

                  {/* Notes */}
                  {set.notes ? (
                    <View style={styles.notesRow}>
                      <MaterialIcons name="notes" size={14} color={theme.textMuted} />
                      <Text style={styles.notesText} numberOfLines={2}>{set.notes}</Text>
                    </View>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })
        )}

        {/* Ad Banner between sets */}
        {boulesSets.length >= 2 ? <AdBanner position="inline" /> : null}

        {/* Add button at bottom */}
        {boulesSets.length > 0 ? (
          <Pressable style={styles.addSetBtn} onPress={openNewForm}>
            <MaterialIcons name="add-circle-outline" size={22} color={theme.primary} />
            <Text style={styles.addSetBtnText}>{t('equipment', 'addBoulesSetFull')}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* Brand Picker Modal */}
      <Modal visible={showBrandPicker} animationType="slide" transparent onRequestClose={() => setShowBrandPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContent}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>{t('equipment', 'selectBrand')}</Text>
              <Pressable style={styles.pickerCloseBtn} onPress={() => setShowBrandPicker(false)}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={false}>
              {BOULES_BRANDS.map(brand => {
                const modelCount = getModelsByBrand(brand).length;
                const isSelected = formBrand === brand;
                const brandLogo = getBrandImage(brand);
                return (
                  <Pressable
                    key={brand}
                    style={[styles.pickerItem, isSelected && styles.pickerItemSelected]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setFormBrand(brand);
                      setFormModel('');
                      setFormCustomBrand('');
                      setFormCustomModel('');
                      setShowBrandPicker(false);
                    }}
                  >
                    <View style={[styles.pickerItemIcon, isSelected && { backgroundColor: theme.primary + '15' }, brandLogo ? { overflow: 'hidden' as const } : undefined]}>
                      {brandLogo ? (
                        <Image source={brandLogo} style={{ width: 44, height: 44, borderRadius: 12 }} contentFit="contain" transition={200} />
                      ) : (
                        <MaterialIcons name="sports-baseball" size={20} color={isSelected ? theme.primary : theme.textMuted} />
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerItemTitle, isSelected && { color: theme.primary }]}>{brand}</Text>
                      <Text style={styles.pickerItemSub}>{modelCount} {t('equipment', 'models')}</Text>
                    </View>
                    {isSelected ? <MaterialIcons name="check-circle" size={22} color={theme.primary} /> : null}
                  </Pressable>
                );
              })}
              {/* Other brand option */}
              <Pressable
                style={[styles.pickerItem, formBrand === '__other__' && styles.pickerItemSelected]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setFormBrand('__other__');
                  setFormModel('');
                  setShowBrandPicker(false);
                }}
              >
                <View style={[styles.pickerItemIcon, formBrand === '__other__' && { backgroundColor: theme.accent + '15' }]}>
                  <MaterialIcons name="edit" size={20} color={formBrand === '__other__' ? theme.accent : theme.textMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerItemTitle, formBrand === '__other__' && { color: theme.accent }]}>{t('equipment', 'otherBrand')}</Text>
                  <Text style={styles.pickerItemSub}>{language === 'fr' ? 'Saisie manuelle' : 'Manual entry'}</Text>
                </View>
                {formBrand === '__other__' ? <MaterialIcons name="check-circle" size={22} color={theme.accent} /> : null}
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Model Picker Modal */}
      <Modal visible={showModelPicker} animationType="slide" transparent onRequestClose={() => setShowModelPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerContent}>
            <View style={styles.pickerHeader}>
              <View>
                <Text style={styles.pickerTitle}>{t('equipment', 'selectModel')}</Text>
                <Text style={styles.pickerSubtitle}>{formBrand}</Text>
              </View>
              <Pressable style={styles.pickerCloseBtn} onPress={() => setShowModelPicker(false)}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={styles.pickerScroll} showsVerticalScrollIndicator={true} contentContainerStyle={{ paddingBottom: 40 }}>
              {availableModels.map(m => {
                const isSelected = formModel === m.model;
                return (
                  <Pressable
                    key={m.model}
                    style={[styles.pickerItem, styles.modelPickerItem, isSelected && styles.pickerItemSelected]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setFormModel(m.model);
                      // Auto-fill name if empty
                      if (!formName.trim()) setFormName(`${m.brand} ${m.model}`);
                      setShowModelPicker(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <Text style={[styles.pickerItemTitle, { fontSize: 16 }, isSelected && { color: theme.primary }]}>{m.model}</Text>
                        {isSelected ? <MaterialIcons name="check-circle" size={18} color={theme.primary} /> : null}
                      </View>
                      <View style={styles.modelSpecsRow}>
                        <View style={styles.modelSpecTag}>
                          <Text style={styles.modelSpecTagText}>{m.material}</Text>
                        </View>
                        <View style={styles.modelSpecTag}>
                          <Text style={styles.modelSpecTagText}>{m.hardness}</Text>
                        </View>
                      </View>
                      <View style={styles.modelSpecsRow}>
                        <View style={[styles.modelSpecTag, { backgroundColor: theme.primary + '10' }]}>
                          <MaterialIcons name="person" size={10} color={theme.primary} />
                          <Text style={[styles.modelSpecTagText, { color: theme.primary }]}>{m.targetUsage}</Text>
                        </View>
                      </View>
                      <Text style={styles.modelParticularity}>{m.particularities}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Form Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowForm(false); resetForm(); }}>
        <SafeAreaView edges={['top']} style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable style={styles.modalCloseBtn} onPress={() => { setShowForm(false); resetForm(); }}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
            <Text style={styles.modalTitle}>
              {editingSet ? t('equipment', 'editBoulesSet') : t('equipment', 'newSet')}
            </Text>
            <Pressable style={styles.modalSaveBtn} onPress={handleSave}>
              <Text style={styles.modalSaveBtnText}>{t('common', 'save')}</Text>
            </Pressable>
          </View>

          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView style={styles.formScroll} contentContainerStyle={styles.formContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {/* Photo */}
              <Pressable style={styles.photoPickerContainer} onPress={handlePickPhoto} disabled={uploadingPhoto}>
                {uploadingPhoto ? (
                  <View style={styles.photoPickerLoading}>
                    <ActivityIndicator size="large" color={theme.primary} />
                    <Text style={styles.photoPickerLoadingText}>{t('equipment', 'uploading')}</Text>
                  </View>
                ) : formPhoto ? (
                  <View style={styles.photoPickerFilled}>
                    <Image source={{ uri: formPhoto }} style={styles.photoPickerImage} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.default }} cachePolicy="memory-disk" />
                    <View style={styles.photoPickerOverlay}>
                      <View style={styles.photoPickerOverlayBadge}>
                        <MaterialIcons name="camera-alt" size={16} color="#FFF" />
                        <Text style={styles.photoPickerOverlayText}>{t('equipment', 'change')}</Text>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={styles.photoPickerEmpty}>
                    <View style={styles.photoPickerEmptyIcon}>
                      <MaterialIcons name="add-a-photo" size={28} color={theme.primary} />
                    </View>
                    <Text style={styles.photoPickerEmptyTitle}>{t('equipment', 'addPhoto')}</Text>
                    <Text style={styles.photoPickerEmptyDesc}>{t('equipment', 'photoOfBoules')}</Text>
                  </View>
                )}
              </Pressable>

              {/* Name */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('equipment', 'setNameRequired')}</Text>
                <TextInput style={styles.formInput} value={formName} onChangeText={setFormName} placeholder={t('equipment', 'setNamePlaceholder')} placeholderTextColor={theme.textMuted} autoFocus={!editingSet} />
              </View>

              {/* Brand Picker */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('equipment', 'brandLabel')}</Text>
                <Pressable
                  style={[styles.formInput, styles.formPickerBtn]}
                  onPress={() => { Haptics.selectionAsync(); setShowBrandPicker(true); }}
                >
                  <Text style={effectiveBrandDisplay ? styles.formPickerValue : styles.formPickerPlaceholder} numberOfLines={1}>
                    {effectiveBrandDisplay || t('equipment', 'selectBrand')}
                  </Text>
                  <MaterialIcons name="expand-more" size={22} color={theme.textMuted} />
                </Pressable>
              </View>

              {/* Model Picker — shown only when a known brand is selected */}
              {formBrand && formBrand !== '__other__' ? (
                <View style={styles.formField}>
                  <Text style={styles.formLabel}>{'MOD\u00c8LE'}</Text>
                  <Pressable
                    style={[styles.formInput, styles.formPickerBtn]}
                    onPress={() => { Haptics.selectionAsync(); setShowModelPicker(true); }}
                  >
                    <Text style={formModel ? styles.formPickerValue : styles.formPickerPlaceholder} numberOfLines={1}>
                      {formModel || t('equipment', 'selectModel')}
                    </Text>
                    <MaterialIcons name="expand-more" size={22} color={theme.textMuted} />
                  </Pressable>
                </View>
              ) : null}

              {/* Custom brand/model fields for "Other" */}
              {formBrand === '__other__' ? (
                <>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>{t('equipment', 'brandLabel')}</Text>
                    <TextInput style={styles.formInput} value={formCustomBrand} onChangeText={setFormCustomBrand} placeholder={t('equipment', 'otherBrandPlaceholder')} placeholderTextColor={theme.textMuted} />
                  </View>
                  <View style={styles.formField}>
                    <Text style={styles.formLabel}>{'MOD\u00c8LE'}</Text>
                    <TextInput style={styles.formInput} value={formCustomModel} onChangeText={setFormCustomModel} placeholder={t('equipment', 'otherModelPlaceholder')} placeholderTextColor={theme.textMuted} />
                  </View>
                </>
              ) : null}

              {/* Auto-filled specs from database */}
              {selectedDbModel ? (
                <View style={styles.specsAutoCard}>
                  <View style={styles.specsAutoHeader}>
                    <MaterialIcons name="auto-awesome" size={16} color={theme.primary} />
                    <Text style={styles.specsAutoTitle}>{t('equipment', 'modelSpecs')}</Text>
                  </View>
                  <View style={styles.specsAutoGrid}>
                    <View style={styles.specsAutoItem}>
                      <Text style={styles.specsAutoLabel}>{t('equipment', 'materialLabel')}</Text>
                      <Text style={styles.specsAutoValue}>{selectedDbModel.material}</Text>
                    </View>
                    <View style={styles.specsAutoItem}>
                      <Text style={styles.specsAutoLabel}>{t('equipment', 'hardnessLabel')}</Text>
                      <Text style={styles.specsAutoValue}>{selectedDbModel.hardness}</Text>
                    </View>
                    <View style={styles.specsAutoItem}>
                      <Text style={styles.specsAutoLabel}>{t('equipment', 'targetUsageLabel')}</Text>
                      <Text style={styles.specsAutoValue}>{selectedDbModel.targetUsage}</Text>
                    </View>
                    <View style={styles.specsAutoItem}>
                      <Text style={styles.specsAutoLabel}>{t('equipment', 'particularitiesLabel')}</Text>
                      <Text style={styles.specsAutoValue}>{selectedDbModel.particularities}</Text>
                    </View>
                  </View>
                </View>
              ) : null}

              {/* Diameter & Weight */}
              <View style={styles.formRow}>
                <View style={styles.formRowField}>
                  <Text style={styles.formLabel}>{t('equipment', 'diameterLabel')}</Text>
                  <TextInput style={styles.formInput} value={formDiameter} onChangeText={setFormDiameter} placeholder="70.5 - 80.0" placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" />
                </View>
                <View style={styles.formRowField}>
                  <Text style={styles.formLabel}>{t('equipment', 'weightLabel')}</Text>
                  <TextInput style={styles.formInput} value={formWeight} onChangeText={setFormWeight} placeholder="650 - 800" placeholderTextColor={theme.textMuted} keyboardType="number-pad" />
                </View>
              </View>

              {/* Serial Number */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('equipment', 'serialNumberLabel')}</Text>
                <TextInput style={styles.formInput} value={formSerialNumber} onChangeText={setFormSerialNumber} placeholder={t('equipment', 'optional')} placeholderTextColor={theme.textMuted} />
              </View>

              {/* Purchase Price */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>{t('equipment', 'purchasePriceLabel')}</Text>
                <TextInput style={styles.formInput} value={formPurchasePrice} onChangeText={setFormPurchasePrice} placeholder={t('equipment', 'purchasePricePlaceholder')} placeholderTextColor={theme.textMuted} keyboardType="decimal-pad" />
              </View>

              {/* Primary toggle */}
              <Pressable style={[styles.primaryToggle, formIsPrimary && styles.primaryToggleActive]} onPress={() => { Haptics.selectionAsync(); setFormIsPrimary(!formIsPrimary); }}>
                <MaterialIcons name={formIsPrimary ? 'star' : 'star-outline'} size={22} color={formIsPrimary ? theme.carreauColor : theme.textMuted} />
                <View style={styles.primaryToggleContent}>
                  <Text style={[styles.primaryToggleTitle, formIsPrimary && { color: theme.carreauColor }]}>{t('equipment', 'primarySet')}</Text>
                  <Text style={styles.primaryToggleDesc}>{t('equipment', 'primarySyncDesc')}</Text>
                </View>
                <View style={[styles.toggleIndicator, formIsPrimary && styles.toggleIndicatorActive]}>
                  <View style={[styles.toggleDot, formIsPrimary && styles.toggleDotActive]} />
                </View>
              </Pressable>

              {/* Notes */}
              <View style={styles.formField}>
                <Text style={styles.formLabel}>NOTES</Text>
                <TextInput style={[styles.formInput, styles.formTextArea]} value={formNotes} onChangeText={setFormNotes} placeholder={t('equipment', 'notesPlaceholder')} placeholderTextColor={theme.textMuted} multiline numberOfLines={3} textAlignVertical="top" />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.primary + '15', borderRadius: 20 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Hero
  heroCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.xl, padding: 24, alignItems: 'center', marginBottom: 20, ...theme.shadows.card },
  heroIconBg: { width: 72, height: 72, borderRadius: 20, backgroundColor: theme.accent + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  heroTitle: { fontSize: 22, fontWeight: '700', color: theme.textPrimary, marginBottom: 4 },
  heroSubtitle: { fontSize: 14, color: theme.textSecondary },
  heroPrimaryBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, backgroundColor: theme.carreauColor + '12', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  heroPrimaryText: { fontSize: 13, fontWeight: '600', color: theme.carreauColor },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIconBg: { width: 88, height: 88, borderRadius: 44, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: theme.textPrimary, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', maxWidth: 280, marginBottom: 24, lineHeight: 22 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: theme.borderRadius.lg },
  emptyBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },

  // Set card
  setCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 12, ...theme.shadows.card },
  setCardPrimary: { borderWidth: 2, borderColor: theme.accent + '40' },
  primaryBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.carreauColor, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 10 },
  primaryBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  setHeader: { flexDirection: 'row', alignItems: 'center' },
  setIconBg: { width: 48, height: 48, borderRadius: 14, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  setPhotoBg: { width: 48, height: 48, borderRadius: 14, overflow: 'hidden', marginRight: 12 },
  setPhoto: { width: 48, height: 48 },
  setInfo: { flex: 1 },
  setName: { fontSize: 16, fontWeight: '600', color: theme.textPrimary, marginBottom: 2 },
  setMeta: { fontSize: 13, color: theme.textSecondary },
  setActions: { flexDirection: 'row', gap: 8 },
  setActionBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  serialRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
  serialItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  serialText: { fontSize: 12, color: theme.textMuted, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },

  // Specs bars
  specsBars: { marginTop: 12, gap: 10 },
  specBar: { gap: 2 },
  specHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  specLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted },
  specTrack: { height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden' },
  specFill: { height: '100%', borderRadius: 3 },
  specValue: { fontSize: 12, fontWeight: '700', color: theme.textPrimary },
  specRange: { flexDirection: 'row', justifyContent: 'space-between' },
  specRangeText: { fontSize: 9, color: theme.textMuted },

  // Stats
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { fontSize: 13, fontWeight: '700', color: theme.textPrimary },
  statLabel: { fontSize: 11, color: theme.textMuted },

  // Performance section
  perfSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.border },
  perfHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  perfTitle: { fontSize: 12, fontWeight: '700', color: theme.textSecondary, flex: 1 },
  perfMatchCount: { fontSize: 10, color: theme.textMuted },
  perfBars: { gap: 6 },
  perfBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  perfBarLabel: { fontSize: 11, fontWeight: '600', color: theme.textSecondary, width: 52 },
  perfBarTrack: { flex: 1, height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden' },
  perfBarFill: { height: '100%', borderRadius: 3 },
  perfBarValue: { fontSize: 12, fontWeight: '700', minWidth: 34, textAlign: 'right' as const },
  perfChartSection: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '60' },
  perfChartTitle: { fontSize: 10, fontWeight: '600', color: theme.textMuted, marginBottom: 6, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  perfChartContainer: { flexDirection: 'row' as const, alignItems: 'center' as const },
  perfChartLabels: { width: 30, justifyContent: 'space-between' as const, height: 72, paddingVertical: 8, marginLeft: 4 },
  perfChartLabelText: { fontSize: 8, color: theme.textMuted, textAlign: 'right' as const },
  perfCounters: { flexDirection: 'row' as const, gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border + '60' },
  perfCounter: { flex: 1, alignItems: 'center' as const, backgroundColor: theme.backgroundSecondary, paddingVertical: 8, borderRadius: theme.borderRadius.sm },
  perfCounterValue: { fontSize: 13, fontWeight: '700', color: theme.textPrimary },
  perfCounterLabel: { fontSize: 9, color: theme.textMuted, marginTop: 2 },

  // Notes
  notesRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: theme.border },
  notesText: { flex: 1, fontSize: 12, color: theme.textSecondary, fontStyle: 'italic', lineHeight: 18 },

  // Add button
  addSetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: theme.primary + '10', paddingVertical: 16, borderRadius: theme.borderRadius.lg, borderWidth: 2, borderColor: theme.primary + '25', borderStyle: 'dashed', marginTop: 8 },
  addSetBtnText: { fontSize: 15, fontWeight: '600', color: theme.primary },

  // Modal
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  modalCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  modalSaveBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: theme.primary, borderRadius: theme.borderRadius.md },
  modalSaveBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  formScroll: { flex: 1 },
  formContent: { padding: 16, gap: 16 },
  formField: {},
  formLabel: { fontSize: 11, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 8 },
  formInput: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16, color: theme.textPrimary, ...theme.shadows.card },
  formTextArea: { minHeight: 80, paddingTop: 14 },
  formRow: { flexDirection: 'row', gap: 12 },
  formRowField: { flex: 1 },
  hardnessRow: { flexDirection: 'row', gap: 8 },
  hardnessChip: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: theme.surface, borderRadius: theme.borderRadius.md, borderWidth: 2, borderColor: 'transparent', ...theme.shadows.card },
  hardnessChipActive: { borderColor: theme.primary, backgroundColor: theme.primary + '10' },
  hardnessChipText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  hardnessChipTextActive: { color: theme.primary },

  // Photo picker
  photoPickerContainer: { borderRadius: theme.borderRadius.lg, overflow: 'hidden', ...theme.shadows.card },
  photoPickerLoading: { height: 160, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center', gap: 10 },
  photoPickerLoadingText: { fontSize: 13, color: theme.textSecondary },
  photoPickerFilled: { position: 'relative', height: 180 },
  photoPickerImage: { width: '100%', height: '100%' },
  photoPickerOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'flex-end' },
  photoPickerOverlayBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: theme.borderRadius.full },
  photoPickerOverlayText: { fontSize: 12, fontWeight: '600', color: '#FFF' },
  photoPickerEmpty: { height: 140, backgroundColor: theme.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: theme.primary + '25', borderStyle: 'dashed', borderRadius: theme.borderRadius.lg },
  photoPickerEmptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: theme.primary + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  photoPickerEmptyTitle: { fontSize: 14, fontWeight: '600', color: theme.primary },
  photoPickerEmptyDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },

  // Primary toggle
  primaryToggle: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, borderWidth: 2, borderColor: 'transparent', ...theme.shadows.card },
  primaryToggleActive: { borderColor: theme.carreauColor + '40', backgroundColor: theme.carreauColor + '08' },
  primaryToggleContent: { flex: 1 },
  primaryToggleTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  primaryToggleDesc: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  toggleIndicator: { width: 44, height: 26, borderRadius: 13, backgroundColor: theme.border, justifyContent: 'center', paddingHorizontal: 3 },
  toggleIndicatorActive: { backgroundColor: theme.carreauColor },
  toggleDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF' },
  toggleDotActive: { alignSelf: 'flex-end' },

  // Brand/Model picker button
  formPickerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  formPickerValue: { fontSize: 16, color: theme.textPrimary, fontWeight: '600', flex: 1 },
  formPickerPlaceholder: { fontSize: 16, color: theme.textMuted, flex: 1 },

  // Picker modals
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  pickerContent: { backgroundColor: theme.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', paddingBottom: Platform.OS === 'ios' ? 34 : 16 },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  pickerSubtitle: { fontSize: 13, color: theme.primary, fontWeight: '600', marginTop: 2 },
  pickerCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  pickerScroll: { paddingHorizontal: 16, paddingTop: 8 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, marginBottom: 4 },
  pickerItemSelected: { backgroundColor: theme.primary + '08' },
  pickerItemIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  pickerItemTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  pickerItemSub: { fontSize: 12, color: theme.textMuted, marginTop: 1 },
  modelPickerItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.border + '40' },
  modelSpecsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  modelSpecTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  modelSpecTagText: { fontSize: 11, fontWeight: '600', color: theme.textSecondary },
  modelParticularity: { fontSize: 12, color: theme.textMuted, fontStyle: 'italic', marginTop: 6 },

  // Auto-filled specs card
  specsAutoCard: { backgroundColor: theme.primary + '06', borderRadius: theme.borderRadius.lg, padding: 16, borderWidth: 1, borderColor: theme.primary + '20' },
  specsAutoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  specsAutoTitle: { fontSize: 13, fontWeight: '700', color: theme.primary },
  specsAutoGrid: { gap: 10 },
  specsAutoItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  specsAutoLabel: { fontSize: 10, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, width: 90, textTransform: 'uppercase' },
  specsAutoValue: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, flex: 1 },
});
