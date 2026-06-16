/**
 * Profile Completeness Card
 * Shows a 0-100% score with progress bar and suggestions for missing fields.
 */
import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';

interface ProfileField {
  key: string;
  label: string;
  icon: string;
  color: string;
  filled: boolean;
  weight: number; // importance weight
}

interface Props {
  player: {
    name?: string;
    avatar?: string;
    location?: { city?: string; latitude?: number; longitude?: number } | null;
    country?: string;
    club?: string;
    clubId?: string;
    role?: string;
    experience?: string;
    handedness?: string;
    phone?: string;
    email?: string;
    terrainId?: string;
    terrainName?: string;
    boules?: { name?: string; diameter?: number; weight?: number } | null;
    isPublic?: boolean;
  };
  language: string;
  compact?: boolean;
}

export default function ProfileCompletenessCard({ player, language, compact = false }: Props) {
  const isFr = language === 'fr';

  const fields: ProfileField[] = useMemo(() => [
    { key: 'name', label: isFr ? 'Nom' : 'Name', icon: 'person', color: theme.primary, filled: !!player.name?.trim(), weight: 15 },
    { key: 'avatar', label: isFr ? 'Photo' : 'Photo', icon: 'camera-alt', color: '#EC4899', filled: !!player.avatar, weight: 10 },
    { key: 'city', label: isFr ? 'Localisation' : 'Location', icon: 'place', color: '#3B82F6', filled: !!player.location?.city, weight: 15 },
    { key: 'club', label: 'Club', icon: 'home', color: theme.accent, filled: !!player.club || !!player.clubId, weight: 10 },
    { key: 'role', label: isFr ? 'Role' : 'Role', icon: 'sports', color: '#F97316', filled: !!player.role, weight: 10 },
    { key: 'experience', label: isFr ? 'Experience' : 'Experience', icon: 'timeline', color: '#9333EA', filled: !!player.experience, weight: 8 },
    { key: 'handedness', label: isFr ? 'Lateralite' : 'Handedness', icon: 'front-hand', color: '#6366F1', filled: !!player.handedness, weight: 5 },
    { key: 'terrain', label: isFr ? 'Terrain' : 'Court', icon: 'sports-soccer', color: theme.success, filled: !!player.terrainId || !!player.terrainName, weight: 8 },
    { key: 'boules', label: isFr ? 'Boules' : 'Boules', icon: 'sports-baseball', color: '#D97706', filled: !!(player.boules?.name || player.boules?.diameter), weight: 7 },
    { key: 'contact', label: 'Contact', icon: 'contact-phone', color: '#0EA5E9', filled: !!player.phone || !!player.email, weight: 7 },
    { key: 'public', label: isFr ? 'Visibilite' : 'Visibility', icon: 'public', color: '#22C55E', filled: !!player.isPublic, weight: 5 },
  ], [player, isFr]);

  const { score, filledCount, totalCount, missingFields } = useMemo(() => {
    const totalWeight = fields.reduce((sum, f) => sum + f.weight, 0);
    const filledWeight = fields.filter(f => f.filled).reduce((sum, f) => sum + f.weight, 0);
    const score = Math.round((filledWeight / totalWeight) * 100);
    const filled = fields.filter(f => f.filled).length;
    const missing = fields.filter(f => !f.filled);
    return { score, filledCount: filled, totalCount: fields.length, missingFields: missing };
  }, [fields]);

  const scoreColor = score >= 80 ? '#22C55E' : score >= 60 ? '#F59E0B' : score >= 40 ? '#D97706' : '#EF4444';
  const scoreLabel = score >= 100 ? (isFr ? 'Complet' : 'Complete')
    : score >= 80 ? (isFr ? 'Excellent' : 'Excellent')
    : score >= 60 ? (isFr ? 'Bien' : 'Good')
    : score >= 40 ? (isFr ? 'En cours' : 'In Progress')
    : (isFr ? 'A completer' : 'Incomplete');

  // XP reward milestones
  const nextReward = score < 50 ? { target: 50, xp: 50, badge: 'profil_debut' }
    : score < 75 ? { target: 75, xp: 100, badge: 'profil_avance' }
    : score < 100 ? { target: 100, xp: 150, badge: 'profil_complet' }
    : null;

  if (score >= 100 && compact) return null;

  return (
    <Animated.View entering={FadeInDown.duration(350)} style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.iconBg, { backgroundColor: scoreColor + '15' }]}>
          <MaterialIcons name={score >= 100 ? 'check-circle' : 'account-circle'} size={20} color={scoreColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{isFr ? 'Completude du profil' : 'Profile Completeness'}</Text>
          <Text style={[styles.scoreLabel, { color: scoreColor }]}>{scoreLabel} — {filledCount}/{totalCount}</Text>
        </View>
        <View style={[styles.scoreBadge, { backgroundColor: scoreColor + '15' }]}>
          <Text style={[styles.scoreValue, { color: scoreColor }]}>{score}%</Text>
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${score}%`, backgroundColor: scoreColor }]} />
      </View>

      {/* Field dots */}
      <View style={styles.dotsRow}>
        {fields.map(f => (
          <View
            key={f.key}
            style={[styles.dot, f.filled ? { backgroundColor: f.color } : { backgroundColor: theme.border, borderWidth: 1, borderColor: theme.textMuted + '30' }]}
          />
        ))}
      </View>

      {/* Missing fields suggestions */}
      {missingFields.length > 0 && !compact ? (
        <View style={styles.suggestionsWrap}>
          <Text style={styles.suggestionsTitle}>
            {isFr ? 'Suggestions pour ameliorer' : 'Suggestions to improve'}
          </Text>
          {missingFields.slice(0, 3).map(f => (
            <Pressable
              key={f.key}
              style={styles.suggestionItem}
              onPress={() => {
                Haptics.selectionAsync();
                if (f.key === 'public') {
                  // Toggle is on same page, just scroll
                } else {
                  router.push(`/player/edit/${player.name ? 'me' : ''}` as any);
                }
              }}
            >
              <View style={[styles.suggestionIcon, { backgroundColor: f.color + '12' }]}>
                <MaterialIcons name={f.icon as any} size={14} color={f.color} />
              </View>
              <Text style={styles.suggestionText}>
                {isFr ? `Ajouter ${f.label.toLowerCase()}` : `Add ${f.label.toLowerCase()}`}
              </Text>
              <MaterialIcons name="add" size={16} color={f.color} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* XP reward milestone indicator */}
      {nextReward ? (
        <View style={styles.rewardRow}>
          <View style={[styles.rewardIcon, { backgroundColor: '#F59E0B15' }]}>
            <MaterialIcons name="star" size={14} color="#F59E0B" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.rewardTitle}>
              {isFr ? `Prochain palier : ${nextReward.target}%` : `Next milestone: ${nextReward.target}%`}
            </Text>
            <Text style={styles.rewardDesc}>
              {isFr ? `+${nextReward.xp} XP et badge` : `+${nextReward.xp} XP and badge`} "{nextReward.badge.replace(/_/g, ' ')}"
            </Text>
          </View>
          <View style={[styles.rewardXpBadge, { backgroundColor: '#F59E0B15' }]}>
            <Text style={styles.rewardXpText}>+{nextReward.xp} XP</Text>
          </View>
        </View>
      ) : null}

      {/* CTA when low score */}
      {score < 60 ? (
        <Pressable
          style={styles.cta}
          onPress={() => {
            Haptics.selectionAsync();
            router.push({ pathname: '/profile', params: { edit: 'true' } } as any);
          }}
        >
          <MaterialIcons name="edit" size={16} color="#FFF" />
          <Text style={styles.ctaText}>{isFr ? 'Completer mon profil' : 'Complete my profile'}</Text>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, ...theme.shadows.card },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  iconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  scoreLabel: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  scoreBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12 },
  scoreValue: { fontSize: 18, fontWeight: '900' },
  progressTrack: { height: 6, backgroundColor: theme.backgroundSecondary, borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  progressFill: { height: '100%', borderRadius: 3 },
  dotsRow: { flexDirection: 'row', justifyContent: 'center', gap: 5, marginBottom: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  suggestionsWrap: { borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10, gap: 6 },
  suggestionsTitle: { fontSize: 11, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  suggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.backgroundSecondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  suggestionIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  suggestionText: { flex: 1, fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: theme.primary, paddingVertical: 12, borderRadius: 12, marginTop: 10 },
  ctaText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F59E0B08', borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#F59E0B20' },
  rewardIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rewardTitle: { fontSize: 12, fontWeight: '700', color: '#F59E0B' },
  rewardDesc: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  rewardXpBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  rewardXpText: { fontSize: 12, fontWeight: '800', color: '#F59E0B' },
});
