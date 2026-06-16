import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from '@/services/haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { redeemShareCode, ShareItemType } from '@/services/shareService';
import { findMeetupByCode } from '@/services/meetupService';
import { useAlert } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppActions } from '@/contexts/AppContext';
import { useToast } from '@/components/ui/Toast';

const ROUTE_MAP: Record<ShareItemType, string> = {
  player: '/player/',
  club: '/club/',
  terrain: '/terrain/',
  tournament: '/tournament/',
  match: '/match/',
  challenge: '',
};

const TYPE_LABEL_KEY: Record<ShareItemType, string> = {
  player: 'playerLabel',
  club: 'clubLabel',
  terrain: 'terrainLabel',
  tournament: 'tournamentLabel',
  match: 'matchLabel',
  challenge: 'challengeLabel',
};

const TYPE_ICON: Record<ShareItemType, string> = {
  player: 'person',
  club: 'home',
  terrain: 'landscape',
  tournament: 'emoji-events',
  match: 'sports',
  challenge: 'flag',
};

const TYPE_COLOR: Record<ShareItemType, string> = {
  player: theme.primary,
  club: theme.accent,
  terrain: theme.success,
  tournament: theme.carreauColor,
  match: theme.tirColor,
  challenge: theme.warning,
};

interface AutoSavedItem {
  type: ShareItemType;
  id: string;
  newItemId: string | null;
}

export default function RedeemShareScreen() {
  const { showAlert } = useAlert();
  const { t } = useLanguage();
  const { refreshData } = useAppActions();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ deepLinkCode?: string; deepLinkType?: string }>();
  const [code, setCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);

  // Handle deep link params (auto-redeem)
  React.useEffect(() => {
    if (deepLinkHandled || !params.deepLinkCode) return;
    setDeepLinkHandled(true);
    const deepCode = params.deepLinkCode;
    const deepType = params.deepLinkType;

    if (deepType === 'meetup') {
      // Meetup code: find and navigate directly
      (async () => {
        setCode(deepCode);
        setIsRedeeming(true);
        const { meetup } = await findMeetupByCode(deepCode);
        setIsRedeeming(false);
        if (meetup) {
          router.replace(`/meetup/${meetup.id}` as any);
        } else {
          showAlert(t('common', 'error'), t('meetup', 'invalidCode'));
        }
      })();
    } else {
      // Share code: auto-fill and auto-redeem
      setCode(deepCode);
      setTimeout(() => {
        handleRedeemCode(deepCode);
      }, 300);
    }
  }, [params.deepLinkCode, params.deepLinkType, deepLinkHandled]);
  const [redeemResult, setRedeemResult] = useState<{
    itemType: ShareItemType;
    itemId: string;
    permission: string;
    autoSavedItems: AutoSavedItem[];
  } | null>(null);

  const handleRedeemCode = async (codeValue: string) => {
    if (!codeValue.trim()) {
      showAlert(t('common', 'error'), t('share', 'enterCode'));
      return;
    }

    setIsRedeeming(true);
    try {
      // First check if it looks like a meetup code (RDV- prefix)
      if (codeValue.trim().toUpperCase().startsWith('RDV-')) {
        const { meetup } = await findMeetupByCode(codeValue.trim());
        if (meetup) {
          setIsRedeeming(false);
          router.replace(`/meetup/${meetup.id}` as any);
          return;
        }
      }

      const result = await redeemShareCode(codeValue.trim());
      if (result.error) {
        showAlert(t('common', 'error'), result.error);
      } else {
        setRedeemResult({
          itemType: result.itemType,
          itemId: result.itemId,
          permission: result.permission,
          autoSavedItems: result.autoSavedItems,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Refresh data to show new items in directory - await to ensure context is updated
        await refreshData();

        // Show toast with directory tab navigation
        const mainType = result.itemType as ShareItemType;
        const tabMap: Record<string, { tab: string; labelKey: string; icon: string; color: string }> = {
          player: { tab: 'players', labelKey: 'playersTab', icon: 'person', color: '#4F46E5' },
          club: { tab: 'clubs', labelKey: 'clubsTab', icon: 'home', color: '#F97316' },
          terrain: { tab: 'terrains', labelKey: 'terrainsTab', icon: 'sports-soccer', color: '#22C55E' },
          tournament: { tab: 'tournaments', labelKey: 'tournamentsTab', icon: 'emoji-events', color: '#EAB308' },
        };
        const tabInfo = tabMap[mainType];
        if (tabInfo) {
          showToast({
            message: `${t('toast', 'addedToTab')} ${t('toast', tabInfo.labelKey)}`,
            icon: tabInfo.icon,
            iconColor: tabInfo.color,
            action: {
              label: t('toast', 'viewTab'),
              onPress: () => router.push({ pathname: '/(tabs)/directory', params: { tab: tabInfo.tab } } as any),
            },
          });
        }
      }
    } catch (e) {
      showAlert(t('common', 'error'), t('share', 'cannotValidate'));
    } finally {
      setIsRedeeming(false);
    }
  };

  const handleRedeem = () => handleRedeemCode(code);

  const handleNavigateToItem = (itemType: ShareItemType, itemId: string) => {
    const route = `${ROUTE_MAP[itemType]}${itemId}`;
    if (route) router.push(route as any);
  };

  const typeColor = redeemResult ? TYPE_COLOR[redeemResult.itemType] : null;
  const typeIcon = redeemResult ? TYPE_ICON[redeemResult.itemType] : null;

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('share', 'shareCode')}</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {!redeemResult ? (
          <Animated.View entering={FadeInDown.duration(300)} style={styles.inputSection}>
            <View style={styles.iconCircle}>
              <MaterialIcons name="qr-code-2" size={48} color={theme.primary} />
            </View>
            <Text style={styles.title}>{t('share', 'enterShareCode')}</Text>
            <Text style={styles.desc}>{t('share', 'enterShareCodeDesc')}</Text>

            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={code}
                onChangeText={setCode}
                placeholder="Ex: AbC12xYz"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={12}
              />
            </View>

            <Pressable
              style={[styles.redeemBtn, (!code.trim() || isRedeeming) && { opacity: 0.6 }]}
              onPress={handleRedeem}
              disabled={!code.trim() || isRedeeming}
            >
              {isRedeeming ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialIcons name="lock-open" size={20} color="#FFF" />
                  <Text style={styles.redeemBtnText}>{t('share', 'validateCode')}</Text>
                </>
              )}
            </Pressable>
          </Animated.View>
        ) : (
          <ScrollView contentContainerStyle={styles.successSection} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeInDown.duration(400)} style={styles.successContent}>
              <View style={[styles.successIcon, { backgroundColor: theme.success + '20' }]}>
                <MaterialIcons name="check-circle" size={48} color={theme.success} />
              </View>
              <Text style={styles.successTitle}>{t('share', 'cardUnlocked')}</Text>
              <Text style={styles.successDesc}>{t('share', 'autoSavedToDirectory')}</Text>

              {/* List all imported items */}
              <View style={styles.importedList}>
                {redeemResult.autoSavedItems.map((item, idx) => {
                  const itemColor = TYPE_COLOR[item.type];
                  const itemIcon = TYPE_ICON[item.type];
                  const labelKey = TYPE_LABEL_KEY[item.type];
                  const canNavigate = ROUTE_MAP[item.type] && item.newItemId;
                  return (
                    <Animated.View key={`${item.type}-${item.id}-${idx}`} entering={FadeInDown.duration(300).delay(100 * idx)}>
                      <Pressable
                        style={styles.importedItem}
                        onPress={() => canNavigate ? handleNavigateToItem(item.type, item.newItemId!) : null}
                        disabled={!canNavigate}
                      >
                        <View style={[styles.importedItemIcon, { backgroundColor: itemColor + '15' }]}>
                          <MaterialIcons name={itemIcon as any} size={22} color={itemColor} />
                        </View>
                        <View style={styles.importedItemInfo}>
                          <Text style={styles.importedItemType}>{t('share', labelKey)}</Text>
                          <View style={styles.importedItemStatus}>
                            <MaterialIcons name="check" size={14} color={theme.success} />
                            <Text style={styles.importedItemStatusText}>{t('share', 'savedToDirectory')}</Text>
                          </View>
                        </View>
                        {canNavigate ? (
                          <MaterialIcons name="chevron-right" size={22} color={theme.textMuted} />
                        ) : null}
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>

              {/* Navigate to main item */}
              {redeemResult.itemType !== 'challenge' && (
                <Pressable
                  style={[styles.navigateBtn, { backgroundColor: typeColor }]}
                  onPress={() => {
                    // Navigate to the new copy if available, otherwise the original
                    const mainItem = redeemResult.autoSavedItems.find(i => i.type === redeemResult.itemType);
                    const navId = mainItem?.newItemId || redeemResult.itemId;
                    handleNavigateToItem(redeemResult.itemType, navId);
                  }}
                >
                  <MaterialIcons name="open-in-new" size={20} color="#FFF" />
                  <Text style={styles.navigateBtnText}>{t('share', 'viewCard')}</Text>
                </Pressable>
              )}

              <Pressable
                style={styles.backToHomeBtn}
                onPress={() => router.replace('/(tabs)' as any)}
              >
                <Text style={styles.backToHomeBtnText}>{t('common', 'back')}</Text>
              </Pressable>
            </Animated.View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  body: { flex: 1, justifyContent: 'center', padding: 24 },
  inputSection: { alignItems: 'center' },
  iconCircle: {
    width: 96, height: 96, borderRadius: 48, backgroundColor: theme.primary + '15',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  title: { fontSize: 22, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  desc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  inputRow: {
    width: '100%', backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg,
    borderWidth: 2, borderColor: theme.border, marginBottom: 16,
  },
  input: {
    fontSize: 22, fontWeight: '700', color: theme.textPrimary, padding: 16,
    textAlign: 'center', letterSpacing: 2,
  },
  redeemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', backgroundColor: theme.primary, paddingVertical: 16,
    borderRadius: theme.borderRadius.lg,
  },
  redeemBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  successSection: { paddingVertical: 24, alignItems: 'center' },
  successContent: { alignItems: 'center', width: '100%' },
  successIcon: {
    width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  successTitle: { fontSize: 24, fontWeight: '700', color: theme.textPrimary, marginBottom: 8 },
  successDesc: { fontSize: 15, color: theme.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  // Imported items list
  importedList: { width: '100%', gap: 10, marginBottom: 24 },
  importedItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg, padding: 16, gap: 14, ...theme.shadows.card,
  },
  importedItemIcon: {
    width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  importedItemInfo: { flex: 1 },
  importedItemType: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  importedItemStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  importedItemStatusText: { fontSize: 12, color: theme.success, fontWeight: '500' },
  navigateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    width: '100%', paddingVertical: 16, borderRadius: theme.borderRadius.lg,
  },
  navigateBtnText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  backToHomeBtn: {
    paddingVertical: 14, marginTop: 12,
  },
  backToHomeBtnText: { fontSize: 15, fontWeight: '600', color: theme.textSecondary },
});
