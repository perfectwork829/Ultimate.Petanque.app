/**
 * EditConflictModal
 * Visual diff modal shown when a shared item has been modified by another user
 * while the current user was editing. Shows field-by-field comparison and
 * allows choosing which version to keep.
 */
import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { DiffEntry } from '@/services/collaborativeEditService';

interface EditConflictModalProps {
  visible: boolean;
  diffs: DiffEntry[];
  language: 'fr' | 'en';
  onKeepMine: () => void;
  onKeepTheirs: () => void;
  onCancel: () => void;
}

export default function EditConflictModal({
  visible,
  diffs,
  language,
  onKeepMine,
  onKeepTheirs,
  onCancel,
}: EditConflictModalProps) {
  const fr = language === 'fr';

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onCancel}
    >
      <View style={s.overlay}>
        <SafeAreaView style={s.safeArea}>
          <Animated.View entering={FadeIn.duration(200)} style={s.container}>
            {/* Header */}
            <View style={s.header}>
              <View style={s.headerIcon}>
                <MaterialIcons name="warning-amber" size={28} color={theme.warning} />
              </View>
              <Text style={s.headerTitle}>
                {fr ? 'Conflit de modification' : 'Edit Conflict'}
              </Text>
              <Pressable style={s.headerClose} onPress={onCancel}>
                <MaterialIcons name="close" size={22} color={theme.textMuted} />
              </Pressable>
            </View>

            <Text style={s.description}>
              {fr
                ? 'Un autre joueur a modifie cet element pendant votre edition. Comparez les differences et choisissez la version a conserver.'
                : 'Another player modified this item while you were editing. Compare the differences and choose which version to keep.'}
            </Text>

            {/* Diff Legend */}
            <View style={s.legend}>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: theme.success }]} />
                <Text style={s.legendText}>
                  {fr ? 'Vos modifications' : 'Your changes'}
                </Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: theme.primary }]} />
                <Text style={s.legendText}>
                  {fr ? 'Version serveur' : 'Server version'}
                </Text>
              </View>
            </View>

            {/* Diff List */}
            <ScrollView
              style={s.diffScroll}
              contentContainerStyle={s.diffContent}
              showsVerticalScrollIndicator={false}
            >
              {diffs.map((diff, index) => (
                <Animated.View
                  key={diff.field}
                  entering={FadeInDown.duration(200).delay(index * 50)}
                  style={s.diffCard}
                >
                  <Text style={s.diffLabel}>{diff.label}</Text>
                  <View style={s.diffValues}>
                    {/* Local (yours) */}
                    <View style={s.diffValueBox}>
                      <View style={s.diffValueHeader}>
                        <MaterialIcons name="person" size={12} color={theme.success} />
                        <Text style={[s.diffValueHeaderText, { color: theme.success }]}>
                          {fr ? 'Vous' : 'You'}
                        </Text>
                      </View>
                      <View style={[s.diffValueContent, { borderColor: theme.success + '40', backgroundColor: theme.success + '08' }]}>
                        <Text style={s.diffValueText} numberOfLines={4}>
                          {diff.localValue}
                        </Text>
                      </View>
                    </View>

                    {/* Arrow */}
                    <View style={s.diffArrow}>
                      <MaterialIcons name="compare-arrows" size={18} color={theme.textMuted} />
                    </View>

                    {/* Server (theirs) */}
                    <View style={s.diffValueBox}>
                      <View style={s.diffValueHeader}>
                        <MaterialIcons name="cloud" size={12} color={theme.primary} />
                        <Text style={[s.diffValueHeaderText, { color: theme.primary }]}>
                          {fr ? 'Serveur' : 'Server'}
                        </Text>
                      </View>
                      <View style={[s.diffValueContent, { borderColor: theme.primary + '40', backgroundColor: theme.primary + '08' }]}>
                        <Text style={s.diffValueText} numberOfLines={4}>
                          {diff.serverValue}
                        </Text>
                      </View>
                    </View>
                  </View>
                </Animated.View>
              ))}

              {diffs.length === 0 ? (
                <View style={s.noDiffs}>
                  <MaterialIcons name="check-circle" size={32} color={theme.success} />
                  <Text style={s.noDiffsText}>
                    {fr ? 'Aucune difference detectee' : 'No differences detected'}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            {/* Summary */}
            <View style={s.summaryBar}>
              <MaterialIcons name="info-outline" size={14} color={theme.textMuted} />
              <Text style={s.summaryText}>
                {fr
                  ? `${diffs.length} champ${diffs.length > 1 ? 's' : ''} en conflit`
                  : `${diffs.length} conflicting field${diffs.length > 1 ? 's' : ''}`}
              </Text>
            </View>

            {/* Action Buttons */}
            <View style={s.actions}>
              <Pressable
                style={({ pressed }) => [s.cancelBtn, pressed && { opacity: 0.7 }]}
                onPress={onCancel}
              >
                <Text style={s.cancelBtnText}>
                  {fr ? 'Annuler' : 'Cancel'}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [s.theirsBtn, pressed && { opacity: 0.7 }]}
                onPress={onKeepTheirs}
              >
                <MaterialIcons name="cloud-download" size={16} color={theme.primary} />
                <Text style={s.theirsBtnText}>
                  {fr ? 'Garder serveur' : 'Keep server'}
                </Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [s.mineBtn, pressed && { opacity: 0.7 }]}
                onPress={onKeepMine}
              >
                <MaterialIcons name="check" size={16} color="#FFF" />
                <Text style={s.mineBtnText}>
                  {fr ? 'Garder les miennes' : 'Keep mine'}
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
  },
  container: {
    backgroundColor: theme.surface,
    borderRadius: 24,
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: theme.warning + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: theme.textPrimary,
  },
  headerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    fontSize: 13,
    color: theme.textSecondary,
    lineHeight: 19,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  diffScroll: {
    maxHeight: 320,
  },
  diffContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  diffCard: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: 14,
    padding: 12,
  },
  diffLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.textSecondary,
    letterSpacing: 0.3,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  diffValues: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
  },
  diffValueBox: {
    flex: 1,
  },
  diffValueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  diffValueHeaderText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  diffValueContent: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  diffValueText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textPrimary,
    lineHeight: 18,
  },
  diffArrow: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 18,
  },
  noDiffs: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  noDiffsText: {
    fontSize: 14,
    color: theme.textSecondary,
    fontWeight: '600',
  },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.backgroundSecondary,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: theme.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.textSecondary,
  },
  theirsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.primary + '12',
    borderWidth: 1.5,
    borderColor: theme.primary + '30',
  },
  theirsBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
  },
  mineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: theme.success,
  },
  mineBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFF',
  },
});
