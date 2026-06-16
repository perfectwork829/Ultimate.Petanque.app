import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Platform, TextInput, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from '@/services/camera';
import * as Haptics from '@/services/haptics';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAlert, getSupabaseClient } from '@/template';
import { findEventByCode } from '@/services/sponsoredEventService';
import { redeemShareCode } from '@/services/shareService';
import { findMeetupByCode } from '@/services/meetupService';
import { useAppData } from '@/contexts/AppContext';

type DetectedType = 'event' | 'share' | 'meetup' | 'player_profile' | 'unknown';

interface ScanResult {
  type: DetectedType;
  code: string;
  label: string;
  destination?: string;
}

export default function ScannerScreen() {
  const { language } = useLanguage();
  const { showAlert } = useAlert();
  const fr = language === 'fr';
  const { players } = useAppData();

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualSearching, setManualSearching] = useState(false);
  const [similarPlayers, setSimilarPlayers] = useState<Array<{ id: string; name: string }>>([]);

  const permissionGranted = cameraPermission?.granted;

  const handleRequestPermission = async () => {
    const { granted } = await requestCameraPermission();
    if (!granted) {
      showAlert(
        fr ? 'Permission requise' : 'Permission required',
        fr ? 'Autorisez la camera pour scanner les QR codes' : 'Allow camera access to scan QR codes'
      );
    }
  };

  // Detect similar local players by name
  const findSimilarLocalPlayers = useCallback((scannedName: string) => {
    const normalize = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const scannedNorm = normalize(scannedName);
    return players.filter(p => {
      if (p.isPublic) return false; // Only local (non-public) players
      const pNorm = normalize(p.name);
      if (pNorm === scannedNorm) return true;
      if (pNorm.includes(scannedNorm) || scannedNorm.includes(pNorm)) return true;
      const aParts = scannedNorm.split(' ').filter(Boolean);
      const bParts = pNorm.split(' ').filter(Boolean);
      const overlap = aParts.filter(a => bParts.some(b => a === b || (a.length > 2 && b.startsWith(a)) || (b.length > 2 && a.startsWith(b))));
      return overlap.length >= 1 && (overlap.length / Math.max(aParts.length, bParts.length)) >= 0.5;
    }).map(p => ({ id: p.id, name: p.name }));
  }, [players]);

  const detectAndRoute = useCallback(async (rawData: string) => {
    setProcessing(true);
    setSimilarPlayers([]);

    // 1. Try event code (EVT-XXXXXX or ?event=CODE)
    const eventUrlMatch = rawData.match(/[?&]event=([A-Z0-9-]+)/i);
    const evtPatternMatch = rawData.match(/(EVT-[A-Z0-9]{4,8})/i);
    const eventCode = eventUrlMatch?.[1]?.toUpperCase() || evtPatternMatch?.[1]?.toUpperCase();

    if (eventCode) {
      const { event } = await findEventByCode(eventCode);
      if (event) {
        setResult({ type: 'event', code: eventCode, label: event.title, destination: `/sponsored-event/${event.id}` });
        setProcessing(false);
        return;
      }
    }

    // 2. Try meetup code (MTU-XXXXXX or ?meetup=CODE)
    const meetupUrlMatch = rawData.match(/[?&]meetup=([A-Z0-9-]+)/i);
    const mtuPatternMatch = rawData.match(/(MTU-[A-Z0-9]{4,8})/i);
    const meetupCode = meetupUrlMatch?.[1]?.toUpperCase() || mtuPatternMatch?.[1]?.toUpperCase();

    if (meetupCode) {
      const { meetup } = await findMeetupByCode(meetupCode);
      if (meetup) {
        setResult({ type: 'meetup', code: meetupCode, label: meetup.title, destination: `/meetup/${meetup.id}` });
        setProcessing(false);
        return;
      }
    }

    // 3. Try player profile (UUID in URL)
    const uuidMatch = rawData.match(/player\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
      || rawData.match(/profile\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
      || rawData.match(/user\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (uuidMatch) {
      const scannedId = uuidMatch[1];
      try {
        const supabase = getSupabaseClient();
        const { data: scannedPlayer } = await supabase
          .from('players')
          .select('id, name, user_id, is_public')
          .or(`id.eq.${scannedId},user_id.eq.${scannedId}`)
          .eq('is_public', true)
          .limit(1)
          .maybeSingle();
        if (scannedPlayer) {
          const similar = findSimilarLocalPlayers(scannedPlayer.name);
          setSimilarPlayers(similar);
          setResult({
            type: 'player_profile',
            code: scannedPlayer.id,
            label: scannedPlayer.name,
            destination: `/player/${scannedPlayer.id}`,
          });
          setProcessing(false);
          return;
        }
      } catch { /* silent */ }
    }

    // 4. Try share code (alphanumeric 8-12 chars)
    const cleanCode = rawData.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
    if (cleanCode.length >= 6 && cleanCode.length <= 16) {
      // Try as event code first
      const { event: evtFallback } = await findEventByCode(cleanCode);
      if (evtFallback) {
        setResult({ type: 'event', code: cleanCode, label: evtFallback.title, destination: `/sponsored-event/${evtFallback.id}` });
        setProcessing(false);
        return;
      }

      // Try as meetup code
      const { meetup: mtuFallback } = await findMeetupByCode(cleanCode);
      if (mtuFallback) {
        setResult({ type: 'meetup', code: cleanCode, label: mtuFallback.title, destination: `/meetup/${mtuFallback.id}` });
        setProcessing(false);
        return;
      }

      // Try as share code
      try {
        setResult({ type: 'share', code: cleanCode, label: fr ? 'Code de partage detecte' : 'Share code detected', destination: undefined });
        setProcessing(false);
        return;
      } catch { /* silent */ }
    }

    // 5. Try bare UUID (not in URL) — might be a player/user ID from QR
    const bareUuid = rawData.trim().match(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    if (bareUuid) {
      try {
        const supabase = getSupabaseClient();
        const { data: scannedPlayer } = await supabase
          .from('players')
          .select('id, name, user_id, is_public')
          .or(`id.eq.${bareUuid[1]},user_id.eq.${bareUuid[1]}`)
          .eq('is_public', true)
          .limit(1)
          .maybeSingle();
        if (scannedPlayer) {
          const similar = findSimilarLocalPlayers(scannedPlayer.name);
          setSimilarPlayers(similar);
          setResult({
            type: 'player_profile',
            code: scannedPlayer.id,
            label: scannedPlayer.name,
            destination: `/player/${scannedPlayer.id}`,
          });
          setProcessing(false);
          return;
        }
      } catch { /* silent */ }
    }

    // 6. Unknown code
    setResult({ type: 'unknown', code: rawData.substring(0, 50), label: fr ? 'Code non reconnu' : 'Unrecognized code' });
    setProcessing(false);
  }, [fr, findSimilarLocalPlayers]);

  const handleBarCodeScanned = useCallback(async ({ data }: { data: string }) => {
    if (scanned || processing) return;
    setScanned(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await detectAndRoute(data);
  }, [scanned, processing, detectAndRoute]);

  const handleManualSearch = useCallback(async () => {
    if (!manualCode.trim() || manualSearching) return;
    setManualSearching(true);
    await detectAndRoute(manualCode.trim());
    setManualSearching(false);
  }, [manualCode, manualSearching, detectAndRoute]);

  const handleNavigate = useCallback(() => {
    if (!result) return;
    if (result.destination) {
      router.replace(result.destination as any);
    } else if (result.type === 'share') {
      router.replace({ pathname: '/share', params: { redeemCode: result.code } } as any);
    } else {
      showAlert(fr ? 'Code non reconnu' : 'Unrecognized code', result.code);
    }
  }, [result, fr]);

  const handleReset = useCallback(() => {
    setScanned(false);
    setResult(null);
    setProcessing(false);
    setSimilarPlayers([]);
  }, []);

  const resultConfig: Record<DetectedType, { icon: string; color: string; label: string }> = {
    event: { icon: 'campaign', color: '#7C3AED', label: fr ? 'Defi Ambassadeur' : 'Ambassador Challenge' },
    meetup: { icon: 'event', color: theme.accent, label: fr ? 'RDV Petanque' : 'Petanque Meetup' },
    share: { icon: 'share', color: theme.primary, label: fr ? 'Code de Partage' : 'Share Code' },
    player_profile: { icon: 'person', color: '#0EA5E9', label: fr ? 'Profil Joueur' : 'Player Profile' },
    unknown: { icon: 'help-outline', color: theme.textMuted, label: fr ? 'Non reconnu' : 'Unknown' },
  };

  // Web fallback
  if (Platform.OS === 'web') {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}>
          <Pressable style={s.headerCloseBtn} onPress={() => router.back()}>
            <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
          </Pressable>
          <Text style={s.headerTitle}>{fr ? 'Scanner un code' : 'Scan a Code'}</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.webFallback}>
          <MaterialIcons name="qr-code-scanner" size={64} color={theme.textMuted} />
          <Text style={s.webFallbackTitle}>{fr ? 'Entrez un code' : 'Enter a code'}</Text>
          <Text style={s.webFallbackDesc}>{fr ? 'Le scanner camera est disponible sur mobile' : 'Camera scanner is available on mobile'}</Text>
          <View style={s.manualInputRow}>
            <TextInput
              style={s.manualInput}
              value={manualCode}
              onChangeText={setManualCode}
              placeholder={fr ? 'Code (EVT-XXX, MTU-XXX...)' : 'Code (EVT-XXX, MTU-XXX...)'}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="characters"
              autoFocus
            />
            <Pressable style={[s.manualSearchBtn, (!manualCode.trim() || manualSearching) && { opacity: 0.5 }]} onPress={handleManualSearch} disabled={!manualCode.trim() || manualSearching}>
              {manualSearching ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="search" size={22} color="#FFF" />}
            </Pressable>
          </View>
          {result ? (
            <Animated.View entering={FadeInDown.duration(300)} style={s.resultCard}>
              <View style={[s.resultIconBg, { backgroundColor: resultConfig[result.type].color + '15' }]}>
                <MaterialIcons name={resultConfig[result.type].icon as any} size={24} color={resultConfig[result.type].color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.resultType}>{resultConfig[result.type].label}</Text>
                <Text style={s.resultLabel} numberOfLines={1}>{result.label}</Text>
                <Text style={s.resultCode}>{result.code}</Text>
              </View>
              {result.type !== 'unknown' ? (
                <Pressable style={[s.resultGoBtn, { backgroundColor: resultConfig[result.type].color }]} onPress={handleNavigate}>
                  <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
                </Pressable>
              ) : null}
            </Animated.View>
          ) : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={s.scannerContainer}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={s.scannerHeader}>
          <Pressable style={s.scannerCloseBtn} onPress={() => router.back()}>
            <MaterialIcons name="close" size={24} color="#FFF" />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.scannerTitle}>{fr ? 'Scanner un code' : 'Scan a Code'}</Text>
            <Text style={s.scannerSubtitle}>{fr ? 'Evenements, meetups, profils, partages' : 'Events, meetups, profiles, shares'}</Text>
          </View>
          <Pressable style={s.scannerCloseBtn} onPress={() => setShowManualEntry(!showManualEntry)}>
            <MaterialIcons name="keyboard" size={22} color="#FFF" />
          </Pressable>
        </View>

        {/* Manual entry */}
        {showManualEntry ? (
          <Animated.View entering={FadeIn.duration(200)} style={s.manualBar}>
            <TextInput
              style={s.manualBarInput}
              value={manualCode}
              onChangeText={setManualCode}
              placeholder={fr ? 'Entrez un code...' : 'Enter code...'}
              placeholderTextColor="rgba(255,255,255,0.4)"
              autoCapitalize="characters"
              autoFocus
            />
            <Pressable style={[s.manualBarBtn, (!manualCode.trim() || manualSearching) && { opacity: 0.5 }]} onPress={handleManualSearch} disabled={!manualCode.trim() || manualSearching}>
              {manualSearching ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialIcons name="search" size={20} color="#FFF" />}
            </Pressable>
          </Animated.View>
        ) : null}

        {/* Camera / Permission */}
        {!permissionGranted ? (
          <View style={s.permissionView}>
            <View style={s.permissionIconBg}>
              <MaterialIcons name="camera-alt" size={48} color="rgba(255,255,255,0.6)" />
            </View>
            <Text style={s.permissionTitle}>{fr ? 'Acces camera requis' : 'Camera access required'}</Text>
            <Text style={s.permissionDesc}>{fr ? 'Pour scanner les QR codes de l\'app' : 'To scan app QR codes'}</Text>
            <Pressable style={s.permissionBtn} onPress={handleRequestPermission}>
              <MaterialIcons name="camera" size={20} color="#FFF" />
              <Text style={s.permissionBtnText}>{fr ? 'Autoriser la camera' : 'Allow camera'}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={s.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
            />

            {/* Scanning overlay */}
            <View style={s.overlay}>
              <View style={s.overlayTop} />
              <View style={s.overlayMiddle}>
                <View style={s.overlaySide} />
                <View style={s.scanFrame}>
                  <View style={[s.corner, { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 }]} />
                  <View style={[s.corner, { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 }]} />
                  <View style={[s.corner, { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 }]} />
                  <View style={[s.corner, { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 }]} />
                  {processing ? (
                    <View style={s.processingOverlay}>
                      <ActivityIndicator size="large" color="#FFF" />
                      <Text style={s.processingText}>{fr ? 'Detection...' : 'Detecting...'}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={s.overlaySide} />
              </View>
              <View style={s.overlayBottom}>
                {!scanned ? (
                  <>
                    <Text style={s.hintText}>{fr ? 'Placez le QR code dans le cadre' : 'Place QR code in frame'}</Text>
                    <View style={s.supportedRow}>
                      {[
                        { icon: 'campaign', label: fr ? 'Defis' : 'Events', color: '#7C3AED' },
                        { icon: 'event', label: fr ? 'Meetups' : 'Meetups', color: theme.accent },
                        { icon: 'person', label: fr ? 'Profils' : 'Profiles', color: '#0EA5E9' },
                        { icon: 'share', label: fr ? 'Partages' : 'Shares', color: theme.primary },
                      ].map((item, idx) => (
                        <View key={idx} style={s.supportedChip}>
                          <MaterialIcons name={item.icon as any} size={12} color={item.color} />
                          <Text style={[s.supportedChipText, { color: item.color }]}>{item.label}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}
              </View>
            </View>
          </View>
        )}

        {/* Result Card */}
        {result ? (
          <Animated.View entering={FadeInDown.duration(300)} style={s.resultOverlay}>
            <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <View style={s.resultCard}>
                <View style={[s.resultIconBg, { backgroundColor: resultConfig[result.type].color + '15' }]}>
                  <MaterialIcons name={resultConfig[result.type].icon as any} size={28} color={resultConfig[result.type].color} />
                </View>
                <View style={{ flex: 1, marginHorizontal: 12 }}>
                  <Text style={s.resultType}>{resultConfig[result.type].label}</Text>
                  <Text style={s.resultLabel} numberOfLines={2}>{result.label}</Text>
                  <Text style={s.resultCode}>{result.code.substring(0, 20)}</Text>
                </View>
                <View style={s.resultActions}>
                  {result.type !== 'unknown' ? (
                    <Pressable style={[s.resultGoBtn, { backgroundColor: resultConfig[result.type].color }]} onPress={handleNavigate}>
                      <MaterialIcons name="arrow-forward" size={20} color="#FFF" />
                      <Text style={s.resultGoBtnText}>{fr ? 'Ouvrir' : 'Open'}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={s.resultRetryBtn} onPress={handleReset}>
                    <MaterialIcons name="refresh" size={18} color="#FFF" />
                    <Text style={s.resultRetryText}>{fr ? 'Re-scanner' : 'Re-scan'}</Text>
                  </Pressable>
                </View>
              </View>

              {/* Similar local players detection for transfer */}
              {result.type === 'player_profile' && similarPlayers.length > 0 ? (
                <View style={s.transferSuggestion}>
                  <View style={s.transferSuggestionHeader}>
                    <MaterialIcons name="swap-horiz" size={18} color="#0EA5E9" />
                    <Text style={s.transferSuggestionTitle}>
                      {fr ? `${similarPlayers.length} joueur(s) local similaire(s) detecte(s)` : `${similarPlayers.length} similar local player(s) detected`}
                    </Text>
                  </View>
                  <Text style={s.transferSuggestionDesc}>
                    {fr ? 'Souhaitez-vous transferer leurs matchs vers ce profil inscrit ?' : 'Would you like to transfer their matches to this registered profile?'}
                  </Text>
                  {similarPlayers.map(sp => (
                    <Pressable
                      key={sp.id}
                      style={s.transferSuggestionItem}
                      onPress={() => {
                        Haptics.selectionAsync();
                        router.replace({ pathname: `/player/${sp.id}` as any, params: { openTransfer: 'true', transferTargetId: result.code } });
                      }}
                    >
                      <View style={s.transferSuggestionItemIcon}>
                        <MaterialIcons name="person" size={16} color="#0EA5E9" />
                      </View>
                      <Text style={s.transferSuggestionItemName} numberOfLines={1}>{sp.name}</Text>
                      <View style={s.transferSuggestionItemAction}>
                        <MaterialIcons name="send" size={14} color="#0EA5E9" />
                        <Text style={s.transferSuggestionItemActionText}>{fr ? 'Transferer' : 'Transfer'}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </Animated.View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border },
  headerCloseBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '600', color: theme.textPrimary },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.8)', gap: 8 },
  scannerCloseBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  scannerTitle: { fontSize: 17, fontWeight: '700', color: '#FFF' },
  scannerSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  manualBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: 'rgba(0,0,0,0.8)', gap: 8 },
  manualBarInput: { flex: 1, fontSize: 16, fontWeight: '600', color: '#FFF', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, letterSpacing: 1 },
  manualBarBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  permissionView: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  permissionIconBg: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  permissionTitle: { fontSize: 20, fontWeight: '700', color: '#FFF', textAlign: 'center', marginBottom: 8 },
  permissionDesc: { fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', marginBottom: 24 },
  permissionBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#7C3AED', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 16 },
  permissionBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  cameraWrap: { flex: 1, position: 'relative' },
  overlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  overlayTop: { flex: 1, width: '100%', backgroundColor: 'rgba(0,0,0,0.55)' },
  overlayMiddle: { flexDirection: 'row', height: 280 },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  scanFrame: { width: 280, height: 280, position: 'relative', alignItems: 'center', justifyContent: 'center' },
  corner: { position: 'absolute', width: 36, height: 36, borderColor: '#7C3AED' },
  processingOverlay: { alignItems: 'center', gap: 12 },
  processingText: { fontSize: 14, fontWeight: '600', color: '#FFF' },
  overlayBottom: { flex: 1, width: '100%', backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', paddingTop: 32, gap: 16 },
  hintText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  supportedRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  supportedChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  supportedChipText: { fontSize: 11, fontWeight: '700' },
  resultOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16, paddingBottom: 32, backgroundColor: 'rgba(0,0,0,0.85)' },
  resultCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 20, padding: 16 },
  resultIconBg: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  resultType: { fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  resultLabel: { fontSize: 16, fontWeight: '700', color: theme.textPrimary, marginTop: 2 },
  resultCode: { fontSize: 12, fontWeight: '600', color: theme.textMuted, marginTop: 2, letterSpacing: 1 },
  resultActions: { gap: 6 },
  resultGoBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  resultGoBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  resultRetryBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.06)' },
  resultRetryText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },
  // Transfer suggestion
  transferSuggestion: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginTop: 10, borderWidth: 2, borderColor: '#0EA5E930' },
  transferSuggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  transferSuggestionTitle: { fontSize: 13, fontWeight: '700', color: '#0EA5E9', flex: 1 },
  transferSuggestionDesc: { fontSize: 12, color: theme.textSecondary, marginBottom: 12, lineHeight: 17 },
  transferSuggestionItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F0F9FF', borderRadius: 12, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#BAE6FD' },
  transferSuggestionItemIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#0EA5E915', alignItems: 'center', justifyContent: 'center' },
  transferSuggestionItemName: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.textPrimary },
  transferSuggestionItemAction: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#0EA5E9', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10 },
  transferSuggestionItemActionText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  // Web fallback
  webFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  webFallbackTitle: { fontSize: 20, fontWeight: '700', color: theme.textPrimary },
  webFallbackDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginBottom: 16 },
  manualInputRow: { flexDirection: 'row', width: '100%', maxWidth: 400, gap: 8 },
  manualInput: { flex: 1, fontSize: 18, fontWeight: '700', color: theme.textPrimary, backgroundColor: '#F1F5F9', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, textAlign: 'center', letterSpacing: 2, borderWidth: 1, borderColor: '#E2E8F0' },
  manualSearchBtn: { width: 52, height: 52, borderRadius: 14, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
});
