/**
 * Watermark branding component for share cards.
 * Displays the UP globe logo + "Ultimate Petanque" name + QR code.
 * 
 * DEFINITIVE FIX: The watermark is now ALWAYS rendered with `position: absolute`
 * at the bottom of the card. This guarantees it is never clipped regardless of
 * content overflow. Cards must reserve bottom padding (bottomReserve) to avoid
 * content overlapping the watermark.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import QRCode from 'react-native-qrcode-svg';

const APP_DOWNLOAD_URL = 'https://ultimatepetanque.app/download';
const APP_LOGO = require('@/assets/images/logo-up-globe.png');

/** Height constants for each size — cards use these to reserve bottom space */
export const WATERMARK_HEIGHTS = {
  xs: 36,
  sm: 44,
  md: 56,
} as const;

interface WatermarkProps {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'xs';
  /** @deprecated — watermark is now always absolute. This prop is ignored. */
  absolute?: boolean;
  hideQR?: boolean;
}

export default function ShareCardWatermark({ variant = 'light', size = 'md', hideQR = false }: WatermarkProps) {
  const isDark = variant === 'dark';
  const isSm = size === 'sm' || size === 'xs';
  const isXs = size === 'xs';
  const textColor = isDark ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.85)';
  const subtextColor = isDark ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.5)';
  const bgColor = isDark ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.10)';
  const qrSize = isXs ? 20 : isSm ? 26 : 34;
  const qrColor = isDark ? '#333333' : '#FFFFFF';
  const qrBgColor = isDark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.08)';
  const logoSize = isXs ? 24 : isSm ? 32 : 40;

  return (
    <View style={[
      s.container,
      isXs && s.containerXs,
      isSm && !isXs && s.containerSm,
    ]}>
      <View style={[s.inner, { backgroundColor: bgColor }, isSm && s.innerSm, isXs && s.innerXs]}>
        {/* App Logo */}
        <View style={{ width: logoSize, height: logoSize }}>
          <Image
            source={APP_LOGO}
            style={{ width: logoSize, height: logoSize }}
            contentFit="contain"
            transition={0}
          />
        </View>
        <View style={{ flex: 1, flexShrink: 1 }}>
          <Text style={[s.appName, { color: textColor }, isSm && s.appNameSm, isXs && s.appNameXs]} numberOfLines={1}>
            Ultimate Petanque
          </Text>
          {!isXs ? (
            <Text style={[s.tagline, { color: subtextColor }, isSm && s.taglineSm]} numberOfLines={1}>
              {isSm ? 'ultimatepetanque.app' : 'Scannez pour telecharger'}
            </Text>
          ) : null}
        </View>
        {!hideQR ? (
          <View style={[s.qrWrap, { backgroundColor: qrBgColor }, isSm && s.qrWrapSm, isXs && s.qrWrapXs]}>
            <QRCode value={APP_DOWNLOAD_URL} size={qrSize} color={qrColor} backgroundColor="transparent" />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    right: 8,
    alignItems: 'center',
    zIndex: 100,
  },
  containerSm: {
    bottom: 5,
    left: 6,
    right: 6,
  },
  containerXs: {
    bottom: 4,
    left: 5,
    right: 5,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 12,
    width: '100%',
  },
  innerSm: {
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  innerXs: {
    gap: 4,
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  qrWrap: {
    borderRadius: 5,
    padding: 2.5,
    overflow: 'hidden' as const,
  },
  qrWrapSm: {
    borderRadius: 4,
    padding: 2,
  },
  qrWrapXs: {
    borderRadius: 3,
    padding: 1.5,
  },
  appName: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  appNameSm: { fontSize: 11, fontWeight: '800' },
  appNameXs: { fontSize: 9, fontWeight: '700' },
  tagline: { fontSize: 9, fontWeight: '500', marginTop: 1 },
  taglineSm: { fontSize: 7 },
});
