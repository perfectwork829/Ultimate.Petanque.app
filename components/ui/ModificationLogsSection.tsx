import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { getModificationLogs, ModificationLog, ModLogItemType, isFieldRevertable, revertFieldChange, revertAllChanges } from '@/services/modificationLogService';

interface ModificationLogsSectionProps {
  itemType: ModLogItemType;
  itemId: string;
  isOwner: boolean;
  onReverted?: () => void;
}

export default function ModificationLogsSection({ itemType, itemId, isOwner, onReverted }: ModificationLogsSectionProps) {
  const { t, language } = useLanguage();
  const [logs, setLogs] = useState<ModificationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [revertingField, setRevertingField] = useState<string | null>(null);
  const [revertingAllLogId, setRevertingAllLogId] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!isOwner || !itemId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { logs: fetchedLogs } = await getModificationLogs(itemType, itemId, 20);
    setLogs(fetchedLogs);
    setLoading(false);
  }, [itemType, itemId, isOwner]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  if (!isOwner) return null;
  if (!loading && logs.length === 0) return null;

  const displayedLogs = showAll ? logs : logs.slice(0, 3);

  const formatTimeAgo = (dateStr: string): string => {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return t('share', 'justNow');
    if (diffMin < 60) return language === 'fr' ? `Il y a ${diffMin} min` : `${diffMin} min ago`;
    if (diffH < 24) return language === 'fr' ? `Il y a ${diffH}h` : `${diffH}h ago`;
    if (diffD < 7) return language === 'fr' ? `Il y a ${diffD}j` : `${diffD}d ago`;
    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'short',
    });
  };

  const formatFullDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getFieldLabel = (field: string): string => {
    const translated = t('modificationLogs', field);
    return translated !== field ? translated : field;
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined || value === '') return language === 'fr' ? '(vide)' : '(empty)';
    if (typeof value === 'boolean') return value ? (language === 'fr' ? 'Oui' : 'Yes') : (language === 'fr' ? 'Non' : 'No');
    if (typeof value === 'object') {
      if (Array.isArray(value)) return value.length > 0 ? `[${value.length} ${language === 'fr' ? 'elements' : 'items'}]` : '[]';
      return JSON.stringify(value).substring(0, 80);
    }
    const str = String(value);
    return str.length > 60 ? str.substring(0, 57) + '...' : str;
  };

  const handleToggleExpand = (logId: string) => {
    Haptics.selectionAsync();
    setExpandedLogId(prev => prev === logId ? null : logId);
  };

  if (loading) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitleText}>{t('modificationLogs', 'recentModifications')}</Text>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.primary} />
        </View>
      </View>
    );
  }

  return (
    <Animated.View entering={FadeInDown.duration(400)} style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <MaterialIcons name="history" size={16} color={theme.textSecondary} />
          <Text style={styles.sectionTitleText}>{t('modificationLogs', 'recentModifications')}</Text>
        </View>
        <View style={styles.logCountBadge}>
          <Text style={styles.logCountText}>{logs.length}</Text>
        </View>
      </View>

      <View style={styles.logsCard}>
        {displayedLogs.map((log, index) => {
          const changesCount = log.changes.length;
          const isExpanded = expandedLogId === log.id;
          const changesPreview = log.changes
            .slice(0, 3)
            .map(c => getFieldLabel(c.field))
            .join(', ');

          return (
            <View key={log.id}>
              <Pressable
                style={[
                  styles.logItem,
                  index < displayedLogs.length - 1 && !isExpanded && styles.logItemBorder,
                ]}
                onPress={() => handleToggleExpand(log.id)}
              >
                {/* Modifier avatar */}
                <View style={styles.logAvatar}>
                  <Text style={styles.logAvatarText}>
                    {(log.modifierName || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>

                {/* Log content */}
                <View style={styles.logContent}>
                  <View style={styles.logHeaderRow}>
                    <Text style={styles.logModifierName} numberOfLines={1}>
                      {log.modifierName || t('share', 'userFallback')}
                    </Text>
                    <Text style={styles.logTime}>{formatTimeAgo(log.createdAt)}</Text>
                  </View>

                  <View style={styles.logChangesRow}>
                    <MaterialIcons name="edit" size={12} color={theme.textMuted} />
                    <Text style={styles.logChangesText} numberOfLines={isExpanded ? undefined : 2}>
                      {changesCount === 1
                        ? `${t('modificationLogs', 'fieldChanged')} ${changesPreview}`
                        : `${changesCount} ${t('modificationLogs', 'fieldsChanged')} : ${changesPreview}${changesCount > 3 ? '...' : ''}`}
                    </Text>
                  </View>
                </View>

                {/* Expand indicator */}
                <MaterialIcons
                  name={isExpanded ? 'expand-less' : 'expand-more'}
                  size={18}
                  color={theme.textMuted}
                  style={{ marginLeft: 4 }}
                />
              </Pressable>

              {/* Expanded diff view */}
              {isExpanded ? (
                <Animated.View entering={FadeIn.duration(200)} style={styles.diffContainer}>
                  {/* Full date */}
                  <Text style={styles.diffFullDate}>{formatFullDate(log.createdAt)}</Text>

                  {/* Modifier email */}
                  {log.modifierEmail ? (
                    <View style={styles.diffModifierRow}>
                      <MaterialIcons name="email" size={12} color={theme.textMuted} />
                      <Text style={styles.diffModifierEmail}>{log.modifierEmail}</Text>
                    </View>
                  ) : null}

                  {/* Field diffs */}
                  {log.changes.map((change, cidx) => (
                    <View key={cidx} style={styles.diffFieldCard}>
                      <View style={styles.diffFieldHeader}>
                        <MaterialIcons name="label" size={12} color={theme.primary} />
                        <Text style={styles.diffFieldName}>{getFieldLabel(change.field)}</Text>
                      </View>

                      {/* Old value */}
                      {change.oldValue !== undefined ? (
                        <View style={styles.diffOldRow}>
                          <View style={styles.diffOldIndicator} />
                          <View style={styles.diffValueBox}>
                            <Text style={styles.diffOldLabel}>
                              {language === 'fr' ? 'Avant' : 'Before'}
                            </Text>
                            <Text style={styles.diffOldValue} numberOfLines={3}>
                              {formatValue(change.oldValue)}
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      {/* New value */}
                      {change.newValue !== undefined ? (
                        <View style={styles.diffNewRow}>
                          <View style={styles.diffNewIndicator} />
                          <View style={styles.diffValueBox}>
                            <Text style={styles.diffNewLabel}>
                              {language === 'fr' ? 'Apres' : 'After'}
                            </Text>
                            <Text style={styles.diffNewValue} numberOfLines={3}>
                              {formatValue(change.newValue)}
                            </Text>
                          </View>
                        </View>
                      ) : null}

                      {/* Undo button */}
                      {change.oldValue !== undefined && isFieldRevertable(itemType, change.field) ? (
                        <Pressable
                          style={[styles.revertBtn, revertingField === `${log.id}-${change.field}` && { opacity: 0.5 }]}
                          disabled={revertingField !== null}
                          onPress={() => {
                            Haptics.selectionAsync();
                            Alert.alert(
                              t('modificationLogs', 'revertConfirmTitle'),
                              t('modificationLogs', 'revertConfirmMsg'),
                              [
                                { text: t('common', 'cancel'), style: 'cancel' },
                                {
                                  text: t('modificationLogs', 'revertField'),
                                  style: 'destructive',
                                  onPress: async () => {
                                    setRevertingField(`${log.id}-${change.field}`);
                                    const { error } = await revertFieldChange({
                                      logId: log.id,
                                      itemType,
                                      itemId,
                                      fieldName: change.field,
                                      oldValue: change.oldValue,
                                    });
                                    setRevertingField(null);
                                    if (error) {
                                      Alert.alert(t('modificationLogs', 'revertError'), error);
                                    } else {
                                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                      await loadLogs();
                                      onReverted?.();
                                    }
                                  },
                                },
                              ]
                            );
                          }}
                        >
                          <MaterialIcons name="undo" size={13} color={theme.warning} />
                          <Text style={styles.revertBtnText}>
                            {revertingField === `${log.id}-${change.field}` ? t('modificationLogs', 'reverting') : t('modificationLogs', 'revertField')}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))}

                  {/* Revert All button */}
                  {(() => {
                    const revertableCount = log.changes.filter(c => c.oldValue !== undefined && isFieldRevertable(itemType, c.field)).length;
                    if (revertableCount < 2) return null;
                    const isRevertingThis = revertingAllLogId === log.id;
                    return (
                      <Pressable
                        style={[styles.revertAllBtn, isRevertingThis && { opacity: 0.5 }]}
                        disabled={revertingField !== null || revertingAllLogId !== null}
                        onPress={() => {
                          Haptics.selectionAsync();
                          Alert.alert(
                            t('modificationLogs', 'revertAllConfirmTitle'),
                            t('modificationLogs', 'revertAllConfirmMsg'),
                            [
                              { text: t('common', 'cancel'), style: 'cancel' },
                              {
                                text: t('modificationLogs', 'revertAll'),
                                style: 'destructive',
                                onPress: async () => {
                                  setRevertingAllLogId(log.id);
                                  const { error, revertedCount } = await revertAllChanges({
                                    logId: log.id,
                                    itemType,
                                    itemId,
                                    changes: log.changes,
                                  });
                                  setRevertingAllLogId(null);
                                  if (error) {
                                    Alert.alert(t('modificationLogs', 'revertAllError'), error);
                                  } else {
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                    Alert.alert(
                                      t('modificationLogs', 'revertSuccess'),
                                      `${revertedCount} ${t('modificationLogs', 'revertAllSuccess')}`
                                    );
                                    setExpandedLogId(null);
                                    await loadLogs();
                                    onReverted?.();
                                  }
                                },
                              },
                            ]
                          );
                        }}
                      >
                        <MaterialIcons name="undo" size={15} color={theme.error} />
                        <Text style={styles.revertAllBtnText}>
                          {isRevertingThis ? t('modificationLogs', 'revertingAll') : `${t('modificationLogs', 'revertAll')} (${revertableCount})`}
                        </Text>
                      </Pressable>
                    );
                  })()}

                  {/* Divider after expanded section */}
                  {index < displayedLogs.length - 1 ? (
                    <View style={styles.diffBottomDivider} />
                  ) : null}
                </Animated.View>
              ) : null}
            </View>
          );
        })}

        {/* Show more/less toggle */}
        {logs.length > 3 ? (
          <Pressable style={styles.toggleBtn} onPress={() => { Haptics.selectionAsync(); setShowAll(!showAll); }}>
            <Text style={styles.toggleBtnText}>
              {showAll ? t('modificationLogs', 'seeLess') : `${t('modificationLogs', 'seeAll')} (${logs.length})`}
            </Text>
            <MaterialIcons
              name={showAll ? 'expand-less' : 'expand-more'}
              size={18}
              color={theme.primary}
            />
          </Pressable>
        ) : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 16,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitleText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.textSecondary,
    letterSpacing: 1,
  },
  logCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.warning + '20',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  logCountText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.warning,
  },
  loadingContainer: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    padding: 24,
    alignItems: 'center',
  },
  logsCard: {
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.card,
  },
  logItem: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
    alignItems: 'center',
  },
  logItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  logAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.warning + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.warning,
  },
  logContent: {
    flex: 1,
  },
  logHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logModifierName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  logTime: {
    fontSize: 11,
    color: theme.textMuted,
  },
  logChangesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 2,
  },
  logChangesText: {
    fontSize: 12,
    color: theme.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.primary,
  },

  // ===== Expanded diff styles =====
  diffContainer: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 4,
  },
  diffFullDate: {
    fontSize: 11,
    color: theme.textMuted,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  diffModifierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  diffModifierEmail: {
    fontSize: 11,
    color: theme.textMuted,
  },
  diffFieldCard: {
    backgroundColor: theme.backgroundSecondary,
    borderRadius: theme.borderRadius.md,
    padding: 12,
    marginBottom: 8,
  },
  diffFieldHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  diffFieldName: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.primary,
  },
  diffOldRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 6,
  },
  diffOldIndicator: {
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.error,
    marginRight: 10,
  },
  diffValueBox: {
    flex: 1,
  },
  diffOldLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.error,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  diffOldValue: {
    fontSize: 13,
    color: theme.error,
    fontWeight: '500',
    backgroundColor: theme.error + '08',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  diffNewRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  diffNewIndicator: {
    width: 3,
    borderRadius: 2,
    backgroundColor: theme.success,
    marginRight: 10,
  },
  diffNewLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: theme.success,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  diffNewValue: {
    fontSize: 13,
    color: theme.success,
    fontWeight: '500',
    backgroundColor: theme.success + '08',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: 'hidden',
  },
  diffBottomDivider: {
    height: 1,
    backgroundColor: theme.border,
    marginTop: 6,
  },
  revertBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: theme.warning + '10',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.warning + '25',
    alignSelf: 'flex-start',
  },
  revertBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.warning,
  },
  revertAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
    backgroundColor: theme.error + '10',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1.5,
    borderColor: theme.error + '30',
  },
  revertAllBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.error,
  },
});
