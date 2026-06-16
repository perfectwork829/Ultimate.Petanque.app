import React, { useState } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as Haptics from '@/services/haptics';
import * as ImagePicker from '@/services/imagePicker';
import { decode } from '@/services/base64';
import { getSupabaseClient } from '@/template';
import { invalidateAmbassadorCache } from '@/services/ambassadorService';

interface Props {
  sponsorId: string;
  userId: string;
  galleryPhotos: string[];
  setGalleryPhotos: (photos: string[]) => void;
  tierColor: string;
  fr: boolean;
  showAlert: (title: string, message?: string) => void;
}

export default function PartnerGalleryManager({ sponsorId, userId, galleryPhotos, setGalleryPhotos, tierColor, fr, showAlert }: Props) {
  const supabase = getSupabaseClient();
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [deletingIdx, setDeletingIdx] = useState<number | null>(null);

  const handleUpload = async () => {
    if (!sponsorId || !userId) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { showAlert(fr ? 'Permission requise' : 'Permission required'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    if (galleryPhotos.length >= 10) { showAlert(fr ? 'Maximum 10 photos' : 'Maximum 10 photos'); return; }
    setUploadingGallery(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const path = `gallery/${sponsorId}/${Date.now()}.${ext}`;
      let base64: string;
      if (Platform.OS === 'web') {
        const resp = await fetch(asset.uri);
        const blob = await resp.blob();
        base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(blob);
        });
      } else {
        const FileSystem = require('expo-file-system');
        base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      }
      const { error: upErr } = await supabase.storage.from('partner-gallery').upload(path, decode(base64), {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: true,
      });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('partner-gallery').getPublicUrl(path);
      const updated = [...galleryPhotos, urlData.publicUrl];
      await supabase.from('ambassadors').update({ gallery_photos: updated, updated_at: new Date().toISOString() }).eq('id', sponsorId);
      setGalleryPhotos(updated);
      invalidateAmbassadorCache();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      showAlert(fr ? 'Erreur' : 'Error', e.message);
    }
    setUploadingGallery(false);
  };

  const handleDelete = async (idx: number) => {
    setDeletingIdx(idx);
    const updated = galleryPhotos.filter((_, i) => i !== idx);
    const { error } = await supabase.from('ambassadors').update({ gallery_photos: updated, updated_at: new Date().toISOString() }).eq('id', sponsorId);
    if (!error) {
      setGalleryPhotos(updated);
      invalidateAmbassadorCache();
      Haptics.selectionAsync();
    }
    setDeletingIdx(null);
  };

  return (
    <View style={s.card}>
      <Text style={s.title}>{fr ? 'Galerie photos' : 'Photo Gallery'}</Text>
      <Text style={s.desc}>
        {fr
          ? 'Ajoutez des photos de vos evenements, terrains sponsorises ou equipe. Elles apparaitront sur votre page partenaire publique.'
          : 'Add photos of your events, sponsored courts or team. They will appear on your public partner page.'}
      </Text>

      {galleryPhotos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 12 }}>
          {galleryPhotos.map((photoUri, idx) => (
            <View key={idx} style={{ position: 'relative' }}>
              <Image source={{ uri: photoUri }} style={{ width: 120, height: 90, borderRadius: 12 }} contentFit="cover" transition={200} cachePolicy="memory-disk" />
              <Pressable
                style={({ pressed }) => [s.deleteBtn, pressed && { transform: [{ scale: 0.9 }] }]}
                onPress={() => handleDelete(idx)}
                disabled={deletingIdx === idx}
              >
                {deletingIdx === idx ? <ActivityIndicator size={12} color="#FFF" /> : <MaterialIcons name="close" size={14} color="#FFF" />}
              </Pressable>
              <View style={s.indexBadge}>
                <Text style={s.indexText}>{idx + 1}/{galleryPhotos.length}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={[s.emptyState, { borderColor: tierColor + '20' }]}>
          <MaterialIcons name="add-photo-alternate" size={36} color={tierColor + '50'} />
          <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>{fr ? 'Aucune photo dans la galerie' : 'No photos in gallery'}</Text>
        </View>
      )}

      <Pressable
        style={({ pressed }) => [s.uploadBtn, { backgroundColor: tierColor + '10', borderColor: tierColor + '25' }, uploadingGallery && { opacity: 0.5 }, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}
        onPress={handleUpload}
        disabled={uploadingGallery}
      >
        {uploadingGallery ? <ActivityIndicator size="small" color={tierColor} /> : (
          <>
            <MaterialIcons name="add-a-photo" size={18} color={tierColor} />
            <Text style={[s.uploadText, { color: tierColor }]}>{fr ? 'Ajouter une photo' : 'Add a photo'}</Text>
          </>
        )}
      </Pressable>
      <Text style={s.hint}>
        {fr ? `${galleryPhotos.length}/10 photos • Format 16:9 recommande` : `${galleryPhotos.length}/10 photos • 16:9 format recommended`}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  title: { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 6 },
  desc: { fontSize: 12, color: '#94A3B8', lineHeight: 18, marginBottom: 14 },
  emptyState: { alignItems: 'center', paddingVertical: 20, backgroundColor: '#F8FAFC', borderRadius: 14, borderWidth: 1, borderStyle: 'dashed' as any, marginBottom: 12 },
  deleteBtn: { position: 'absolute', top: 4, right: 4, width: 26, height: 26, borderRadius: 13, backgroundColor: 'rgba(239,68,68,0.9)', alignItems: 'center', justifyContent: 'center' },
  indexBadge: { position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  indexText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  uploadBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed' as any },
  uploadText: { fontSize: 14, fontWeight: '700' },
  hint: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 8 },
});
