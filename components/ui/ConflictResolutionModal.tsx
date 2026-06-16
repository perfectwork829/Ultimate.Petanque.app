import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';

export interface ConflictData {
  table: string;
  itemId: string;
  operationType: 'update' | 'insert';
  localFields: Record<string, any>;
  serverFields: Record<string, any>;
  /** Human-readable item name (e.g., player name) */
  itemName?: string;
}

interface ConflictResolutionModalProps {
  visible: boolean;
  conflict: ConflictData | null;
  onResolve: (choice: 'local' | 'server' | 'skip') => void;
  remaining: number;
}

const TABLE_LABELS: Record<string, { fr: string; en: string; icon: string }> = {
  players: { fr: 'Joueur', en: 'Player', icon: 'person' },
  clubs: { fr: 'Club', en: 'Club', icon: 'location-city' },
  terrains: { fr: 'Terrain', en: 'Court', icon: 'sports-soccer' },
  tournaments: { fr: 'Tournoi', en: 'Tournament', icon: 'emoji-events' },
  matches: { fr: 'Match', en: 'Match', icon: 'sports' },
  challenges: { fr: 'Challenge', en: 'Challenge', icon: 'flag' },
};

const FIELD_LABELS: Record<string, { fr: string; en: string }> = {
  name: { fr: 'Nom', en: 'Name' },
  nickname: { fr: 'Surnom', en: 'Nickname' },
  club: { fr: 'Club', en: 'Club' },
  role: { fr: 'Poste', en: 'Role' },
  level: { fr: 'Niveau', en: 'Level' },
  city: { fr: 'Ville', en: 'City' },
  address: { fr: 'Adresse', en: 'Address' },
  type: { fr: 'Type', en: 'Type' },
  status: { fr: 'Statut', en: 'Status' },
  description: { fr: 'Description', en: 'Description' },
  format: { fr: 'Format', en: 'Format' },
  winner: { fr: 'Gagnant', en: 'Winner' },
  date: { fr: 'Date', en: 'Date' },
  mode: { fr: 'Mode', en: 'Mode' },
  phone: { fr: 'Telephone', en: 'Phone' },
  email: { fr: 'Email', en: 'Email' },
};

function formatValue(value: any): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 80);
  return String(value).slice(0, 80);
}

export default function ConflictResolutionModal({
  visible,
  conflict,
  onResolve,
  remaining,
}: ConflictResolutionModalProps) {
  const { t, language } = useLanguage();

  if (!conflict) return null;

  const tableInfo = TABLE_LABELS[conflict.table] || { fr: conflict.table, en: conflict.table, icon: 'storage' };
  const tableLabel = language === 'fr' ? tableInfo.fr : tableInfo.en;

  // Get all fields that differ
  const allKeys = new Set([
    ...Object.keys(conflict.localFields),
    ...Object.keys(conflict.serverFields),
  ]);
  // Filter out internal fields
  const ignoredFields = ['updated_at', 'created_at', 'user_id', 'id'];
  const diffKeys = Array.from(allKeys).filter(key => {
    if (ignoredFields.includes(key)) return false;
    const local = JSON.stringify(conflict.localFields[key]);
    const server = JSON.stringify(conflict.serverFields[key]);
    return local !== server;
  });

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => onResolve('skip')}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.conflictBadge}>
              <MaterialIcons name="sync-problem" size={16} color="#FFF" />
            </View>
            <Text style={styles.headerTitle}>
              {t('conflict', 'detected')}
            </Text>
          </View>
          {remaining > 0 ? (
            <View style={styles.remainingBadge}>
              <Text style={styles.remainingText}>+{remaining}</Text>
            </View>
          ) : null}
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Info Card */}
          <Animated.View entering={FadeInDown.duration(300)} style={styles.infoCard}>
            <View style={[styles.infoIcon, { backgroundColor: theme.warning + '15' }]}>
              <MaterialIcons name={tableInfo.icon as any} size={28} color={theme.warning} />
            </View>
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>
                {conflict.itemName || tableLabel}
              </Text>
              <Text style={styles.infoSubtitle}>
                {tableLabel} · {diffKeys.length} {t('conflict', 'conflictingFields')}
              </Text>
            </View>
          </Animated.View>

          {/* Description */}
          <View style={styles.descriptionCard}>
            <MaterialIcons name="info-outline" size={18} color={theme.primary} />
            <Text style={styles.descriptionText}>
              {language === 'fr'
                ? 'Cet enregistrement a ete modifie sur le serveur pendant que vous etiez hors-ligne. Choisissez quelle version conserver.'
                : 'This record was modified on the server while you were offline. Choose which version to keep.'}
            </Text>
          </View>

          {/* Comparison Table */}
          <View style={styles.comparisonContainer}>
            {/* Column Headers */}
            <View style={styles.comparisonHeader}>
              <View style={styles.comparisonFieldCol}>
                <Text style={styles.comparisonColLabel}>
                  {t('conflict', 'fieldLabel')}
                </Text>
              </View>
              <View style={[styles.comparisonValueCol, styles.localCol]}>
                <MaterialIcons name="phone-android" size={14} color={theme.primary} />
                <Text style={[styles.comparisonColLabel, { color: theme.primary }]}>
                  {t('conflict', 'localLabel')}
                </Text>
              </View>
              <View style={[styles.comparisonValueCol, styles.serverCol]}>
                <MaterialIcons name="cloud" size={14} color={theme.success} />
                <Text style={[styles.comparisonColLabel, { color: theme.success }]}>
                  {t('conflict', 'serverLabel')}
                </Text>
              </View>
            </View>

            {/* Rows */}
            {diffKeys.map((key) => {
              const fieldLabel = FIELD_LABELS[key]
                ? (language === 'fr' ? FIELD_LABELS[key].fr : FIELD_LABELS[key].en)
                : key;
              return (
                <View key={key} style={styles.comparisonRow}>
                  <View style={styles.comparisonFieldCol}>
                    <Text style={styles.comparisonFieldName} numberOfLines={1}>{fieldLabel}</Text>
                  </View>
                  <View style={[styles.comparisonValueCol, styles.localCol]}>
                    <Text style={styles.comparisonValue} numberOfLines={2}>
                      {formatValue(conflict.localFields[key])}
                    </Text>
                  </View>
                  <View style={[styles.comparisonValueCol, styles.serverCol]}>
                    <Text style={styles.comparisonValue} numberOfLines={2}>
                      {formatValue(conflict.serverFields[key])}
                    </Text>
                  </View>
                </View>
              );
            })}

            {diffKeys.length === 0 ? (
              <View style={styles.noDiffRow}>
                <Text style={styles.noDiffText}>
                  {language === 'fr'
                    ? 'Timestamps differents uniquement'
                    : 'Only timestamps differ'}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.localBtn, pressed && styles.actionBtnPressed]}
            onPress={() => onResolve('local')}
          >
            <MaterialIcons name="phone-android" size={20} color="#FFF" />
            <Text style={styles.actionBtnText}>
              {t('conflict', 'keepLocal')}
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.serverBtn, pressed && styles.actionBtnPressed]}
            onPress={() => onResolve('server')}
          >
            <MaterialIcons name="cloud" size={20} color="#FFF" />
            <Text style={styles.actionBtnText}>
              {t('conflict', 'keepServer')}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
          onPress={() => onResolve('skip')}
        >
          <MaterialIcons name="skip-next" size={18} color={theme.textSecondary} />
          <Text style={styles.skipBtnText}>
            {t('conflict', 'skipConflict')}
          </Text>
        </Pressable>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.backgroundSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  conflictBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  remainingBadge: {
    backgroundColor: theme.warning + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  remainingText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.warning,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 8,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 16,
    marginBottom: 12,
    ...theme.shadows.card,
  },
  infoIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.textPrimary,
    marginBottom: 2,
  },
  infoSubtitle: {
    fontSize: 13,
    color: theme.textSecondary,
  },
  descriptionCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: theme.primary + '08',
    borderRadius: theme.borderRadius.md,
    padding: 14,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: theme.primary,
  },
  descriptionText: {
    flex: 1,
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 20,
  },
  comparisonContainer: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  comparisonHeader: {
    flexDirection: 'row',
    backgroundColor: theme.backgroundSecondary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  comparisonFieldCol: {
    flex: 1,
    justifyContent: 'center',
  },
  comparisonValueCol: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    justifyContent: 'center',
  },
  localCol: {},
  serverCol: {},
  comparisonColLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  comparisonRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.borderLight,
  },
  comparisonFieldName: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
  },
  comparisonValue: {
    fontSize: 12,
    color: theme.textSecondary,
    textAlign: 'center',
  },
  noDiffRow: {
    padding: 20,
    alignItems: 'center',
  },
  noDiffText: {
    fontSize: 13,
    color: theme.textMuted,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: theme.borderRadius.lg,
  },
  actionBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  localBtn: {
    backgroundColor: theme.primary,
  },
  serverBtn: {
    backgroundColor: theme.success,
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingBottom: 20,
  },
  skipBtnText: {
    fontSize: 14,
    color: theme.textSecondary,
  },
});
