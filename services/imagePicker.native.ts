// ============================================
// Image Picker Service - Native
// Lazy-load expo-image-picker to handle cases where
// createPermissionHook or other internals crash.
// ============================================

let _ImagePicker: typeof import('expo-image-picker') | null = null;

function getImagePicker() {
  if (!_ImagePicker) {
    try {
      _ImagePicker = require('expo-image-picker');
    } catch (e) {
      console.warn('[ImagePicker] Failed to load expo-image-picker:', e);
      _ImagePicker = null;
    }
  }
  return _ImagePicker;
}

export const MediaTypeOptions = {
  All: 'All' as const,
  Images: 'Images' as const,
  Videos: 'Videos' as const,
};

export interface ImagePickerAsset {
  uri: string;
  width: number;
  height: number;
  type?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface ImagePickerResult {
  canceled: boolean;
  assets: ImagePickerAsset[];
}

const FALLBACK_RESULT: ImagePickerResult = { canceled: true, assets: [] };
const FALLBACK_PERMISSION = { status: 'denied' as const, granted: false, canAskAgain: true, expires: 'never' as const };

export async function requestCameraPermissionsAsync() {
  const ip = getImagePicker();
  if (!ip) return FALLBACK_PERMISSION;
  try {
    return await ip.requestCameraPermissionsAsync();
  } catch (e) {
    console.warn('[ImagePicker] requestCameraPermissionsAsync error:', e);
    return FALLBACK_PERMISSION;
  }
}

export async function requestMediaLibraryPermissionsAsync() {
  const ip = getImagePicker();
  if (!ip) return FALLBACK_PERMISSION;
  try {
    return await ip.requestMediaLibraryPermissionsAsync();
  } catch (e) {
    console.warn('[ImagePicker] requestMediaLibraryPermissionsAsync error:', e);
    return FALLBACK_PERMISSION;
  }
}

export async function launchCameraAsync(options?: any): Promise<ImagePickerResult> {
  const ip = getImagePicker();
  if (!ip) return FALLBACK_RESULT;
  try {
    const result = await ip.launchCameraAsync(options);
    return result as any;
  } catch (e) {
    console.warn('[ImagePicker] launchCameraAsync error:', e);
    return FALLBACK_RESULT;
  }
}

export async function launchImageLibraryAsync(options?: any): Promise<ImagePickerResult> {
  const ip = getImagePicker();
  if (!ip) return FALLBACK_RESULT;
  try {
    // Map our MediaTypeOptions to expo-image-picker's if needed
    const mappedOptions = options ? { ...options } : {};
    if (mappedOptions.mediaTypes === MediaTypeOptions.Images) {
      mappedOptions.mediaTypes = ip.MediaTypeOptions?.Images ?? ['images'];
    } else if (mappedOptions.mediaTypes === MediaTypeOptions.Videos) {
      mappedOptions.mediaTypes = ip.MediaTypeOptions?.Videos ?? ['videos'];
    } else if (mappedOptions.mediaTypes === MediaTypeOptions.All) {
      mappedOptions.mediaTypes = ip.MediaTypeOptions?.All ?? ['images', 'videos'];
    }
    const result = await ip.launchImageLibraryAsync(mappedOptions);
    return result as any;
  } catch (e) {
    console.warn('[ImagePicker] launchImageLibraryAsync error:', e);
    return FALLBACK_RESULT;
  }
}
