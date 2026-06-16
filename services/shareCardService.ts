/**
 * Share Card Service
 * Captures React Native views as images and shares via native sheet.
 * Uses react-native-view-shot + expo-sharing.
 */
import { Platform, NativeModules } from 'react-native';

export type ShareCardFormat = 'square' | 'story' | 'landscape';

export const CARD_DIMENSIONS: Record<ShareCardFormat, { width: number; height: number; label: string; labelFr: string; icon: string }> = {
  square: { width: 1080, height: 1080, label: 'Square', labelFr: 'Carre', icon: 'crop-square' },
  story: { width: 1080, height: 1920, label: 'Story', labelFr: 'Story', icon: 'crop-portrait' },
  landscape: { width: 1200, height: 630, label: 'Landscape', labelFr: 'Paysage', icon: 'crop-landscape' },
};

/**
 * Capture a view ref as a PNG image URI.
 */
export async function captureCardAsImage(viewRef: any): Promise<string | null> {
  try {
    // Guard: check native module availability before require to avoid fatal Invariant Violation
    if (Platform.OS !== 'web' && !NativeModules.RNViewShot) {
      console.log('[ShareCard] RNViewShot native module not available in this build');
      return null;
    }
    const { captureRef } = require('react-native-view-shot');
    const uri = await captureRef(viewRef, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });
    return uri;
  } catch (e) {
    console.log('[ShareCard] Capture error:', e);
    return null;
  }
}

/**
 * Share a captured image via native share sheet.
 */
export async function shareImage(uri: string, title?: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      // Web: download the image
      const a = document.createElement('a');
      a.href = uri;
      a.download = `${title || 'share-card'}.png`;
      a.click();
      return true;
    }
    const Sharing = require('expo-sharing');
    const isAvailable = await Sharing.isAvailableAsync();
    if (!isAvailable) {
      console.log('[ShareCard] Sharing not available');
      return false;
    }
    await Sharing.shareAsync(uri, {
      mimeType: 'image/png',
      dialogTitle: title || 'Share',
      UTI: 'public.png',
    });
    return true;
  } catch (e) {
    console.log('[ShareCard] Share error:', e);
    return false;
  }
}

/**
 * Capture and share in one step.
 */
export async function captureAndShare(viewRef: any, title?: string): Promise<boolean> {
  const uri = await captureCardAsImage(viewRef);
  if (!uri) return false;
  return shareImage(uri, title);
}

/**
 * Download (save) a captured image to the device gallery.
 * Uses expo-media-library on mobile, fallback to download on web.
 */
export async function downloadCardToGallery(viewRef: any, title?: string): Promise<boolean> {
  try {
    const uri = await captureCardAsImage(viewRef);
    if (!uri) return false;

    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = uri;
      a.download = `${title || 'share-card'}.png`;
      a.click();
      return true;
    }

    const MediaLibrary = require('expo-media-library');
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      console.log('[ShareCard] Media library permission denied');
      return false;
    }
    const asset = await MediaLibrary.createAssetAsync(uri);
    if (asset) return true;
    return false;
  } catch (e) {
    console.log('[ShareCard] Download error:', e);
    return false;
  }
}

/**
 * Color theme presets for share cards.
 */
export type CardColorTheme = 'dark' | 'blue' | 'green' | 'purple' | 'gold';

export const CARD_COLOR_THEMES: Record<CardColorTheme, { label: string; labelFr: string; gradients: [string, string]; accent: string; textPrimary: string; textSecondary: string }> = {
  dark: { label: 'Dark', labelFr: 'Sombre', gradients: ['#0F172A', '#1E293B'], accent: '#3B82F6', textPrimary: '#F8FAFC', textSecondary: '#94A3B8' },
  blue: { label: 'Ocean', labelFr: 'Ocean', gradients: ['#0C1929', '#1E3A5F'], accent: '#38BDF8', textPrimary: '#E0F2FE', textSecondary: '#7DD3FC' },
  green: { label: 'Forest', labelFr: 'Foret', gradients: ['#0F1F15', '#1A3A28'], accent: '#4ADE80', textPrimary: '#ECFDF5', textSecondary: '#86EFAC' },
  purple: { label: 'Royal', labelFr: 'Royal', gradients: ['#1A0F2E', '#2D1B5E'], accent: '#A78BFA', textPrimary: '#F5F3FF', textSecondary: '#C4B5FD' },
  gold: { label: 'Gold', labelFr: 'Or', gradients: ['#1F1A0F', '#3D2E10'], accent: '#FBBF24', textPrimary: '#FFFBEB', textSecondary: '#FCD34D' },
};
