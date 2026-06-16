import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  Pressable,
  StyleSheet,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';

export interface MergeField {
  key: string;
  label: string;
  myValue: string;
  publicValue: string;
  icon?: string;
}

export interface MergeComparisonModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (selections: Record<string, 'mine' | 'public'>) => void;
  fields: MergeField[];
  myLabel: string;
  publicLabel: string;
  publicItemName: string;
  t: (section: string, key: string) => string;
}

const EMPTY = '\u2014';

function displayValue(val: string): string {
  if (!val || val.trim() === '' || val === '0' || val === 'false') return EMPTY;
  if (val === 'true') return '\u2713';
  return val;
}

function hasContent(val: string): boolean {
  return Boolean(val && val.trim() !== '' && val !== '0' && val !== 'false');
}

export default function MergeComparisonModal({
  visible,
  onClose,
  onApply,
  fields,
  myLabel,
  publicLabel,
  publicItemName,
  t,
}: MergeComparisonModalProps) {
  const insets = useSafeAreaInsets();

  // Default selection: if my value exists, keep mine; else use public
  const defaultSelections = useMemo(() => {
    const sel: Record<string, 'mine' | 'public'> = {};
    fields.forEach(f => {
      sel[f.key] = hasContent(f.myValue) ? 'mine' : hasContent(f.publicValue) ? 'public' : 'mine';
    });
    return sel;
  }, [fields]);

  const [selections, setSelections] = useState<Record<string, 'mine' | 'public'>>(defaultSelections);

  // Reset selections when fields change
  React.useEffect(() => {
    setSelections(defaultSelections);
  }, [defaultSelections]);

  const toggleField = useCallback((key: string, choice: 'mine' | 'public') => {
    Haptics.selectionAsync();
    setSelections(prev => ({ ...prev, [key]: choice }));
  }, []);

  const selectAll = useCallback((choice: 'mine' | 'public') => {
    Haptics.selectionAsync();
    const updated: Record<string, 'mine' | 'public'> = {};
    fields.forEach(f => { updated[f.key] = choice; });
    setSelections(updated);
  }, [fields]);

  const handleApply = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApply(selections);
  }, [selections, onApply]);

  // Count differences
  const diffCount = useMemo(() => {
    return fields.filter(f => {
      const mv = displayValue(f.myValue);
      const pv = displayValue(f.publicValue);
      return mv !== pv;
    }).length;
  }, [fields]);

  const publicSelectedCount = useMemo(() => {
    return Object.values(selections).filter(s => s === 'public').length;
  }, [selections]);

  // Separate fields into those with differences and those identical
  const { diffFields, sameFields } = useMemo(() => {
    const diff: MergeField[] = [];
    const same: MergeField[] = [];
    fields.forEach(f => {
      const mv = displayValue(f.myValue);
      const pv = displayValue(f.publicValue);
      if (mv !== pv) diff.push(f);
      else same.push(f);
    });
    return { diffFields: diff, sameFields: same };
  }, [fields]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.headerIcon}>
              <MaterialIcons name="compare-arrows" size={20} color={theme.primary} />
            </View>
            <View>
              <Text style={s.headerTitle}>{t('map', 'compareTitle')}</Text>
              <Text style={s.headerSubtitle}>{publicItemName}</Text>
            </View>
          </View>
          <Pressable style={s.closeBtn} onPress={onClose}>
            <MaterialIcons name="close" size={24} color={theme.textPrimary} />
          </Pressable>
        </View>

        {/* Summary bar */}
        <View style={s.summaryBar}>
          <View style={s.summaryItem}>
            <View style={[s.summaryDot, { backgroundColor: theme.primary }]} />
            <Text style={s.summaryText}>{diffCount} {t('map', 'differences')}</Text>
          </View>
          <View style={s.summaryItem}>
            <View style={[s.summaryDot, { backgroundColor: theme.success }]} />
            <Text style={s.summaryText}>{publicSelectedCount} {t('map', 'fromPublic')}</Text>
          </View>
        </View>

        {/* Column headers */}
        <View style={s.columnHeaders}>
          <View style={s.fieldLabelCol} />
          <Pressable style={[s.colHeader, s.colMine]} onPress={() => selectAll('mine')}>
            <MaterialIcons name="person" size={14} color={theme.primary} />
            <Text style={[s.colHeaderText, { color: theme.primary }]} numberOfLines={1}>{myLabel}</Text>
          </Pressable>
          <Pressable style={[s.colHeader, s.colPublic]} onPress={() => selectAll('public')}>
            <MaterialIcons name="public" size={14} color={theme.success} />
            <Text style={[s.colHeaderText, { color: theme.success }]} numberOfLines={1}>{publicLabel}</Text>
          </Pressable>
        </View>

        <ScrollView style={s.scrollView} contentContainerStyle={{ paddingBottom: insets.bottom + 100 }} showsVerticalScrollIndicator={false}>
          {/* Fields with differences */}
          {diffFields.length > 0 ? (
            <View style={s.sectionGroup}>
              <Text style={s.sectionGroupTitle}>{t('map', 'fieldsDifferent')}</Text>
              {diffFields.map(field => {
                const sel = selections[field.key] || 'mine';
                const myDisplay = displayValue(field.myValue);
                const pubDisplay = displayValue(field.publicValue);
                const myEmpty = !hasContent(field.myValue);
                const pubEmpty = !hasContent(field.publicValue);

                return (
                  <View key={field.key} style={s.fieldRow}>
                    <View style={s.fieldLabelCol}>
                      {field.icon ? <MaterialIcons name={field.icon as any} size={14} color={theme.textMuted} /> : null}
                      <Text style={s.fieldLabel} numberOfLines={1}>{field.label}</Text>
                    </View>
                    <Pressable
                      style={[
                        s.valueCell,
                        sel === 'mine' && s.valueCellSelected,
                        sel === 'mine' && { borderColor: theme.primary },
                        myEmpty && s.valueCellEmpty,
                      ]}
                      onPress={() => toggleField(field.key, 'mine')}
                    >
                      {sel === 'mine' ? (
                        <MaterialIcons name="radio-button-checked" size={14} color={theme.primary} style={s.radioIcon} />
                      ) : (
                        <MaterialIcons name="radio-button-unchecked" size={14} color={theme.textMuted} style={s.radioIcon} />
                      )}
                      <Text style={[s.valueText, myEmpty && s.valueTextEmpty, sel === 'mine' && s.valueTextSelected]} numberOfLines={2}>
                        {myDisplay}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[
                        s.valueCell,
                        sel === 'public' && s.valueCellSelected,
                        sel === 'public' && { borderColor: theme.success },
                        pubEmpty && s.valueCellEmpty,
                      ]}
                      onPress={() => toggleField(field.key, 'public')}
                    >
                      {sel === 'public' ? (
                        <MaterialIcons name="radio-button-checked" size={14} color={theme.success} style={s.radioIcon} />
                      ) : (
                        <MaterialIcons name="radio-button-unchecked" size={14} color={theme.textMuted} style={s.radioIcon} />
                      )}
                      <Text style={[s.valueText, pubEmpty && s.valueTextEmpty, sel === 'public' && s.valueTextSelectedPublic]} numberOfLines={2}>
                        {pubDisplay}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ) : null}

          {/* Identical fields */}
          {sameFields.length > 0 ? (
            <View style={s.sectionGroup}>
              <Text style={s.sectionGroupTitle}>{t('map', 'fieldsIdentical')}</Text>
              {sameFields.map(field => (
                <View key={field.key} style={[s.fieldRow, s.fieldRowIdentical]}>
                  <View style={s.fieldLabelCol}>
                    {field.icon ? <MaterialIcons name={field.icon as any} size={14} color={theme.textMuted} /> : null}
                    <Text style={s.fieldLabel} numberOfLines={1}>{field.label}</Text>
                  </View>
                  <View style={s.identicalCell}>
                    <MaterialIcons name="check" size={12} color={theme.success} />
                    <Text style={s.identicalText} numberOfLines={2}>{displayValue(field.myValue)}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        {/* Footer */}
        <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelBtnText}>{t('common', 'cancel')}</Text>
          </Pressable>
          <Pressable style={s.applyBtn} onPress={handleApply}>
            <MaterialIcons name="check" size={20} color="#FFF" />
            <Text style={s.applyBtnText}>{t('map', 'applyMerge')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: theme.surface,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, marginRight: 12 },
  headerIcon: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: theme.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  headerSubtitle: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  summaryBar: {
    flexDirection: 'row', gap: 16, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  summaryItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryDot: { width: 8, height: 8, borderRadius: 4 },
  summaryText: { fontSize: 12, color: theme.textSecondary, fontWeight: '500' },
  columnHeaders: {
    flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: theme.backgroundSecondary, gap: 6,
  },
  fieldLabelCol: {
    width: 90, flexDirection: 'row', alignItems: 'center', gap: 4, paddingRight: 4,
  },
  colHeader: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, paddingVertical: 6, borderRadius: theme.borderRadius.sm,
  },
  colMine: { backgroundColor: theme.primary + '10' },
  colPublic: { backgroundColor: theme.success + '10' },
  colHeaderText: { fontSize: 11, fontWeight: '700' },
  scrollView: { flex: 1, paddingHorizontal: 12 },
  sectionGroup: { marginTop: 12 },
  sectionGroupTitle: {
    fontSize: 11, fontWeight: '600', color: theme.textMuted, letterSpacing: 0.5,
    textTransform: 'uppercase', marginBottom: 8, paddingLeft: 4,
  },
  fieldRow: {
    flexDirection: 'row', gap: 6, marginBottom: 6, alignItems: 'stretch',
  },
  fieldRowIdentical: { opacity: 0.7 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: theme.textSecondary, flex: 1 },
  valueCell: {
    flex: 1, backgroundColor: theme.surface, borderRadius: theme.borderRadius.md,
    padding: 10, borderWidth: 2, borderColor: 'transparent',
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
  },
  valueCellSelected: { backgroundColor: theme.primary + '05' },
  valueCellEmpty: { opacity: 0.6 },
  radioIcon: { marginTop: 1 },
  valueText: { fontSize: 12, color: theme.textPrimary, flex: 1, lineHeight: 16 },
  valueTextEmpty: { color: theme.textMuted, fontStyle: 'italic' },
  valueTextSelected: { fontWeight: '600', color: theme.primary },
  valueTextSelectedPublic: { fontWeight: '600', color: theme.success },
  identicalCell: {
    flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.md,
    padding: 10, marginLeft: 6,
  },
  identicalText: { fontSize: 12, color: theme.textSecondary, flex: 1, lineHeight: 16 },
  footer: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 14,
    backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border,
  },
  cancelBtn: {
    paddingVertical: 14, paddingHorizontal: 20, borderRadius: theme.borderRadius.md,
    backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
  applyBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: theme.borderRadius.md, backgroundColor: theme.accent,
  },
  applyBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
});
