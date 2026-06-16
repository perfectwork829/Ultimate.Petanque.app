// ============================================
// Image Picker Service - Web stub
// expo-image-picker uses createPermissionHook which
// is not available on web, causing a crash.
// This provides web-compatible implementations.
// ============================================

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
  assets: ImagePickerAsset[] | null;
}

async function pickImageViaInput(accept: string): Promise<ImagePickerResult> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ canceled: true, assets: null });
        return;
      }
      const uri = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        resolve({
          canceled: false,
          assets: [{
            uri,
            width: img.naturalWidth || 800,
            height: img.naturalHeight || 600,
            type: file.type.startsWith('video') ? 'video' : 'image',
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          }],
        });
      };
      img.onerror = () => {
        resolve({
          canceled: false,
          assets: [{
            uri,
            width: 800,
            height: 600,
            type: 'image',
            fileName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          }],
        });
      };
      img.src = uri;
    };
    input.oncancel = () => resolve({ canceled: true, assets: null });
    document.body.appendChild(input);
    input.click();
    // Cleanup after a delay
    setTimeout(() => {
      if (document.body.contains(input)) document.body.removeChild(input);
    }, 60000);
  });
}

export async function requestCameraPermissionsAsync() {
  return { status: 'granted' as const, granted: true, canAskAgain: true, expires: 'never' as const };
}

export async function requestMediaLibraryPermissionsAsync() {
  return { status: 'granted' as const, granted: true, canAskAgain: true, expires: 'never' as const };
}

export async function launchCameraAsync(options?: {
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
  mediaTypes?: string;
}): Promise<ImagePickerResult> {
  // On web, camera capture via file input with capture attribute
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve({ canceled: true, assets: null });
        return;
      }
      const uri = URL.createObjectURL(file);
      resolve({
        canceled: false,
        assets: [{
          uri,
          width: 800,
          height: 600,
          type: 'image',
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        }],
      });
    };
    input.oncancel = () => resolve({ canceled: true, assets: null });
    document.body.appendChild(input);
    input.click();
    setTimeout(() => {
      if (document.body.contains(input)) document.body.removeChild(input);
    }, 60000);
  });
}

export async function launchImageLibraryAsync(options?: {
  mediaTypes?: any;
  allowsEditing?: boolean;
  aspect?: [number, number];
  quality?: number;
  allowsMultipleSelection?: boolean;
  selectionLimit?: number;
}): Promise<ImagePickerResult> {
  const accept = options?.mediaTypes === MediaTypeOptions.Videos
    ? 'video/*'
    : options?.mediaTypes === MediaTypeOptions.All
    ? 'image/*,video/*'
    : 'image/*';
  return pickImageViaInput(accept);
}
