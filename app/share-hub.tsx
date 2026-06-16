import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAuth, useAlert } from '@/template';
import { useAppActions } from '@/contexts/AppContext';
import { useToast } from '@/components/ui/Toast';
import {
  getShareNotifications,
  markShareNotificationsRead,
  deleteShareNotification,
  ShareNotification,
  ShareItemType,
  redeemShareCode as redeemCode,
} from '@/services/shareService';
import { findMeetupByCode } from '@/services/meetupService';
import { trackReferral } from '@/services/ambassadorService';
import { getSupabaseClient } from '@/template';

type TabKey = 'redeem' | 'activity' | 'manage';

const TABS: { key: TabKey; labelFr: string; labelEn: string; icon: string }[] = [
  { key: 'redeem', labelFr: 'Code', labelEn: 'Code', icon: 'qr-code-2' },
  { key: 'activity', labelFr: 'Activite', labelEn: 'Activity', icon: 'notifications' },
  { key: 'manage', labelFr: 'Gestion', labelEn: 'Manage', icon: 'dashboard' },
];

const TYPE_ICON: Record<string, string> = { player: 'person', club: 'home', terrain: 'landscape', tournament: 'emoji-events', match: 'sports', challenge: 'flag' };
const TYPE_COLOR: Record<string, string> = { player: '#2563EB', club: '#F59E0B', terrain: '#10B981', tournament: '#EAB308', match: '#3B82F6', challenge: '#F97316' };
const ROUTE_MAP: Record<string, string> = { player: '/player/', club: '/club/', terrain: '/terrain/', tournament: '/tournament/', match: '/match/', challenge: '' };
const TYPE_LABEL: Record<string, { fr: string; en: string }> = { player: { fr: 'Joueur', en: 'Player' }, club: { fr: 'Club', en: 'Club' }, terrain: { fr: 'Terrain', en: 'Court' }, tournament: { fr: 'Tournoi', en: 'Tournament' }, match: { fr: 'Match', en: 'Match' }, challenge: { fr: 'Defi', en: 'Challenge' } };

function relativeDate(dateStr: string, fr: boolean): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return fr ? "A l'instant" : 'Just now';
  if (mins < 60) return fr ? `Il y a ${mins} min` : `${mins}m ago`;
  if (hours < 24) return fr ? `Il y a ${hours}h` : `${hours}h ago`;
  if (days < 7) return fr ? `Il y a ${days}j` : `${days}d ago`;
  return new Date(dateStr).toLocaleDateString(fr ? 'fr-FR' : 'en-US', { day: 'numeric', month: 'short' });
}

export default function ShareHubScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { refreshData } = useAppActions();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ tab?: string; deepLinkCode?: string; deepLinkType?: string }>();
  const fr = language === 'fr';

  const [activeTab, setActiveTab] = useState<TabKey>((params.tab as TabKey) || 'redeem');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Redeem
  const [code, setCode] = useState('');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [redeemResult, setRedeemResult] = useState<{ itemType: ShareItemType; itemId: string; autoSavedItems: { type: ShareItemType; id: string; newItemId: string | null }[] } | null>(null);

  // Referral code
  const [referralCode, setReferralCode] = useState('');
  const [isRedeemingReferral, setIsRedeemingReferral] = useState(false);
  const [referralResult, setReferralResult] = useState<'success' | 'error' | null>(null);
  const [referralError, setReferralError] = useState('');

  // Activity
  const [notifications, setNotifications] = useState<ShareNotification[]>([]);

  // Deep link
  const [deepLinkHandled, setDeepLinkHandled] = useState(false);
  useEffect(() => {
    if (deepLinkHandled || !params.deepLinkCode) return;
    setDeepLinkHandled(true);
    setCode(params.deepLinkCode);
    setActiveTab('redeem');
    if (params.deepLinkType === 'meetup') {
      (async () => { setIsRedeeming(true); const { meetup } = await findMeetupByCode(params.deepLinkCode!); setIsRedeeming(false); if (meetup) router.replace(`/meetup/${meetup.id}` as any); else showAlert(t('common', 'error'), t('meetup', 'invalidCode')); })();
    } else { setTimeout(() => handleRedeem(params.deepLinkCode!), 300); }
  }, [params.deepLinkCode, params.deepLinkType, deepLinkHandled]);

  const loadData = useCallback(async () => {
    try { const r = await getShareNotifications(); if (!r.error) setNotifications(r.notifications); } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const timer = setTimeout(async () => {
      const unread = notifications.filter(n => !n.isRead);
      if (unread.length > 0) { await markShareNotificationsRead(); setNotifications(prev => prev.map(n => ({ ...n, isRead: true }))); }
    }, 1500);
    return () => clearTimeout(timer);
  }, [notifications.length]);

  const handleRefresh = useCallback(async () => { setRefreshing(true); await loadData(); setRefreshing(false); }, [loadData]);

  const handleRedeem = async (codeValue?: string) => {
    const c = (codeValue || code).trim();
    if (!c) { showAlert(t('common', 'error'), t('share', 'enterCode')); return; }
    setIsRedeeming(true);
    try {
      if (c.toUpperCase().startsWith('RDV-')) { const { meetup } = await findMeetupByCode(c); if (meetup) { setIsRedeeming(false); router.replace(`/meetup/${meetup.id}` as any); return; } }
      const result = await redeemCode(c);
      if (result.error) { showAlert(t('common', 'error'), result.error); }
      else { setRedeemResult({ itemType: result.itemType, itemId: result.itemId, autoSavedItems: result.autoSavedItems }); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); await refreshData(); }
    } catch { showAlert(t('common', 'error'), t('share', 'cannotValidate')); }
    finally { setIsRedeeming(false); }
  };

  const handleNav = (type: string, id: string) => { const r = ROUTE_MAP[type]; if (r) router.push(`${r}${id}` as any); };

  const handleDeleteNotif = useCallback((id: string) => {
    Alert.alert(fr ? 'Supprimer' : 'Delete', fr ? 'Supprimer cette notification ?' : 'Delete this notification?', [
      { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
      { text: fr ? 'Supprimer' : 'Delete', style: 'destructive', onPress: async () => { await deleteShareNotification(id); setNotifications(prev => prev.filter(n => n.id !== id)); } },
    ]);
  }, [fr]);

  const handleClearAll = useCallback(() => {
    if (notifications.length === 0) return;
    Alert.alert(fr ? 'Tout supprimer' : 'Clear all', fr ? 'Supprimer toutes les notifications ?' : 'Delete all?', [
      { text: fr ? 'Annuler' : 'Cancel', style: 'cancel' },
      { text: fr ? 'Supprimer' : 'Clear', style: 'destructive', onPress: async () => { for (const n of notifications) await deleteShareNotification(n.id); setNotifications([]); } },
    ]);
  }, [notifications, fr]);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const tabBadges: Record<TabKey, number> = { redeem: 0, activity: unreadCount, manage: 0 };

  if (loading) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.header}><Pressable style={st.backBtn} onPress={() => router.back()}><MaterialIcons name="arrow-back" size={24} color="#0F172A" /></Pressable><Text style={st.headerTitle}>{fr ? 'Partage' : 'Sharing'}</Text><View style={{ width: 40 }} /></View>
        <View style={st.center}><ActivityIndicator size="large" color="#2563EB" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={st.container}>
      <View style={st.header}>
        <Pressable style={st.backBtn} onPress={() => router.back()}><MaterialIcons name="arrow-back" size={24} color="#0F172A" /></Pressable>
        <Text style={st.headerTitle}>{fr ? 'Partage' : 'Sharing'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Segmented Tabs */}
      <View style={st.segmentWrap}>
        <View style={st.segmentBar}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const badge = tabBadges[tab.key];
            return (
              <Pressable key={tab.key} style={[st.segmentItem, isActive && st.segmentItemActive]} onPress={() => { Haptics.selectionAsync(); setActiveTab(tab.key); }}>
                <MaterialIcons name={tab.icon as any} size={16} color={isActive ? '#FFF' : '#94A3B8'} />
                <Text style={[st.segmentLabel, isActive && st.segmentLabelActive]}>{fr ? tab.labelFr : tab.labelEn}</Text>
                {badge > 0 ? <View style={[st.segmentBadge, isActive && st.segmentBadgeActive]}><Text style={[st.segmentBadgeText, isActive && { color: '#2563EB' }]}>{badge > 9 ? '9+' : badge}</Text></View> : null}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* ========== CODE TAB ========== */}
      {activeTab === 'redeem' ? (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
            {!redeemResult ? (
              <Animated.View entering={FadeInDown.duration(300)} style={st.redeemSection}>
                <View style={st.redeemIconBg}><MaterialIcons name="qr-code-2" size={40} color="#2563EB" /></View>
                <Text style={st.redeemTitle}>{t('share', 'enterShareCode')}</Text>
                <Text style={st.redeemDesc}>{t('share', 'enterShareCodeDesc')}</Text>
                <View style={st.redeemInputWrap}>
                  <TextInput style={st.redeemInput} value={code} onChangeText={setCode} placeholder="Ex: AbC12xYz" placeholderTextColor="#94A3B8" autoCapitalize="none" autoCorrect={false} maxLength={12} />
                </View>
                <Pressable style={[st.redeemBtn, (!code.trim() || isRedeeming) && { opacity: 0.5 }]} onPress={() => handleRedeem()} disabled={!code.trim() || isRedeeming}>
                  {isRedeeming ? <ActivityIndicator size="small" color="#FFF" /> : <><MaterialIcons name="lock-open" size={18} color="#FFF" /><Text style={st.redeemBtnText}>{t('share', 'validateCode')}</Text></>}
                </Pressable>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInDown.duration(400)} style={st.redeemSection}>
                <View style={[st.redeemIconBg, { backgroundColor: '#ECFDF5' }]}><MaterialIcons name="check-circle" size={40} color="#10B981" /></View>
                <Text style={st.redeemTitle}>{t('share', 'cardUnlocked')}</Text>
                <Text style={st.redeemDesc}>{t('share', 'autoSavedToDirectory')}</Text>
                <View style={st.importedList}>
                  {redeemResult.autoSavedItems.map((item, idx) => {
                    const color = TYPE_COLOR[item.type] || '#2563EB';
                    const icon = TYPE_ICON[item.type] || 'description';
                    const label = TYPE_LABEL[item.type];
                    return (
                      <Pressable key={`${item.type}-${idx}`} style={st.importedItem} onPress={() => item.newItemId ? handleNav(item.type, item.newItemId) : null}>
                        <View style={[st.importedItemIcon, { backgroundColor: color + '10' }]}><MaterialIcons name={icon as any} size={20} color={color} /></View>
                        <View style={{ flex: 1 }}>
                          <Text style={st.importedItemType}>{fr ? label?.fr : label?.en}</Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}><MaterialIcons name="check" size={12} color="#10B981" /><Text style={{ fontSize: 11, color: '#10B981', fontWeight: '500' }}>{t('share', 'savedToDirectory')}</Text></View>
                        </View>
                        {item.newItemId ? <MaterialIcons name="chevron-right" size={18} color="#94A3B8" /> : null}
                      </Pressable>
                    );
                  })}
                </View>
                {redeemResult.itemType !== 'challenge' ? (
                  <Pressable style={st.redeemBtn} onPress={() => { const main = redeemResult.autoSavedItems.find(i => i.type === redeemResult.itemType); handleNav(redeemResult.itemType, main?.newItemId || redeemResult.itemId); }}>
                    <MaterialIcons name="open-in-new" size={18} color="#FFF" />
                    <Text style={st.redeemBtnText}>{t('share', 'viewCard')}</Text>
                  </Pressable>
                ) : null}
                <Pressable style={st.resetBtn} onPress={() => { setRedeemResult(null); setCode(''); }}><Text style={st.resetBtnText}>{fr ? 'Entrer un autre code' : 'Enter another code'}</Text></Pressable>
              </Animated.View>
            )}

            {/* ======= REFERRAL CODE SECTION ======= */}
            <Animated.View entering={FadeInDown.duration(300).delay(150)} style={st.referralSection}>
              <View style={st.referralDivider}>
                <View style={st.referralDividerLine} />
                <Text style={st.referralDividerText}>{fr ? 'OU' : 'OR'}</Text>
                <View style={st.referralDividerLine} />
              </View>

              <View style={st.referralCard}>
                <View style={st.referralHeader}>
                  <View style={st.referralIconBg}>
                    <MaterialIcons name="card-giftcard" size={22} color="#EC4899" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.referralTitle}>
                      {fr ? 'Code de parrainage' : 'Referral code'}
                    </Text>
                    <Text style={st.referralDesc}>
                      {fr
                        ? 'Un ami vous a donne un code ? Entrez-le pour gagner des XP !'
                        : 'A friend gave you a code? Enter it to earn XP!'}
                    </Text>
                  </View>
                </View>

                {referralResult === 'success' ? (
                  <View style={st.referralSuccessBox}>
                    <MaterialIcons name="check-circle" size={28} color="#10B981" />
                    <Text style={st.referralSuccessTitle}>
                      {fr ? 'Parrainage valide !' : 'Referral validated!'}
                    </Text>
                    <Text style={st.referralSuccessDesc}>
                      {fr
                        ? 'Merci ! Votre parrain recevra ses XP de recompense.'
                        : 'Thanks! Your referrer will receive their XP reward.'}
                    </Text>
                    <Pressable
                      style={st.referralResetBtn}
                      onPress={() => { setReferralResult(null); setReferralCode(''); setReferralError(''); }}
                    >
                      <Text style={st.referralResetBtnText}>{fr ? 'Entrer un autre code' : 'Enter another code'}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <View style={st.referralInputRow}>
                      <TextInput
                        style={[st.referralInput, referralResult === 'error' && st.referralInputError]}
                        value={referralCode}
                        onChangeText={(text) => {
                          setReferralCode(text.toUpperCase());
                          if (referralResult === 'error') { setReferralResult(null); setReferralError(''); }
                        }}
                        placeholder={fr ? 'Ex: ABC-XY12Z' : 'Ex: ABC-XY12Z'}
                        placeholderTextColor="#94A3B8"
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={20}
                      />
                      <Pressable
                        style={[st.referralSubmitBtn, (!referralCode.trim() || isRedeemingReferral) && { opacity: 0.5 }]}
                        onPress={async () => {
                          if (!referralCode.trim() || isRedeemingReferral) return;
                          if (!user?.id) {
                            showAlert(fr ? 'Erreur' : 'Error', fr ? 'Connectez-vous pour utiliser un code' : 'Log in to use a code');
                            return;
                          }
                          setIsRedeemingReferral(true);
                          setReferralResult(null);
                          setReferralError('');
                          try {
                            const supabase = getSupabaseClient();
                            // Check if code exists
                            const { data: amb } = await supabase
                              .from('ambassadors')
                              .select('id, user_id, referral_code, is_active')
                              .eq('referral_code', referralCode.trim().toUpperCase())
                              .maybeSingle();
                            if (!amb) {
                              setReferralResult('error');
                              setReferralError(fr ? 'Code invalide ou introuvable' : 'Invalid or not found code');
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                              setIsRedeemingReferral(false);
                              return;
                            }
                            if (!amb.is_active) {
                              setReferralResult('error');
                              setReferralError(fr ? 'Ce code n est plus actif' : 'This code is no longer active');
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                              setIsRedeemingReferral(false);
                              return;
                            }
                            if (amb.user_id === user.id) {
                              setReferralResult('error');
                              setReferralError(fr ? 'Vous ne pouvez pas utiliser votre propre code' : 'You cannot use your own code');
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                              setIsRedeemingReferral(false);
                              return;
                            }
                            // Check if user already redeemed this code
                            const { data: existing } = await supabase
                              .from('ambassador_analytics')
                              .select('id')
                              .eq('ambassador_id', amb.id)
                              .eq('event_type', 'referral')
                              .eq('viewer_id', user.id)
                              .limit(1);
                            if (existing && existing.length > 0) {
                              setReferralResult('error');
                              setReferralError(fr ? 'Vous avez deja utilise ce code' : 'You have already used this code');
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                              setIsRedeemingReferral(false);
                              return;
                            }
                            // Track the referral
                            const { success, error: trackErr } = await trackReferral(referralCode.trim().toUpperCase(), user.id);
                            if (!success) {
                              setReferralResult('error');
                              setReferralError(trackErr || (fr ? 'Erreur lors de la validation' : 'Validation error'));
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                            } else {
                              setReferralResult('success');
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            }
                          } catch (e: any) {
                            setReferralResult('error');
                            setReferralError(e.message || (fr ? 'Erreur inattendue' : 'Unexpected error'));
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                          }
                          setIsRedeemingReferral(false);
                        }}
                        disabled={!referralCode.trim() || isRedeemingReferral}
                      >
                        {isRedeemingReferral ? (
                          <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                          <MaterialIcons name="check" size={20} color="#FFF" />
                        )}
                      </Pressable>
                    </View>
                    {referralResult === 'error' && referralError ? (
                      <View style={st.referralErrorBox}>
                        <MaterialIcons name="error-outline" size={14} color="#EF4444" />
                        <Text style={st.referralErrorText}>{referralError}</Text>
                      </View>
                    ) : null}
                  </>
                )}
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      ) : null}

      {/* ========== ACTIVITY TAB ========== */}
      {activeTab === 'activity' ? (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2563EB" />}
        >
          {/* Summary */}
          <Animated.View entering={FadeInDown.duration(300)} style={st.summaryCard}>
            <View style={st.summaryIcon}><MaterialIcons name="share" size={20} color="#10B981" /></View>
            <View style={{ flex: 1 }}>
              <Text style={st.summaryTitle}>{notifications.length === 0 ? (fr ? 'Aucune notification' : 'No notifications') : `${notifications.length} ${fr ? 'acces enregistres' : 'accesses recorded'}`}</Text>
              <Text style={st.summarySub}>{unreadCount > 0 ? `${unreadCount} ${fr ? 'non lues' : 'unread'}` : (fr ? 'Tout a jour' : 'All up to date')}</Text>
            </View>
            {notifications.length > 0 ? <Pressable style={st.clearBtn} onPress={handleClearAll}><MaterialIcons name="delete-sweep" size={18} color="#EF4444" /></Pressable> : null}
          </Animated.View>

          {notifications.length > 0 ? (
            <View style={{ gap: 6 }}>
              {notifications.map((notif, i) => {
                const color = TYPE_COLOR[notif.itemType] || '#2563EB';
                const icon = TYPE_ICON[notif.itemType] || 'description';
                const label = TYPE_LABEL[notif.itemType];
                return (
                  <Animated.View key={notif.id} entering={FadeIn.duration(200).delay(i * 25)}>
                    <Pressable style={[st.notifCard, !notif.isRead && st.notifCardUnread]} onPress={() => handleNav(notif.itemType, notif.itemId)} onLongPress={() => handleDeleteNotif(notif.id)}>
                      {!notif.isRead ? <View style={st.unreadDot} /> : null}
                      <View style={st.notifAvatar}><Text style={st.notifAvatarText}>{(notif.accessorName || '?').charAt(0).toUpperCase()}</Text></View>
                      <View style={{ flex: 1 }}>
                        <View style={st.notifTopRow}>
                          <Text style={st.notifName} numberOfLines={1}>{notif.accessorName || 'User'}</Text>
                          <Text style={st.notifTime}>{relativeDate(notif.createdAt, fr)}</Text>
                        </View>
                        <Text style={st.notifAction} numberOfLines={1}>{t('share', 'accessedYourCard')} {(fr ? label?.fr : label?.en)?.toLowerCase()}{notif.itemName ? ` "${notif.itemName}"` : ''}</Text>
                        <View style={[st.notifTypeBadge, { backgroundColor: color + '10' }]}>
                          <MaterialIcons name={icon as any} size={10} color={color} />
                          <Text style={[st.notifTypeBadgeText, { color }]}>{fr ? label?.fr : label?.en}</Text>
                        </View>
                      </View>
                      <MaterialIcons name="chevron-right" size={16} color="#CBD5E1" />
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          ) : (
            <View style={st.emptyWrap}>
              <View style={st.emptyIconBg}><MaterialIcons name="notifications-none" size={40} color="#94A3B8" /></View>
              <Text style={st.emptyTitle}>{fr ? 'Aucune notification' : 'No notifications'}</Text>
              <Text style={st.emptyDesc}>{fr ? "Quand quelqu'un utilisera votre code, vous le verrez ici." : 'When someone uses your code, it will appear here.'}</Text>
            </View>
          )}
        </ScrollView>
      ) : null}

      {/* ========== MANAGE TAB ========== */}
      {activeTab === 'manage' ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.scrollContent, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(300)}>
            <Pressable style={st.manageCard} onPress={() => router.push('/shared-items')}>
              <View style={st.manageCardIcon}><MaterialIcons name="dashboard" size={24} color="#FFF" /></View>
              <View style={{ flex: 1 }}>
                <Text style={st.manageCardTitle}>{fr ? 'Tableau de bord' : 'Dashboard'}</Text>
                <Text style={st.manageCardSub}>{fr ? 'Gestion, analytiques, codes, expiration' : 'Management, analytics, codes, expiration'}</Text>
              </View>
              <View style={st.manageCardArrow}><MaterialIcons name="arrow-forward" size={18} color="#2563EB" /></View>
            </Pressable>
          </Animated.View>

          <View style={st.footnote}><MaterialIcons name="info-outline" size={14} color="#94A3B8" /><Text style={st.footnoteText}>{fr ? 'Le tableau de bord regroupe tous vos partages actifs, les statistiques de consultation, et les outils de gestion groupee.' : 'The dashboard brings together all your active shares, view statistics, and bulk management tools.'}</Text></View>
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  backBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0F172A', letterSpacing: -0.3 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Segmented tabs (unified with notifications-hub)
  segmentWrap: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  segmentBar: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 14, padding: 3 },
  segmentItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10, borderRadius: 12 },
  segmentItemActive: { backgroundColor: '#0F172A' },
  segmentLabel: { fontSize: 12, fontWeight: '600', color: '#94A3B8' },
  segmentLabelActive: { color: '#FFF' },
  segmentBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  segmentBadgeActive: { backgroundColor: '#FFF' },
  segmentBadgeText: { fontSize: 9, fontWeight: '800', color: '#FFF' },

  scrollContent: { paddingHorizontal: 16, paddingTop: 20 },

  // Redeem
  redeemSection: { alignItems: 'center', paddingTop: 16 },
  redeemIconBg: { width: 80, height: 80, borderRadius: 24, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  redeemTitle: { fontSize: 20, fontWeight: '700', color: '#0F172A', marginBottom: 8, letterSpacing: -0.3 },
  redeemDesc: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 20, marginBottom: 24, maxWidth: 300 },
  redeemInputWrap: { width: '100%', backgroundColor: '#FFF', borderRadius: 16, borderWidth: 2, borderColor: '#E2E8F0', marginBottom: 16 },
  redeemInput: { fontSize: 22, fontWeight: '700', color: '#0F172A', padding: 16, textAlign: 'center', letterSpacing: 3 },
  redeemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%', backgroundColor: '#0F172A', paddingVertical: 16, borderRadius: 14 },
  redeemBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  importedList: { width: '100%', gap: 8, marginBottom: 20 },
  importedItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, padding: 14, gap: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  importedItemIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  importedItemType: { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  resetBtn: { paddingVertical: 14, marginTop: 8 },
  resetBtnText: { fontSize: 14, fontWeight: '600', color: '#2563EB' },

  // Activity
  summaryCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 16, padding: 14, marginBottom: 16, gap: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  summaryIcon: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  summarySub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  clearBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  notifCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 14, padding: 12, gap: 10, borderWidth: 1, borderColor: '#F1F5F9' },
  notifCardUnread: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  unreadDot: { position: 'absolute', top: 12, left: 12, width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#2563EB', zIndex: 1 },
  notifAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  notifAvatarText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  notifTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  notifName: { fontSize: 14, fontWeight: '700', color: '#0F172A', flex: 1, marginRight: 8 },
  notifTime: { fontSize: 10, color: '#94A3B8' },
  notifAction: { fontSize: 12, color: '#64748B', marginBottom: 4 },
  notifTypeBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, alignSelf: 'flex-start' },
  notifTypeBadgeText: { fontSize: 10, fontWeight: '600' },

  // Manage
  manageCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 18, padding: 20, gap: 16, borderWidth: 1, borderColor: '#F1F5F9', marginBottom: 16 },
  manageCardIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  manageCardTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 4 },
  manageCardSub: { fontSize: 13, color: '#64748B' },
  manageCardArrow: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  emptyIconBg: { width: 72, height: 72, borderRadius: 24, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  emptyDesc: { fontSize: 13, color: '#94A3B8', textAlign: 'center', lineHeight: 19 },

  // Footnote
  footnote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, backgroundColor: '#FFF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#F1F5F9' },
  footnoteText: { flex: 1, fontSize: 11, color: '#94A3B8', lineHeight: 16 },

  // Referral
  referralSection: { marginTop: 24, width: '100%' },
  referralDivider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  referralDividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  referralDividerText: { fontSize: 12, fontWeight: '700', color: '#94A3B8', letterSpacing: 1 },
  referralCard: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, borderWidth: 1.5, borderColor: '#EC489920' },
  referralHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  referralIconBg: { width: 44, height: 44, borderRadius: 14, backgroundColor: '#EC489912', alignItems: 'center', justifyContent: 'center' },
  referralTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  referralDesc: { fontSize: 12, color: '#94A3B8', lineHeight: 17 },
  referralInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  referralInput: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, fontWeight: '700', color: '#0F172A', letterSpacing: 2, borderWidth: 1.5, borderColor: '#E2E8F0' },
  referralInputError: { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  referralSubmitBtn: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#EC4899', alignItems: 'center', justifyContent: 'center' },
  referralErrorBox: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#FEF2F2', borderRadius: 10, borderWidth: 1, borderColor: '#FECACA' },
  referralErrorText: { flex: 1, fontSize: 12, color: '#EF4444', fontWeight: '500' },
  referralSuccessBox: { alignItems: 'center', paddingVertical: 16, gap: 8 },
  referralSuccessTitle: { fontSize: 16, fontWeight: '700', color: '#10B981' },
  referralSuccessDesc: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 19 },
  referralResetBtn: { paddingVertical: 10, marginTop: 4 },
  referralResetBtnText: { fontSize: 13, fontWeight: '600', color: '#EC4899' },
});
