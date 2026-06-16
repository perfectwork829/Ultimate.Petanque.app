import { Platform } from 'react-native';
import { getSupabaseClient } from '@/template';
import { decode } from '@/services/base64';

const supabase = getSupabaseClient();

/**
 * Upload a single image to a Supabase storage bucket.
 * Returns the public URL on success, or null on failure.
 */
export async function uploadImageToStorage(
  bucketId: string,
  folderPath: string,
  fileUri: string,
): Promise<string | null> {
  try {
    // Skip if already a remote URL
    if (fileUri.startsWith('http://') || fileUri.startsWith('https://')) {
      return fileUri;
    }

    const ext = fileUri.split('.').pop()?.toLowerCase() || 'jpg';
    const mimeType = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
    const storagePath = `${folderPath}/${fileName}`;

    let base64Data: string;

    if (Platform.OS === 'web') {
      const response = await fetch(fileUri);
      const blob = await response.blob();
      base64Data = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(blob);
      });
    } else {
      const FileSystem = require('expo-file-system');
      base64Data = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    const { error: uploadError } = await supabase.storage
      .from(bucketId)
      .upload(storagePath, decode(base64Data), {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error(`Storage upload error (${bucketId}):`, uploadError);
      return null;
    }

    const { data: urlData } = supabase.storage
      .from(bucketId)
      .getPublicUrl(storagePath);

    return urlData.publicUrl;
  } catch (error) {
    console.error(`Storage upload exception (${bucketId}):`, error);
    return null;
  }
}

/**
 * Upload a player avatar to Supabase Storage.
 * Local URIs are uploaded; remote URLs are kept as-is.
 * Returns the public URL on success, or null on failure.
 */
export async function uploadPlayerAvatar(
  userId: string,
  fileUri: string,
): Promise<string | null> {
  return uploadImageToStorage('avatars', `avatars`, fileUri);
}

/**
 * Upload a boules set photo to Supabase Storage.
 * Returns the public URL on success, or null on failure.
 */
export async function uploadBoulesSetPhoto(
  userId: string,
  fileUri: string,
): Promise<string | null> {
  return uploadImageToStorage('boules-photos', userId, fileUri);
}

/**
 * Upload multiple terrain photos to Supabase Storage.
 * Local URIs are uploaded; remote URLs are kept as-is.
 * Returns array of public URLs (failed uploads are filtered out).
 */
export async function uploadTerrainPhotos(
  userId: string,
  photos: string[],
): Promise<string[]> {
  if (!photos || photos.length === 0) return [];

  const results = await Promise.all(
    photos.map((uri) => uploadImageToStorage('terrain-photos', userId, uri))
  );

  return results.filter((url): url is string => url !== null);
}
