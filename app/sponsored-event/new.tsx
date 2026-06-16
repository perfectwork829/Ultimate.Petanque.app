import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, TextInput, ActivityIndicator, Platform, Modal, FlatList } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import theme, { blurhash } from '@/constants/theme';
import { useAuth, useAlert } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData } from '@/contexts/AppContext';
import { getMyAmbassadorRecord, createSponsoredEvent, checkChallengeLimit } from '@/services/sponsoredEventService';
import DateTimePicker from '@react-native-community/datetimepicker';

const CHALLENGE_TYPES = [
  { id: '10_tirs', icon: 'track-changes' as const, color: '#2563EB' },
  { id: '10_tirs_sautee', icon: 'flight-takeoff' as const, color: '#D97706' },
  { id: 'precision', icon: 'stars' as const, color: '#7C3AED' },
];



export default function NewSponsoredEventScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { showAlert } = useAlert();
  const { t, language } = useLanguage();
  const { terrains } = useAppData();

  const [loading, setLoading] = useState(true);
  const [ambassador, setAmbassador] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [limitInfo, setLimitInfo] = useState<{ allowed: boolean; used: number; limit: number | null } | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [challengeType, setChallengeType] = useState('10_tirs');
  const [scope, setScope] = useState<'terrain' | 'city' | 'country' | 'world'>('city');
  const [eventDate, setEventDate] = useState(new Date(Date.now() + 7 * 86400000));
  const [startTime, setStartTime] = useState(() => { const d = new Date(); d.setHours(10, 0, 0, 0); return d; });
  const [endTime, setEndTime] = useState(() => { const d = new Date(); d.setHours(18, 0, 0, 0); return d; });
  const [selectedTerrainId, setSelectedTerrainId] = useState<string | null>(null);
  const [maxParticipants, setMaxParticipants] = useState('50');
  const [minWitnesses, setMinWitnesses] = useState('2');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showTerrainPicker, setShowTerrainPicker] = useState(false);
  const [terrainSearchQuery, setTerrainSearchQuery] = useState('');

  useEffect(() => {
    getMyAmbassadorRecord().then(async ({ ambassador: amb }) => {
      setAmbassador(amb);
      if (amb) {
        const { allowed, used, limit } = await checkChallengeLimit(amb.id, amb.badge_type);
        setLimitInfo({ allowed, used, limit });
      }
      setLoading(false);
    });
  }, []);

  const selectedTerrain = terrains.find((t: any) => t.id === selectedTerrainId);

  const filteredTerrainsList = React.useMemo(() => {
    if (!terrainSearchQuery.trim()) return terrains;
    const q = terrainSearchQuery.toLowerCase().trim();
    return terrains.filter((t: any) => t.name.toLowerCase().includes(q) || t.city.toLowerCase().includes(q) || (t.type || '').toLowerCase().includes(q));
  }, [terrains, terrainSearchQuery]);

  const handleCreate = async () => {
    if (!ambassador) return;
    if (!title.trim()) { showAlert(language === 'fr' ? 'Le titre est requis' : 'Title is required'); return; }
    // Enforce tier-based limit
    if (limitInfo && !limitInfo.allowed) {
      showAlert(
        language === 'fr' ? 'Limite atteinte' : 'Limit reached',
        language === 'fr'
          ? `En tant que partenaire Bronze, vous pouvez creer ${limitInfo.limit} defi par mois. Vous en avez deja cree ${limitInfo.used}. Passez au tier Argent pour un acces illimite.`
          : `As a Bronze partner, you can create ${limitInfo.limit} challenge per month. You have already created ${limitInfo.used}. Upgrade to Silver for unlimited access.`
      );
      return;
    }

    setSaving(true);

    // Build start/end timestamps
    const startDate = new Date(eventDate);
    startDate.setHours(startTime.getHours(), startTime.getMinutes(), 0, 0);
    const endDate = new Date(eventDate);
    endDate.setHours(endTime.getHours(), endTime.getMinutes(), 0, 0);

    const { event, error } = await createSponsoredEvent({
      ambassadorId: ambassador.id,
      title: title.trim(),
      description: description.trim() || undefined,
      challengeType,
      eventDate: eventDate.toISOString().split('T')[0],
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      scope: selectedTerrainId ? 'terrain' : 'world',
      terrainId: selectedTerrainId || undefined,
      terrainName: selectedTerrain?.name || undefined,
      city: selectedTerrain?.city || undefined,
      country: selectedTerrain?.country || 'France',
      maxParticipants: parseInt(maxParticipants) || 50,
      minWitnesses: parseInt(minWitnesses) || 2,
    });

    setSaving(false);
    if (error) { showAlert(language === 'fr' ? 'Erreur' : 'Error', error); return; }
    if (event) {
      showAlert(language === 'fr' ? 'Evenement cree !' : 'Event created!', `Code: ${event.shareCode}`);
      router.replace(`/sponsored-event/${event.id}` as any);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loadingWrap}><ActivityIndicator size="large" color={theme.primary} /></View>
      </SafeAreaView>
    );
  }

  if (!ambassador) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.backBtn} onPress={() => router.back()}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
          <Text style={s.headerTitle}>{language === 'fr' ? 'Defi Sponsorise' : 'Sponsored Challenge'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}><MaterialIcons name="verified" size={56} color={theme.textMuted} /></View>
          <Text style={s.emptyTitle}>{language === 'fr' ? 'Acces reserve aux ambassadeurs' : 'Ambassadors only'}</Text>
          <Text style={s.emptyDesc}>
            {language === 'fr'
              ? 'Seuls les ambassadeurs, sponsors et partenaires peuvent creer des defis ambassadeurs. Contactez l\'equipe pour devenir ambassadeur.'
              : 'Only ambassadors, sponsors and partners can create ambassador challenges. Contact the team to become an ambassador.'}
          </Text>
          <Pressable style={s.emptyBtn} onPress={() => router.push('/partners' as any)}>
            <MaterialIcons name="group" size={18} color="#FFF" />
            <Text style={s.emptyBtnText}>{language === 'fr' ? 'Voir les partenaires' : 'View partners'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const challengeName = (type: string) => type === '10_tirs' ? (language === 'fr' ? '10 Tirs' : '10 Shots') : type === '10_tirs_sautee' ? (language === 'fr' ? '10 Tirs sautee' : '10 Lob Shots') : (language === 'fr' ? 'Precision' : 'Precision');

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
        <Text style={s.headerTitle}>{language === 'fr' ? 'Nouveau Defi Sponsorise' : 'New Sponsored Challenge'}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>

        {/* Ambassador Badge */}
        <LinearGradient colors={['#7C3AED', '#9333EA']} style={s.ambassadorBadge}>
          <View style={s.ambassadorRow}>
            {ambassador.photo ? (
              <Image source={{ uri: ambassador.photo }} style={s.ambassadorAvatar} contentFit="cover" transition={200} placeholder={{ blurhash: blurhash.avatar }} cachePolicy="memory-disk" />
            ) : (
              <View style={[s.ambassadorAvatar, { backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 18, fontWeight: '800', color: '#FFF' }}>{ambassador.display_name?.charAt(0)}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={s.ambassadorName}>{ambassador.display_name}</Text>
              <Text style={s.ambassadorType}>{ambassador.badge_type === 'gold_sponsor' ? (language === 'fr' ? 'Sponsor Or' : 'Gold Sponsor') : ambassador.badge_type === 'sponsor' ? (language === 'fr' ? 'Sponsor Argent' : 'Silver Sponsor') : ambassador.badge_type === 'partner' ? (language === 'fr' ? 'Partenaire Bronze' : 'Bronze Partner') : (language === 'fr' ? 'Ambassadeur' : 'Ambassador')}</Text>
            </View>
            <MaterialIcons name="verified" size={24} color="rgba(255,255,255,0.8)" />
          </View>
        </LinearGradient>

        {/* Tier-based challenge limit info */}
        {limitInfo && limitInfo.limit !== null ? (
          <View style={[s.infoCard, { backgroundColor: limitInfo.allowed ? '#10B98108' : '#EF444408', borderColor: limitInfo.allowed ? '#10B98115' : '#EF444415' }]}>
            <MaterialIcons name={limitInfo.allowed ? 'check-circle' : 'warning'} size={18} color={limitInfo.allowed ? '#10B981' : '#EF4444'} />
            <Text style={[s.infoText, { color: limitInfo.allowed ? '#10B981' : '#EF4444' }]}>
              {language === 'fr'
                ? `Partenaire Bronze : ${limitInfo.used}/${limitInfo.limit} defi ce mois. ${limitInfo.allowed ? 'Vous pouvez en creer un.' : 'Limite atteinte. Passez au tier Argent pour un acces illimite.'}`
                : `Bronze partner: ${limitInfo.used}/${limitInfo.limit} challenge this month. ${limitInfo.allowed ? 'You can create one.' : 'Limit reached. Upgrade to Silver for unlimited access.'}`}
            </Text>
          </View>
        ) : null}

        {/* Title */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>{language === 'fr' ? 'Titre du defi *' : 'Challenge title *'}</Text>
          <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder={language === 'fr' ? 'Ex: Defi du Printemps 2026' : 'Ex: Spring Challenge 2026'} placeholderTextColor={theme.textMuted} />
        </View>

        {/* Description */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>{language === 'fr' ? 'Description' : 'Description'}</Text>
          <TextInput style={[s.input, { height: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} placeholder={language === 'fr' ? 'Decrivez le defi...' : 'Describe the challenge...'} placeholderTextColor={theme.textMuted} multiline />
        </View>

        {/* Challenge Type */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>{language === 'fr' ? 'Type de defi' : 'Challenge type'}</Text>
          <View style={s.chipRow}>
            {CHALLENGE_TYPES.map((ct) => (
              <Pressable key={ct.id} style={[s.typeChip, challengeType === ct.id && { backgroundColor: ct.color, borderColor: ct.color }]} onPress={() => setChallengeType(ct.id)}>
                <MaterialIcons name={ct.icon} size={18} color={challengeType === ct.id ? '#FFF' : ct.color} />
                <Text style={[s.typeChipText, challengeType === ct.id && { color: '#FFF' }]}>{challengeName(ct.id)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Date */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>{language === 'fr' ? 'Date de l\'evenement' : 'Event date'}</Text>
          <Pressable style={s.dateBtn} onPress={() => setShowDatePicker(true)}>
            <MaterialIcons name="event" size={20} color={theme.primary} />
            <Text style={s.dateBtnText}>{eventDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
          </Pressable>
          {showDatePicker ? (
            <DateTimePicker value={eventDate} mode="date" minimumDate={new Date()} onChange={(e, d) => { setShowDatePicker(Platform.OS === 'ios'); if (d) setEventDate(d); }} />
          ) : null}
        </View>

        {/* Time Range */}
        <View style={s.timeRow}>
          <View style={[s.field, { flex: 1 }]}>
            <Text style={s.fieldLabel}>{language === 'fr' ? 'Debut' : 'Start'}</Text>
            <Pressable style={s.dateBtn} onPress={() => setShowStartPicker(true)}>
              <MaterialIcons name="schedule" size={18} color={theme.primary} />
              <Text style={s.dateBtnText}>{startTime.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
            </Pressable>
            {showStartPicker ? (
              <DateTimePicker value={startTime} mode="time" onChange={(e, d) => { setShowStartPicker(Platform.OS === 'ios'); if (d) setStartTime(d); }} />
            ) : null}
          </View>
          <View style={[s.field, { flex: 1 }]}>
            <Text style={s.fieldLabel}>{language === 'fr' ? 'Fin' : 'End'}</Text>
            <Pressable style={s.dateBtn} onPress={() => setShowEndPicker(true)}>
              <MaterialIcons name="schedule" size={18} color={theme.error} />
              <Text style={s.dateBtnText}>{endTime.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
            </Pressable>
            {showEndPicker ? (
              <DateTimePicker value={endTime} mode="time" onChange={(e, d) => { setShowEndPicker(Platform.OS === 'ios'); if (d) setEndTime(d); }} />
            ) : null}
          </View>
        </View>

        {/* Terrain */}
        <View style={s.field}>
          <Text style={s.fieldLabel}>{language === 'fr' ? 'Terrain' : 'Court'}</Text>
          {selectedTerrain ? (
            <View style={s.selectedTerrainCard}>
              <View style={s.selectedTerrainIcon}>
                <MaterialIcons name="place" size={22} color={theme.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.selectedTerrainName}>{selectedTerrain.name}</Text>
                <Text style={s.selectedTerrainCity}>{selectedTerrain.city}{selectedTerrain.type ? ` • ${selectedTerrain.type}` : ''}</Text>
              </View>
              <Pressable style={s.selectedTerrainChangeBtn} onPress={() => setShowTerrainPicker(true)}>
                <MaterialIcons name="swap-horiz" size={18} color={theme.primary} />
              </Pressable>
              <Pressable style={s.selectedTerrainRemoveBtn} onPress={() => setSelectedTerrainId(null)}>
                <MaterialIcons name="close" size={18} color={theme.error} />
              </Pressable>
            </View>
          ) : (
            <Pressable style={s.selectTerrainBtn} onPress={() => setShowTerrainPicker(true)}>
              <MaterialIcons name="add-location" size={22} color={theme.success} />
              <Text style={s.selectTerrainBtnText}>{language === 'fr' ? 'Selectionner un terrain' : 'Select a court'}</Text>
            </Pressable>
          )}
          <Text style={s.terrainHint}>{language === 'fr' ? 'Optionnel — laissez vide pour un defi mondial' : 'Optional — leave empty for a worldwide challenge'}</Text>
        </View>

        {/* Settings */}
        <View style={s.settingsRow}>
          <View style={[s.field, { flex: 1 }]}>
            <Text style={s.fieldLabel}>{language === 'fr' ? 'Max participants' : 'Max participants'}</Text>
            <TextInput style={s.input} value={maxParticipants} onChangeText={setMaxParticipants} keyboardType="numeric" />
          </View>
          <View style={[s.field, { flex: 1 }]}>
            <Text style={s.fieldLabel}>{language === 'fr' ? 'Min temoins' : 'Min witnesses'}</Text>
            <TextInput style={s.input} value={minWitnesses} onChangeText={setMinWitnesses} keyboardType="numeric" />
          </View>
        </View>

        {/* Info Card */}
        <View style={s.infoCard}>
          <MaterialIcons name="info-outline" size={18} color={theme.primary} />
          <Text style={s.infoText}>
            {language === 'fr'
              ? 'Les participants devront completer leur defi pendant la plage horaire definie. Chaque resultat doit etre atteste par un minimum de temoins presents sur le lieu.'
              : 'Participants must complete their challenge during the defined time slot. Each result must be attested by a minimum number of witnesses present at the location.'}
          </Text>
        </View>

        {/* Create Button */}
        <Pressable style={[s.createBtn, saving && { opacity: 0.6 }]} onPress={handleCreate} disabled={saving}>
          {saving ? <ActivityIndicator size="small" color="#FFF" /> : (
            <>
              <MaterialIcons name="campaign" size={22} color="#FFF" />
              <Text style={s.createBtnText}>{language === 'fr' ? 'Creer l\'evenement' : 'Create event'}</Text>
            </>
          )}
        </Pressable>
      </ScrollView>

      {/* Terrain Picker Modal */}
      <Modal visible={showTerrainPicker} animationType="slide" transparent onRequestClose={() => { setShowTerrainPicker(false); setTerrainSearchQuery(''); }}>
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{language === 'fr' ? 'Choisir un terrain' : 'Choose a court'}</Text>
              <Pressable onPress={() => { setShowTerrainPicker(false); setTerrainSearchQuery(''); }}><MaterialIcons name="close" size={24} color={theme.textPrimary} /></Pressable>
            </View>
            <View style={s.terrainSearchBar}>
              <MaterialIcons name="search" size={20} color={theme.textMuted} />
              <TextInput
                style={s.terrainSearchInput}
                value={terrainSearchQuery}
                onChangeText={setTerrainSearchQuery}
                placeholder={language === 'fr' ? 'Rechercher un terrain...' : 'Search a court...'}
                placeholderTextColor={theme.textMuted}
                autoCorrect={false}
              />
              {terrainSearchQuery.length > 0 ? (
                <Pressable onPress={() => setTerrainSearchQuery('')} hitSlop={8}>
                  <MaterialIcons name="close" size={18} color={theme.textMuted} />
                </Pressable>
              ) : null}
            </View>
            <FlatList
              data={filteredTerrainsList}
              keyExtractor={(item: any) => item.id}
              renderItem={({ item }: any) => (
                <Pressable style={[s.terrainItem, selectedTerrainId === item.id && { backgroundColor: theme.success + '08', borderLeftWidth: 3, borderLeftColor: theme.success }]} onPress={() => { setSelectedTerrainId(item.id); setShowTerrainPicker(false); setTerrainSearchQuery(''); }}>
                  <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: selectedTerrainId === item.id ? theme.success + '20' : theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' }}>
                    <MaterialIcons name="place" size={20} color={selectedTerrainId === item.id ? theme.success : theme.textSecondary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.terrainName}>{item.name}</Text>
                    <Text style={s.terrainCity}>{item.city}{item.type ? ` • ${item.type}` : ''}</Text>
                  </View>
                  {selectedTerrainId === item.id ? <MaterialIcons name="check-circle" size={22} color={theme.success} /> : null}
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
                  <MaterialIcons name="search-off" size={40} color={theme.textMuted} />
                  <Text style={s.emptyList}>{terrainSearchQuery ? (language === 'fr' ? 'Aucun resultat' : 'No results') : (language === 'fr' ? 'Aucun terrain enregistre' : 'No courts registered')}</Text>
                  <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.success, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, marginTop: 8 }} onPress={() => { setShowTerrainPicker(false); setTerrainSearchQuery(''); router.push('/terrain/new' as any); }}>
                    <MaterialIcons name="add" size={18} color="#FFF" />
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#FFF' }}>{language === 'fr' ? 'Ajouter un terrain' : 'Add a court'}</Text>
                  </Pressable>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  scrollContent: { padding: 16, maxWidth: 640, alignSelf: 'center' as const, width: '100%' },
  ambassadorBadge: { borderRadius: 18, padding: 16, marginBottom: 20 },
  ambassadorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ambassadorAvatar: { width: 52, height: 52, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  ambassadorName: { fontSize: 17, fontWeight: '800', color: '#FFF' },
  ambassadorType: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: theme.textSecondary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: { backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, color: theme.textPrimary, borderWidth: 1, borderColor: '#E2E8F0' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1.5, borderColor: '#E2E8F0' },
  typeChipText: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  dateBtnText: { fontSize: 15, fontWeight: '500', color: theme.textPrimary },
  timeRow: { flexDirection: 'row', gap: 12 },
  settingsRow: { flexDirection: 'row', gap: 12 },
  infoCard: { flexDirection: 'row', gap: 10, backgroundColor: theme.primary + '08', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.primary + '15', marginBottom: 20 },
  infoText: { flex: 1, fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
  createBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#7C3AED', paddingVertical: 18, borderRadius: 18, ...Platform.select({ ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 }, android: { elevation: 4 }, default: {} }) },
  createBtnText: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  // Empty state
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyIcon: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#7C3AED', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14 },
  emptyBtnText: { fontSize: 15, fontWeight: '600', color: '#FFF' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '70%', paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  terrainItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  terrainName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  terrainCity: { fontSize: 12, color: theme.textMuted },
  emptyList: { textAlign: 'center', padding: 8, color: theme.textMuted, fontSize: 14 },
  // Terrain selector
  selectedTerrainCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, backgroundColor: theme.success + '08', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: theme.success + '30' },
  selectedTerrainIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: theme.success + '15', alignItems: 'center' as const, justifyContent: 'center' as const },
  selectedTerrainName: { fontSize: 15, fontWeight: '700' as const, color: theme.textPrimary },
  selectedTerrainCity: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  selectedTerrainChangeBtn: { padding: 8, backgroundColor: theme.primary + '15', borderRadius: 8 },
  selectedTerrainRemoveBtn: { padding: 8, backgroundColor: theme.error + '15', borderRadius: 8 },
  selectTerrainBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 10, backgroundColor: theme.success + '08', paddingVertical: 18, borderRadius: 14, borderWidth: 2, borderColor: theme.success + '25', borderStyle: 'dashed' as const },
  selectTerrainBtnText: { fontSize: 15, fontWeight: '600' as const, color: theme.success },
  terrainHint: { fontSize: 11, color: theme.textMuted, marginTop: 6, paddingLeft: 4 },
  terrainSearchBar: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginHorizontal: 16, marginVertical: 12, backgroundColor: '#F1F5F9', borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  terrainSearchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: theme.textPrimary },
});
