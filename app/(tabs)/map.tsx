import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  TextInput,
  FlatList,
  Modal,
  Switch,
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Keyboard,
  InteractionManager,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
// react-native-maps is loaded dynamically below (Platform !== 'web')
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import Animated, { FadeIn, FadeInDown, FadeInUp, useSharedValue, useAnimatedStyle, useAnimatedProps, withRepeat, withSequence, withTiming, cancelAnimation } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Linking } from 'react-native';
import theme from '@/constants/theme';
import config from '@/constants/config';
import { useAppData, useAppActions } from '@/contexts/AppContext';
import { useAuth } from '@/template';
import { useAlert } from '@/template';
import { getSupabaseClient } from '@/template';
import { useLanguage } from '@/hooks/useLanguage';
import { getEloRank, ELO_RANKS, EloRankTier } from '@/services/eloService';
import { getTrustScoreColor, getTrustScoreIcon, getTrustLevelLabel, TrustScoreData } from '@/services/trustScoreService';
import {
  fetchPublicPlayers, fetchPublicClubs, fetchPublicTerrains, fetchPublicTournaments,
  toggleItemPublic, importPublicItemToDirectory, getMyPublicableItems,
} from '@/services/publicItemsService';
import { getSponsoredEvents, SponsoredEvent } from '@/services/sponsoredEventService';
import { getMyActiveMeetups, inviteSingleUserToMeetup, Meetup as MeetupType } from '@/services/meetupService';
import AdBanner from '@/components/ui/AdBanner';
import { useTerrainActivity, TerrainActivityInfo } from '@/hooks/useTerrainActivity';

import { useToast } from '@/components/ui/Toast';
import LocationPicker, { LocationData } from '@/components/ui/LocationPicker';
import { Image as RNImage } from 'react-native'; // 👈 use RN Image, not expo-image
import { fetchAmbassadors, invalidateAmbassadorCache, Ambassador } from '@/services/ambassadorService';
import { ensureMapCoordinates, isMapPartnerBadge, isValidMapCoord as isValidMapCoordUtil } from '@/utils/mapPlayerLocation';
import { shouldUseNativeMapView } from '@/utils/shouldUseNativeMapView';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { trackAmbassadorEvent } from '@/services/ambassadorAnalyticsService';
// import MapView from "react-native-map-clustering";

type MarkerType = 'all' | 'terrains' | 'clubs' | 'tournaments' | 'players' | 'events' | 'partners';
type MapMode = 'all' | 'public';

let MapViewComponent: React.ComponentType<any> | null = null;
let MarkerComponent: React.ComponentType<any> | null = null;
let CircleComponent: React.ComponentType<any> | null = null;
let PROVIDER_GOOGLE: any = undefined;

if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  
  MapViewComponent = Maps.default;
  MarkerComponent = Maps.Marker;
  CircleComponent = Maps.Circle;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}

/** Pulse rings as native map circles — marker bitmaps on Android freeze when tracksViewChanges=false. */
const AnimatedMapCircle = CircleComponent
  ? Animated.createAnimatedComponent(CircleComponent)
  : null;

const MAP_PULSE_BASE_RADIUS_M = 35;
const MAP_PULSE_RADIUS_SPAN_M = 70;

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  if (h.length < 6) return { r: 34, g: 197, b: 94 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/** Map markers are rasterized for Google Maps; Android `elevation` draws outside layout bounds and clips (flat edge on circles). */
const MAP_MARKER_SHADOW = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 3,
  },
  default: {},
});

const IS_ANDROID_MAP = Platform.OS === 'android';
const USE_NATIVE_MAP = shouldUseNativeMapView();
/**
 * Android rasterizes custom markers to a bitmap. Yoga/Fabric can under-report size → quarter-circle clip.
 * Fixed canvas + single disc child + patches/react-native-maps (MapMarker.createDrawable).
 */
const MAP_MARKER_CANVAS = IS_ANDROID_MAP ? 64 : 56;
const MAP_MARKER_DISC = IS_ANDROID_MAP ? 40 : 36;
/** Android bitmap must fit sonar rings (disc × ~1.8 scale) without clipping */
const MAP_MARKER_PULSE_CANVAS = IS_ANDROID_MAP ? 88 : 72;

function getMapMarkerNativeStyle(opts?: { pulse?: boolean }): ViewStyle | undefined {
  if (!IS_ANDROID_MAP) return undefined;
  const size = opts?.pulse ? MAP_MARKER_PULSE_CANVAS : MAP_MARKER_CANVAS;
  return { width: size, height: size };
}
const mapMarkerCanvasStyle: ViewStyle = {
  width: MAP_MARKER_CANVAS,
  height: MAP_MARKER_CANVAS,
  minWidth: MAP_MARKER_CANVAS,
  minHeight: MAP_MARKER_CANVAS,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'transparent',
};
/** Pass explicit size to Marker so SizeReportingShadowNode gets correct dimensions. */
const MAP_MARKER_NATIVE_STYLE: ViewStyle | undefined = IS_ANDROID_MAP
  ? { width: MAP_MARKER_CANVAS, height: MAP_MARKER_CANVAS }
  : undefined;

/** Android: avoid HW texture compositing that clips rounded marker bitmaps. */
const MAP_MARKER_NO_HW_TEXTURE: ViewStyle =
  IS_ANDROID_MAP ? ({ renderToHardwareTextureAndroid: false } as ViewStyle) : {};

const MapMarkerCanvas = React.memo(({ children }: { children: React.ReactNode }) => (
  <View style={mapMarkerCanvasStyle} collapsable={false} pointerEvents="none">
    {children}
  </View>
));

/** One circular disc — icon/photo + optional corner badge kept inside the disc bounds. */
const MapMarkerDisc = React.memo(({
  size = MAP_MARKER_DISC,
  color,
  borderColor = '#FFF',
  borderWidth = 2,
  children,
  badge,
}: {
  size?: number;
  color: string;
  borderColor?: string;
  borderWidth?: number;
  children?: React.ReactNode;
  badge?: React.ReactNode;
}) => (
  <MapMarkerCanvas>
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth,
        borderColor,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        ...MAP_MARKER_NO_HW_TEXTURE,
      }}
    >
      {children}
      {badge}
    </View>
  </MapMarkerCanvas>
));

/** @deprecated alias */
const MapMarkerSlot = MapMarkerCanvas;

const MAP_MARKER_BUBBLE_ANCHOR = { x: 0.5, y: 0.5 };
/** Corner badge inside the disc (never outside canvas — avoids Android bitmap clip). */
const MAP_MARKER_CORNER_BADGE = { position: 'absolute' as const, bottom: 0, right: 0 };

function isValidMapCoord(lat: unknown, lng: unknown): boolean {
  if (lat == null || lng == null || typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (lat === 0 && lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

const MAP_ITEM_DEFAULT_ICONS: Record<string, string> = {
  terrains: 'sports-soccer',
  clubs: 'home',
  tournaments: 'emoji-events',
  players: 'person',
  events: 'campaign',
  partners: 'handshake',
};

function getMapItemIcon(itemType: string, terrainType?: string | null): string {
  if (itemType === 'terrains' && terrainType) {
    const tc = config.terrainTypes.find(tt => tt.id === terrainType);
    if (tc?.icon) return tc.icon;
  }
  return MAP_ITEM_DEFAULT_ICONS[itemType] || 'place';
}

/** Primary photo for map pin (excludes PDF tournament posters). */
function getMapItemPhoto(item: any): string | null {
  if (!item) return null;
  switch (item.itemType) {
    case 'terrains':
      return item.photos?.[0] || null;
    case 'clubs':
      return item.logo || null;
    case 'tournaments': {
      const url = item.posterUrl as string | undefined;
      return url && !url.toLowerCase().endsWith('.pdf') ? url : null;
    }
    case 'players':
      return item.avatar || item.photo || null;
    case 'partners':
      return item.photo || item.logo || null;
    default:
      return null;
  }
}

function isSponsoredMapItem(item: any): boolean {
  return !!(item?.sponsorId && (item._sponsorPhoto || item._sponsorColor));
}

function isPartnerMapItem(item: any): boolean {
  return item?.itemType === 'partners' || item?._itemType === 'partners';
}

function isAmbassadorPlayerItem(item: any): boolean {
  return item?.itemType === 'players' && !!item?._tier;
}

/** Partner/ambassador bottom sheet — not the standard terrain/club/player card. */
function shouldUsePartnerPopup(item: any, type?: string): boolean {
  const itemType = item?.itemType ?? type;
  return itemType === 'partners' || isPartnerMapItem(item) || isAmbassadorPlayerItem(item);
}

function getMapItemDisplayName(item: any): string {
  return item?.name || item?.displayName || '-';
}

function getAmbassadorTierLabel(item: { _tier?: string }, language: 'fr' | 'en'): string {
  const isPartner = isPartnerMapItem(item);
  const isGold = item._tier === 'gold_sponsor';
  if (isPartner) {
    if (isGold) return language === 'fr' ? 'Partenaire Or' : 'Gold Partner';
    return language === 'fr' ? 'Partenaire Argent' : 'Silver Partner';
  }
  if (!item._tier) return '';
  return String(item._tier).replace(/_/g, ' ');
}

function normalizeBrandColor(brandColor?: string | null): string | undefined {
  if (!brandColor || typeof brandColor !== 'string') return undefined;
  const withHash = brandColor.startsWith('#') ? brandColor : `#${brandColor}`;
  const clean = withHash.replace('#', '');
  return /^[0-9A-Fa-f]{6}$/.test(clean) ? withHash : undefined;
}

function hexToRgba(hex: string, alpha = 1): string {
  const clean = hex.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(clean)) {
    return `rgba(120, 144, 156, ${alpha})`;
  }
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ============================================
// CLUSTERING LOGIC
// ============================================
interface ClusterItem {
  id: string;
  latitude: number;
  longitude: number;
  itemType: string;
  _isPublic: boolean;
  [key: string]: any;
}

interface Cluster {
  id: string;
  latitude: number;
  longitude: number;
  items: ClusterItem[];
  isCluster: boolean;
}

/** Android: custom marker React views rasterize over the RN bridge and freeze JS taps. Use native pin/image markers instead. */
const ANDROID_USE_SIMPLE_MARKERS = IS_ANDROID_MAP;
/** Android/emulator: fewer markers = less native work on map open. */
const MAX_VISIBLE_MARKERS = IS_ANDROID_MAP ? 24 : 200;

type AndroidPinColor = 'red' | 'turquoise' | 'green' | 'yellow' | 'purple';

function resolveAndroidPinColor(hex: string, opts?: { live?: boolean; habitual?: boolean }): AndroidPinColor {
  if (opts?.live) return 'red';
  if (opts?.habitual) return 'green';
  const h = hex.toLowerCase();
  if (h.includes('22c55e') || h.includes('10b981') || h.includes('064e3b')) return 'green';
  if (h.includes('ef4444') || h.includes('dc2626') || h.includes('f87171')) return 'red';
  if (h.includes('f59e0b') || h.includes('d97706') || h.includes('eab308')) return 'yellow';
  if (h.includes('06b6d4') || h.includes('0ea5e9') || h.includes('14b8a6')) return 'turquoise';
  return 'purple';
}
const ELO_RANKS_REVERSED = [...ELO_RANKS].reverse();

function clusterMarkers(items: ClusterItem[], region: { latitudeDelta: number; longitudeDelta: number; latitude?: number; longitude?: number } | null): Cluster[] {
  const validItems = items.filter(item =>
    isValidMapCoord(item.location?.latitude, item.location?.longitude)
  );

  if (!region || validItems.length === 0) return validItems.slice(0, MAX_VISIBLE_MARKERS).map(item => ({
    id: `single-${item.itemType}-${item.id}`,
    latitude: item.location?.latitude || 0,
    longitude: item.location?.longitude || 0,
    items: [item],
    isCluster: false,
  }));

  // Viewport filtering: only process items within the visible region (with padding)
  const latPad = region.latitudeDelta * 0.3;
  const lngPad = region.longitudeDelta * 0.3;
  const regionLat = region.latitude ?? 46.6;
  const regionLng = region.longitude ?? 2.3;
  const minLat = regionLat - region.latitudeDelta / 2 - latPad;
  const maxLat = regionLat + region.latitudeDelta / 2 + latPad;
  const minLng = regionLng - region.longitudeDelta / 2 - lngPad;
  const maxLng = regionLng + region.longitudeDelta / 2 + lngPad;

  const viewportItems = validItems.filter(item => {
    const lat = item.location?.latitude || 0;
    const lng = item.location?.longitude || 0;
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
  });

  // Cap at MAX_VISIBLE_MARKERS to prevent memory issues
  const cappedItems = viewportItems.length > MAX_VISIBLE_MARKERS ? viewportItems.slice(0, MAX_VISIBLE_MARKERS) : viewportItems;

  // Grid cell size scales with zoom — smaller cells = tighter grouping when zoomed in
  const cellFactor =
    region.latitudeDelta < 0.1 ? 0.028 :
    region.latitudeDelta < 1 ? 0.04 :
    region.latitudeDelta < 8 ? 0.05 : 0.04;
  const cellLat = Math.max(region.latitudeDelta * cellFactor, 0.006);
  const cellLng = Math.max(region.longitudeDelta * cellFactor, 0.006);

  // Street-level only: show individual pins
  if (region.latitudeDelta < 0.012) {
    return cappedItems.map(item => ({
      id: `single-${item.itemType}-${item.id}`,
      latitude: item.location?.latitude || 0,
      longitude: item.location?.longitude || 0,
      items: [item],
      isCluster: false,
    }));
  }

  const grid: Record<string, ClusterItem[]> = {};

  cappedItems.forEach(item => {
    const lat = item.location?.latitude;
    const lng = item.location?.longitude;
    if (lat === undefined || lat === null || lng === undefined || lng === null) return;
    if (lat === 0 && lng === 0) return;
    const cellKey = `${Math.floor(lat / cellLat)}_${Math.floor(lng / cellLng)}`;
    if (!grid[cellKey]) grid[cellKey] = [];
    grid[cellKey].push(item);
  });

  const clusters: Cluster[] = [];

  Object.entries(grid).forEach(([key, cellItems]) => {
    if (cellItems.length === 1) {
      const item = cellItems[0];
      clusters.push({
        id: `single-${item.itemType}-${item.id}`,
        latitude: item.location?.latitude || 0,
        longitude: item.location?.longitude || 0,
        items: [item],
        isCluster: false,
      });
    } else {
      // Calculate centroid
      let sumLat = 0, sumLng = 0;
      cellItems.forEach(item => {
        sumLat += item.location?.latitude || 0;
        sumLng += item.location?.longitude || 0;
      });
      clusters.push({
        id: `cluster-${key}`,
        latitude: sumLat / cellItems.length,
        longitude: sumLng / cellItems.length,
        items: cellItems,
        isCluster: true,
      });
    }
  });

  return clusters;
}

// ============================================
// PARTNER MARKER COMPONENT (Gold/Silver)
// ============================================
const TIER_COLORS: Record<string, { primary: string; bg: string; border: string }> = {
  gold_sponsor: { primary: '#D4A017', bg: '#FFFBEB', border: '#F59E0B' },
  sponsor: { primary: '#78909C', bg: '#ECEFF1', border: '#90A4AE' },
};

interface PartnerMarkerData extends Ambassador {
  _tier: string;
  /** Club markers pass `logo` from directory payload */
  logo?: string | null;
}

const PartnerMarkerView = React.memo(
  ({ partner, onReady }: { partner: PartnerMarkerData; onReady?: () => void }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    const handleLoad = useCallback(() => {
      setImageLoaded(true);
      onReady?.(); // signal parent to set tracksViewChanges=false
    }, [onReady]);

    const handleError = useCallback(() => {
      setImageError(true);
      onReady?.();
    }, [onReady]);

    useEffect(() => {
      if (!partner.photo) onReady?.();
    }, [partner.photo, onReady]);

    const customColor = normalizeBrandColor(partner.brandColor);
    const tier = customColor
      ? {
          primary: customColor,
          bg: hexToRgba(customColor, 0.5),
          border: customColor,
        }
      : TIER_COLORS[partner._tier] || TIER_COLORS.sponsor;

    const isGold = partner._tier === 'gold_sponsor';
    const disc = IS_ANDROID_MAP ? MAP_MARKER_DISC : (isGold ? 44 : 38);
    const imageSize = disc - 6;

    return (
      <MapMarkerDisc
        size={disc}
        color={tier.bg}
        borderColor={tier.border}
        borderWidth={isGold ? 3 : 2.5}
        badge={(
          <View style={[pMarkerStyles.badge, MAP_MARKER_CORNER_BADGE, { backgroundColor: tier.primary }]}>
            <MaterialIcons name={isGold ? 'star' : 'workspace-premium'} size={7} color="#FFF" />
          </View>
        )}
      >
        {partner.photo && !imageError ? (
          <>
            {!imageLoaded ? (
              <MaterialIcons name={isGold ? 'workspace-premium' : 'handshake'} size={isGold ? 20 : 16} color="#fff" style={{ position: 'absolute' }} />
            ) : null}
            <RNImage
              source={{ uri: partner.photo, cache: 'force-cache' }}
              style={{ width: imageSize, height: imageSize, borderRadius: imageSize / 2, backgroundColor: tier.bg, opacity: imageLoaded ? 1 : 0 }}
              resizeMode="cover"
              onLoad={handleLoad}
              onError={handleError}
            />
          </>
        ) : (
          <MaterialIcons name={isGold ? 'workspace-premium' : 'handshake'} size={isGold ? 20 : 16} color="#fff" />
        )}
      </MapMarkerDisc>
    );
  }
);

const ClubMarkerView = React.memo(
  ({ partner, onReady }: { partner: PartnerMarkerData; onReady?: () => void }) => {
    const [imageLoaded, setImageLoaded] = useState(false);
    const [imageError, setImageError] = useState(false);

    const handleLoad = useCallback(() => {
      setImageLoaded(true);
      onReady?.(); // signal parent to set tracksViewChanges=false
    }, [onReady]);

    const handleError = useCallback(() => {
      setImageError(true);
      onReady?.();
    }, [onReady]);

    useEffect(() => {
      if (!partner.logo) onReady?.();
    }, [partner.logo, onReady]);

    const customColor = normalizeBrandColor(partner.brandColor);
    const tier = customColor
      ? {
          primary: customColor,
          bg: hexToRgba(customColor, 0.5),
          border: customColor,
        }
      : TIER_COLORS[partner._tier] || TIER_COLORS.sponsor;

    const isGold = partner._tier === 'gold_sponsor';
    const disc = IS_ANDROID_MAP ? MAP_MARKER_DISC : (isGold ? 44 : 38);
    const imageSize = disc - 6;

    return (
      <MapMarkerDisc
        size={disc}
        color={tier.bg}
        borderColor={tier.border}
        borderWidth={isGold ? 3 : 2.5}
        badge={(
          <View style={[pMarkerStyles.badge, MAP_MARKER_CORNER_BADGE, { backgroundColor: tier.primary }]}>
            <MaterialIcons name={isGold ? 'star' : 'workspace-premium'} size={7} color="#FFF" />
          </View>
        )}
      >
        {partner.logo && !imageError ? (
          <>
            {!imageLoaded ? (
              <MaterialIcons name={isGold ? 'workspace-premium' : 'handshake'} size={isGold ? 20 : 16} color="#fff" style={{ position: 'absolute' }} />
            ) : null}
            <RNImage
              source={{ uri: partner.logo, cache: 'force-cache' }}
              style={{ width: imageSize, height: imageSize, borderRadius: imageSize / 2, backgroundColor: tier.bg, opacity: imageLoaded ? 1 : 0 }}
              resizeMode="cover"
              onLoad={handleLoad}
              onError={handleError}
            />
          </>
        ) : (
          <MaterialIcons name={isGold ? 'workspace-premium' : 'handshake'} size={isGold ? 20 : 16} color="#fff" />
        )}
      </MapMarkerDisc>
    );
  }
);


// ============================================
// SPONSORED SPLIT MARKER COMPONENT
// Shows half item photo/icon + half sponsor logo
// ============================================
const SponsoredSplitMarkerView = React.memo(({ itemIcon, itemColor, itemPhoto, sponsorPhoto, sponsorColor, size = 40, onReady }: {
  itemIcon: string; itemColor: string; itemPhoto?: string | null; sponsorPhoto?: string | null; sponsorColor: string; size?: number; onReady?: () => void;
}) => {
  const [itemImgLoaded, setItemImgLoaded] = useState(false);
  const [sponsorImgLoaded, setSponsorImgLoaded] = useState(false);
  const [itemImgError, setItemImgError] = useState(false);
  const [sponsorImgError, setSponsorImgError] = useState(false);
  const disc = IS_ANDROID_MAP ? MAP_MARKER_DISC : size;
  const halfW = disc / 2;

  useEffect(() => {
    const itemDone = !itemPhoto || itemImgLoaded || itemImgError;
    const sponsorDone = !sponsorPhoto || sponsorImgLoaded || sponsorImgError;
    if (itemDone && sponsorDone) onReady?.();
  }, [itemPhoto, sponsorPhoto, itemImgLoaded, itemImgError, sponsorImgLoaded, sponsorImgError, onReady]);

  return (
    <MapMarkerDisc size={disc} color={itemColor} borderColor={sponsorColor} borderWidth={2.5} badge={(
      <View style={[pMarkerStyles.badge, MAP_MARKER_CORNER_BADGE, { backgroundColor: sponsorColor }]}>
        <MaterialIcons name="handshake" size={7} color="#FFF" />
      </View>
    )}>
      <View style={{ width: disc, height: disc, flexDirection: 'row', overflow: 'hidden' }}>
        {/* Left half: item photo/icon */}
        <View style={{ width: halfW, height: disc, backgroundColor: itemColor, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {itemPhoto && !itemImgError ? (
            <RNImage
              source={{ uri: itemPhoto, cache: 'force-cache' }}
              style={{ width: halfW + 4, height: disc, marginLeft: -2 }}
              resizeMode="cover"
              onLoad={() => setItemImgLoaded(true)}
              onError={() => setItemImgError(true)}
            />
          ) : (
            <MaterialIcons name={itemIcon as any} size={disc * 0.4} color="#FFF" />
          )}
        </View>
        {/* Right half: sponsor logo */}
        <View style={{ width: halfW, height: disc, backgroundColor: sponsorColor + '30', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {sponsorPhoto && !sponsorImgError ? (
            <RNImage
              source={{ uri: sponsorPhoto, cache: 'force-cache' }}
              style={{ width: halfW + 4, height: disc, marginRight: -2 }}
              resizeMode="cover"
              onLoad={() => setSponsorImgLoaded(true)}
              onError={() => setSponsorImgError(true)}
            />
          ) : (
            <MaterialIcons name="handshake" size={disc * 0.35} color={sponsorColor} />
          )}
        </View>
      </View>
    </MapMarkerDisc>
  );
});

const PlayerAvatarMarkerView = React.memo(({ avatar, color, isPublic, onReady }: { avatar: string; color: string; isPublic: boolean; onReady?: () => void }) => {
  const disc = MAP_MARKER_DISC;
  const inner = disc - 6;
  return (
    <MapMarkerDisc
      size={disc}
      color={color}
      borderColor={isPublic ? theme.success : '#FFF'}
      borderWidth={isPublic ? 3 : 2}
    >
      <RNImage
        source={{ uri: avatar, cache: 'force-cache' }}
        style={{ width: inner, height: inner, borderRadius: inner / 2 }}
        resizeMode="cover"
        onLoad={() => onReady?.()}
        onError={() => onReady?.()}
      />
    </MapMarkerDisc>
  );
});

/** Generic circular photo marker for terrains, clubs, tournaments, etc. */
const EntityPhotoMarkerView = React.memo(({
  photo,
  color,
  icon,
  isPublic,
  borderColor,
  borderWidth,
  onReady,
}: {
  photo: string;
  color: string;
  icon: string;
  isPublic?: boolean;
  borderColor?: string;
  borderWidth?: number;
  onReady?: () => void;
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const disc = MAP_MARKER_DISC;
  const imageSize = disc - 6;

  const handleLoad = useCallback(() => {
    setImageLoaded(true);
    onReady?.();
  }, [onReady]);

  const handleError = useCallback(() => {
    setImageError(true);
    onReady?.();
  }, [onReady]);

  return (
    <MapMarkerDisc
      size={disc}
      color={color}
      borderColor={borderColor ?? (isPublic ? theme.success : '#FFF')}
      borderWidth={borderWidth ?? (isPublic ? 3 : 2)}
    >
      {photo && !imageError ? (
        <>
          {!imageLoaded ? (
            <MaterialIcons name={icon as any} size={14} color="#FFF" style={{ position: 'absolute' }} />
          ) : null}
          <RNImage
            source={{ uri: photo, cache: 'force-cache' }}
            style={{ width: imageSize, height: imageSize, borderRadius: imageSize / 2, opacity: imageLoaded ? 1 : 0 }}
            resizeMode="cover"
            onLoad={handleLoad}
            onError={handleError}
          />
        </>
      ) : (
        <MaterialIcons name={icon as any} size={14} color="#FFF" />
      )}
    </MapMarkerDisc>
  );
});

const pMarkerStyles = StyleSheet.create({
  container: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2.5,
    overflow: 'hidden' as const,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4 },
      default: {},
    }),
  },
  containerGold: {
    borderWidth: 3,
    ...Platform.select({
      ios: { shadowColor: '#B45309', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6 },
      default: {},
    }),
  },
  badge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: 2,
    borderColor: '#FFF',
  },
});

// ============================================
// CLUSTER MARKER COMPONENT
// ============================================
// Animated pulse ring for LIVE / habitual terrain markers (rendered outside disc — not clipped)
const ActiveNowPulse = React.memo(({ color = '#22C55E', ringSize = 44 }: { color?: string; ringSize?: number }) => {
  const pulse1 = useSharedValue(0);
  const pulse2 = useSharedValue(0);

  React.useEffect(() => {
    pulse1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500 }),
        withTiming(0, { duration: 0 })
      ),
      -1,
      false
    );
    const timer = setTimeout(() => {
      pulse2.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500 }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
    }, 750);
    return () => {
      clearTimeout(timer);
      cancelAnimation(pulse1);
      cancelAnimation(pulse2);
      pulse1.value = 0;
      pulse2.value = 0;
    };
  }, [pulse1, pulse2]);

  const ring1Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse1.value * 0.8 }],
    opacity: 1 - pulse1.value,
  }));
  const ring2Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + pulse2.value * 0.8 }],
    opacity: 1 - pulse2.value,
  }));

  const ringBase = {
    position: 'absolute' as const,
    width: ringSize,
    height: ringSize,
    borderRadius: ringSize / 2,
    backgroundColor: 'transparent',
    borderWidth: 2.5,
    borderColor: color,
  };

  return (
    <View style={{ width: ringSize, height: ringSize, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      <Animated.View style={[ringBase, ring1Style]} />
      <Animated.View style={[ringBase, ring2Style]} />
    </View>
  );
});

/** Sonar rings as MapView Circle overlays (Android marker bitmaps do not animate). */
const MapPulseRingCircle = React.memo(({ center, color, delayMs = 0 }: {
  center: { latitude: number; longitude: number };
  color: string;
  delayMs?: number;
}) => {
  const progress = useSharedValue(0);
  const rgb = useMemo(() => hexToRgb(color), [color]);

  React.useEffect(() => {
    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      progress.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500 }),
          withTiming(0, { duration: 0 })
        ),
        -1,
        false
      );
    };
    if (delayMs > 0) {
      delayTimer = setTimeout(start, delayMs);
    } else {
      start();
    }
    return () => {
      if (delayTimer) clearTimeout(delayTimer);
      cancelAnimation(progress);
      progress.value = 0;
    };
  }, [progress, delayMs]);

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    const strokeO = (1 - progress.value) * 0.95;
    const fillO = (1 - progress.value) * 0.12;
    return {
      radius: MAP_PULSE_BASE_RADIUS_M + progress.value * MAP_PULSE_RADIUS_SPAN_M,
      strokeColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${strokeO})`,
      fillColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${fillO})`,
    };
  });

  if (!AnimatedMapCircle) return null;

  return (
    <AnimatedMapCircle
      center={center}
      strokeWidth={2.5}
      zIndex={0}
      animatedProps={animatedProps}
    />
  );
});

const MapTerrainPulseLayer = React.memo(({ items }: {
  items: { id: string; latitude: number; longitude: number; color: string }[];
}) => {
  // Android: animated native map circles saturate the RN bridge and freeze the whole app on tab switch.
  if (!AnimatedMapCircle || Platform.OS === 'web' || IS_ANDROID_MAP || items.length === 0) return null;
  return (
    <>
      {items.map((item) => (
        <React.Fragment key={item.id}>
          <MapPulseRingCircle
            center={{ latitude: item.latitude, longitude: item.longitude }}
            color={item.color}
          />
          <MapPulseRingCircle
            center={{ latitude: item.latitude, longitude: item.longitude }}
            color={item.color}
            delayMs={750}
          />
        </React.Fragment>
      ))}
    </>
  );
});

/** iOS keeps in-marker Reanimated rings; Android uses MapTerrainPulseLayer. */
const USE_IN_MARKER_PULSE = !IS_ANDROID_MAP;

const SingleMarkerView = React.memo(({ color, icon, isPublic, accessIndicator, fallbackSource, isVerified, isActiveNow, isLive, sponsorColor, onReady }: { color: string; icon: string; isPublic: boolean; accessIndicator?: 'public' | 'private' | null; fallbackSource?: 'terrain' | 'club' | null; isVerified?: boolean; isActiveNow?: boolean; isLive?: boolean; sponsorColor?: string | null; onReady?: () => void }) => {
  useEffect(() => { onReady?.(); }, [onReady]);
  const pulseColor = isLive ? '#EF4444' : '#22C55E';
  const showPulse = (isActiveNow || isLive) && USE_IN_MARKER_PULSE;
  const highlight = isActiveNow || isLive || !!sponsorColor;
  const discBorder = sponsorColor || (highlight ? pulseColor : '#FFF');
  const discBorderW = highlight ? 3 : isPublic ? 3 : 2;
  const discSize = MAP_MARKER_DISC;
  const canvasSize = showPulse ? MAP_MARKER_PULSE_CANVAS : (IS_ANDROID_MAP ? MAP_MARKER_CANVAS : 56);
  const pulseRingSize = discSize + 4;

  const cornerBadge = sponsorColor ? (
    <View style={[styles.sponsorBadge, MAP_MARKER_CORNER_BADGE, { backgroundColor: sponsorColor }]}>
      <Text style={styles.sponsorBadgeText}>S</Text>
    </View>
  ) : isVerified ? (
    <View style={[styles.verifiedBadge, MAP_MARKER_CORNER_BADGE]}>
      <MaterialIcons name="verified" size={9} color="#FFF" />
    </View>
  ) : fallbackSource ? (
    <View style={[styles.fallbackBadge, MAP_MARKER_CORNER_BADGE, { backgroundColor: fallbackSource === 'terrain' ? theme.success : theme.accent }]}>
      <MaterialIcons name={fallbackSource === 'terrain' ? 'sports-soccer' : 'home'} size={7} color="#FFF" />
    </View>
  ) : accessIndicator ? (
    <View style={[styles.accessBadge, MAP_MARKER_CORNER_BADGE, accessIndicator === 'public' ? styles.accessBadgePublic : styles.accessBadgePrivate]}>
      <MaterialIcons name={accessIndicator === 'public' ? 'lock-open' : 'lock'} size={7} color="#FFF" />
    </View>
  ) : null;

  return (
    <View
      style={{
        width: canvasSize,
        height: canvasSize,
        minWidth: canvasSize,
        minHeight: canvasSize,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
      }}
      collapsable={false}
      pointerEvents="none"
    >
      {showPulse ? (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActiveNowPulse color={pulseColor} ringSize={pulseRingSize} />
          </View>
        </View>
      ) : null}
      <View
        style={{
          width: discSize,
          height: discSize,
          borderRadius: discSize / 2,
          backgroundColor: color,
          borderWidth: discBorderW,
          borderColor: discBorder,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          ...MAP_MARKER_NO_HW_TEXTURE,
        }}
      >
        <MaterialIcons name={icon as any} size={highlight ? 16 : 14} color="#FFF" />
        {cornerBadge}
      </View>
    </View>
  );
});

const CLUSTER_COLOR_MAP: Record<string, string> = {
  terrains: theme.success,
  clubs: theme.accent,
  tournaments: theme.carreauColor,
  players: theme.primary,
};
const CLUSTER_ICON_MAP: Record<string, string> = {
  terrains: 'sports-soccer',
  clubs: 'home',
  tournaments: 'emoji-events',
  players: 'person',
};


const ClusterMarkerView = React.memo(
  ({ count, typeCounts }: { count: number; typeCounts: Record<string, number> }) => {
    const sorted = Object.entries(typeCounts)
      .filter(([, c]) => c > 0)
      .sort((a, b) => b[1] - a[1]);

    const dominantType = sorted[0]?.[0] || 'players';
    const dominantColor = CLUSTER_COLOR_MAP[dominantType] || theme.primary;

    const size = count <= 5 ? 44 : count <= 15 ? 52 : 60;
    const innerSize = size - 8;
    const showPills = sorted.length > 1 && size >= 52;

    const clusterDisc = IS_ANDROID_MAP ? MAP_MARKER_DISC : size;
    const clusterInner = clusterDisc - 8;

    return (
      <MapMarkerCanvas>
        <View
          style={{
            width: clusterDisc,
            height: clusterDisc,
            borderRadius: clusterDisc / 2,
            backgroundColor: dominantColor,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2.5,
            borderColor: '#FFF',
            ...MAP_MARKER_NO_HW_TEXTURE,
            ...Platform.select({ ios: { shadowColor: dominantColor, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4 }, default: {} }),
          }}
        >
          <Text style={{ color: '#FFF', fontWeight: '900', fontSize: count > 99 ? 11 : clusterInner > 36 ? 14 : 12 }}>
            {count}
          </Text>
        </View>
        {!IS_ANDROID_MAP && showPills ? (
          <View style={{ flexDirection: 'row', gap: 3, marginTop: 4 }}>
            {sorted.slice(0, 4).map(([type]) => (
              <View key={type} style={{
                width: 8, height: 8, borderRadius: 4,
                backgroundColor: CLUSTER_COLOR_MAP[type] || theme.primary,
                borderWidth: 1.5, borderColor: '#FFF',
              }} />
            ))}
          </View>
        ) : null}
      </MapMarkerCanvas>
    );
  }
);

// ============================================
// MEMOIZED FILTER CHIP
// ============================================
const FilterChip = React.memo(({ label, icon, isActive, activeColor, onPress }: { label: string; icon: string; isActive: boolean; activeColor?: string; onPress: () => void }) => (
  <Pressable style={[styles.chip, isActive && (activeColor ? { backgroundColor: activeColor } : styles.chipActive)]} onPress={onPress}>
    <MaterialIcons name={icon as any} size={14} color={isActive ? '#FFF' : theme.textSecondary} />
    <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{label}</Text>
  </Pressable>
));

// ============================================
// MEMOIZED SUB-FILTER CHIP
// ============================================
const SubFilterChip = React.memo(({ label, icon, isActive, color, onPress }: { label: string; icon?: string; isActive: boolean; color: string; onPress: () => void }) => (
  <Pressable
    style={[styles.subChip, isActive && { backgroundColor: color, borderColor: color }]}
    onPress={onPress}
  >
    {icon ? <MaterialIcons name={icon as any} size={11} color={isActive ? '#FFF' : color} /> : null}
    <Text style={[styles.subChipText, isActive ? { color: '#FFF' } : { color }]}>{label}</Text>
  </Pressable>
));

// ============================================
// MEMOIZED SUB-FILTER SECTIONS
// ============================================
interface TerrainSubFiltersProps {
  terrainTypeFilter: string | null;
  terrainEnvFilter: 'indoor' | 'outdoor' | null;
  terrainLightingFilter: boolean | null;
  terrainCoveredFilter: boolean | null;
  terrainParkingFilter: boolean | null;
  terrainToiletsFilter: boolean | null;
  terrainPublicAccessFilter: boolean | null;
  terrainMembersOnlyFilter: boolean | null;
  terrainMultiCourtsFilter: boolean | null;
  onTerrainTypePress: (id: string) => void;
  onTerrainEnvPress: (id: 'indoor' | 'outdoor') => void;
  onTerrainCharPress: (key: 'lighting' | 'covered' | 'parking' | 'toilets' | 'public_access' | 'members_only' | 'multi_courts') => void;
  onClear: () => void;
  count: number;
  language: string;
}
const TerrainSubFilters = React.memo(({ terrainTypeFilter, terrainEnvFilter, terrainLightingFilter, terrainCoveredFilter, terrainParkingFilter, terrainToiletsFilter, terrainPublicAccessFilter, terrainMembersOnlyFilter, terrainMultiCourtsFilter, onTerrainTypePress, onTerrainEnvPress, onTerrainCharPress, onClear, count, language }: TerrainSubFiltersProps) => (
  <View style={styles.subFiltersContainer}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subFiltersRow}>
      <View style={styles.subFilterLabel}>
        <MaterialIcons name="landscape" size={12} color={theme.textMuted} />
        <Text style={styles.subFilterLabelText}>Surface</Text>
      </View>
      {config.terrainTypes.map(tt => (
        <SubFilterChip key={tt.id} label={tt.label} icon={tt.icon} isActive={terrainTypeFilter === tt.id} color={theme.success} onPress={() => onTerrainTypePress(tt.id)} />
      ))}
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subFiltersRow}>
      <View style={styles.subFilterLabel}>
        <MaterialIcons name="wb-sunny" size={12} color={theme.textMuted} />
        <Text style={styles.subFilterLabelText}>{language === 'fr' ? 'Environnement' : 'Environment'}</Text>
      </View>
      {config.terrainEnvironments.map(env => {
        const envColor = env.id === 'indoor' ? '#3B82F6' : '#F59E0B';
        return <SubFilterChip key={env.id} label={env.label} icon={env.icon} isActive={terrainEnvFilter === env.id} color={envColor} onPress={() => onTerrainEnvPress(env.id as 'indoor' | 'outdoor')} />;
      })}
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subFiltersRow}>
      <View style={styles.subFilterLabel}>
        <MaterialIcons name="tune" size={12} color={theme.textMuted} />
        <Text style={styles.subFilterLabelText}>{language === 'fr' ? 'Caracteristiques' : 'Features'}</Text>
      </View>
      <SubFilterChip label={language === 'fr' ? 'Eclairage' : 'Lighting'} icon="lightbulb" isActive={terrainLightingFilter === true} color="#EAB308" onPress={() => onTerrainCharPress('lighting')} />
      <SubFilterChip label={language === 'fr' ? 'Couvert' : 'Covered'} icon="roofing" isActive={terrainCoveredFilter === true} color="#6366F1" onPress={() => onTerrainCharPress('covered')} />
      <SubFilterChip label="Parking" icon="local-parking" isActive={terrainParkingFilter === true} color="#0EA5E9" onPress={() => onTerrainCharPress('parking')} />
      <SubFilterChip label={language === 'fr' ? 'Toilettes' : 'Restrooms'} icon="wc" isActive={terrainToiletsFilter === true} color="#EC4899" onPress={() => onTerrainCharPress('toilets')} />
      <SubFilterChip label={language === 'fr' ? 'Acces public' : 'Public access'} icon="lock-open" isActive={terrainPublicAccessFilter === true} color="#22C55E" onPress={() => onTerrainCharPress('public_access')} />
      <SubFilterChip label={language === 'fr' ? 'Reserve membres' : 'Members only'} icon="lock" isActive={terrainMembersOnlyFilter === true} color="#EF4444" onPress={() => onTerrainCharPress('members_only')} />
      <SubFilterChip label={language === 'fr' ? '2+ terrains' : '2+ courts'} icon="grid-view" isActive={terrainMultiCourtsFilter === true} color="#8B5CF6" onPress={() => onTerrainCharPress('multi_courts')} />
    </ScrollView>
    {(terrainTypeFilter || terrainEnvFilter || terrainLightingFilter || terrainCoveredFilter || terrainParkingFilter || terrainToiletsFilter || terrainPublicAccessFilter || terrainMembersOnlyFilter || terrainMultiCourtsFilter) ? (
      <View style={styles.subFilterActiveBar}>
        <Text style={styles.subFilterActiveText}>{count} {language === 'fr' ? 'terrain(s) filtre(s)' : 'terrain(s) filtered'}</Text>
        <Pressable style={styles.subFilterClearBtn} onPress={onClear}>
          <MaterialIcons name="close" size={12} color={theme.primary} />
          <Text style={styles.subFilterClearText}>{language === 'fr' ? 'Effacer' : 'Clear'}</Text>
        </Pressable>
      </View>
    ) : null}
  </View>
));

interface TournamentSubFiltersProps {
  tournamentFormatFilter: string | null;
  tournamentStatusFilter: string | null;
  onFormatPress: (fmt: string) => void;
  onStatusPress: (key: string) => void;
  onClear: () => void;
  count: number;
  language: string;
}
const TournamentSubFilters = React.memo(({ tournamentFormatFilter, tournamentStatusFilter, onFormatPress, onStatusPress, onClear, count, language }: TournamentSubFiltersProps) => (
  <View style={styles.subFiltersContainer}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subFiltersRow}>
      <View style={styles.subFilterLabel}>
        <MaterialIcons name="sports" size={12} color={theme.textMuted} />
        <Text style={styles.subFilterLabelText}>Format</Text>
      </View>
      {(['Doublette', 'Triplette', 'Tete-a-tete'] as const).map(fmt => (
        <SubFilterChip key={fmt} label={fmt} isActive={tournamentFormatFilter === fmt} color={theme.carreauColor} onPress={() => onFormatPress(fmt)} />
      ))}
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subFiltersRow}>
      <View style={styles.subFilterLabel}>
        <MaterialIcons name="event" size={12} color={theme.textMuted} />
        <Text style={styles.subFilterLabelText}>{language === 'fr' ? 'Statut' : 'Status'}</Text>
      </View>
      {([{ key: 'À venir', label: language === 'fr' ? 'A venir' : 'Upcoming', icon: 'event', color: theme.primary }, { key: 'En cours', label: language === 'fr' ? 'En cours' : 'In progress', icon: 'play-circle-filled', color: theme.warning }] as const).map(st => (
        <SubFilterChip key={st.key} label={st.label} icon={st.icon} isActive={tournamentStatusFilter === st.key} color={st.color} onPress={() => onStatusPress(st.key)} />
      ))}
    </ScrollView>
    {(tournamentFormatFilter || tournamentStatusFilter) ? (
      <View style={styles.subFilterActiveBar}>
        <Text style={styles.subFilterActiveText}>{count} {language === 'fr' ? 'tournoi(s) filtre(s)' : 'tournament(s) filtered'}</Text>
        <Pressable style={styles.subFilterClearBtn} onPress={onClear}>
          <MaterialIcons name="close" size={12} color={theme.primary} />
          <Text style={styles.subFilterClearText}>{language === 'fr' ? 'Effacer' : 'Clear'}</Text>
        </Pressable>
      </View>
    ) : null}
  </View>
));

interface PlayerSubFiltersProps {
  eloRankFilter: EloRankTier | null;
  eloRangeFilter: 'placement' | null;
  trustFilter: 'verified' | 'high' | 'medium_low' | null;
  roleFilter: string | null;
  onEloRankPress: (tier: EloRankTier) => void;
  onEloRangePress: (key: 'placement') => void;
  onTrustPress: (key: 'verified' | 'high' | 'medium_low') => void;
  onRolePress: (role: string) => void;
  onClear: () => void;
  count: number;
  language: string;
}
const PlayerSubFilters = React.memo(({ eloRankFilter, eloRangeFilter, trustFilter, roleFilter, onEloRankPress, onEloRangePress, onTrustPress, onRolePress, onClear, count, language }: PlayerSubFiltersProps) => (
  <View style={styles.subFiltersContainer}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subFiltersRow}>
      <View style={styles.subFilterLabel}>
        <MaterialIcons name="emoji-events" size={12} color={theme.textMuted} />
        <Text style={styles.subFilterLabelText}>ELO</Text>
      </View>
      {ELO_RANKS_REVERSED.map(rank => (
        <SubFilterChip key={rank.tier} label={language === 'fr' ? rank.label.fr : rank.label.en} icon={rank.icon} isActive={eloRankFilter === rank.tier} color={rank.color} onPress={() => onEloRankPress(rank.tier)} />
      ))}
      <SubFilterChip label={language === 'fr' ? 'Placement' : 'Placement'} icon="hourglass-empty" isActive={eloRangeFilter === 'placement'} color="#A855F7" onPress={() => onEloRangePress('placement')} />
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subFiltersRow}>
      <View style={styles.subFilterLabel}>
        <MaterialIcons name="sports" size={12} color={theme.textMuted} />
        <Text style={styles.subFilterLabelText}>{language === 'fr' ? 'Role' : 'Role'}</Text>
      </View>
      {(['Tireur', 'Pointeur', 'Milieu'] as const).map(role => {
        const roleColor = role === 'Tireur' ? '#F97316' : role === 'Pointeur' ? '#3B82F6' : '#8B5CF6';
        const roleIcon = role === 'Tireur' ? 'gps-fixed' : role === 'Pointeur' ? 'radio-button-on' : 'swap-horiz';
        return <SubFilterChip key={role} label={role} icon={roleIcon} isActive={roleFilter === role} color={roleColor} onPress={() => onRolePress(role)} />;
      })}
    </ScrollView>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subFiltersRow}>
      <View style={styles.subFilterLabel}>
        <MaterialIcons name="verified-user" size={12} color={theme.textMuted} />
        <Text style={styles.subFilterLabelText}>{language === 'fr' ? 'Confiance' : 'Trust'}</Text>
      </View>
      {([{ key: 'verified' as const, label: language === 'fr' ? 'Verifie' : 'Verified', icon: 'verified-user', color: '#22C55E' }, { key: 'high' as const, label: language === 'fr' ? 'Fiable' : 'Trusted', icon: 'shield', color: '#3B82F6' }, { key: 'medium_low' as const, label: language === 'fr' ? '< Fiable' : '< Trusted', icon: 'warning', color: '#F97316' }]).map(opt => (
        <SubFilterChip key={opt.key} label={opt.label} icon={opt.icon} isActive={trustFilter === opt.key} color={opt.color} onPress={() => onTrustPress(opt.key)} />
      ))}
    </ScrollView>
    {(eloRankFilter || eloRangeFilter || trustFilter || roleFilter) ? (
      <View style={styles.subFilterActiveBar}>
        <Text style={styles.subFilterActiveText}>{count} {language === 'fr' ? 'joueur(s) filtre(s)' : 'player(s) filtered'}</Text>
        <Pressable style={styles.subFilterClearBtn} onPress={onClear}>
          <MaterialIcons name="close" size={12} color={theme.primary} />
          <Text style={styles.subFilterClearText}>{language === 'fr' ? 'Effacer' : 'Clear'}</Text>
        </Pressable>
      </View>
    ) : null}
  </View>
));

// ============================================
// LIST ITEM COMPONENT
// ============================================
const ListItem = React.memo(({ item, onPress, singularLabel, terrainTypeLabel, isPublicItem, onImport, t }: any) => {
  const MARKER_COLORS: Record<string, string> = { terrains: theme.success, clubs: theme.accent, tournaments: theme.carreauColor, players: theme.primary };
  const MARKER_ICONS: Record<string, string> = { terrains: 'sports-soccer', clubs: 'home', tournaments: 'emoji-events', players: 'person' };
  const color = MARKER_COLORS[item.itemType] || theme.primary;
  const icon = MARKER_ICONS[item.itemType] || 'place';
  const terrainConfig = item.itemType === 'terrains' ? config.terrainTypes.find(tc => tc.id === item.type) : null;

  return (
    <Pressable style={styles.listItem} onPress={onPress}>
      <View style={[styles.listIcon, { backgroundColor: color }]}>
        <MaterialIcons name={(terrainConfig?.icon || icon) as any} size={18} color="#FFF" />
      </View>
      <View style={styles.listContent}>
        <View style={styles.listNameRow}>
          <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
          {isPublicItem && item.itemType === 'players' && item.isPremium ? (
            <View style={styles.premiumBadgeListMap}>
              <MaterialIcons name="star" size={7} color="#A8B4C0" />
            </View>
          ) : null}
          {isPublicItem ? (
            <View style={styles.publicBadgeSmall}>
              <MaterialIcons name="public" size={10} color={theme.success} />
            </View>
          ) : null}
        </View>
        <Text style={styles.listMeta} numberOfLines={1}>
          {item.itemType === 'terrains' ? `${item.city} • ${terrainTypeLabel || item.type}` :
           item.itemType === 'clubs' ? item.city :
           item.itemType === 'players' ? (item.location?.city || item.club || '-') :
           item.location?.city}
        </Text>
      </View>
      {isPublicItem && onImport ? (
        <Pressable style={styles.importBtnSmall} onPress={(e) => { e.stopPropagation?.(); onImport(); }} hitSlop={6}>
          <MaterialIcons name="add-circle" size={22} color={theme.primary} />
        </Pressable>
      ) : (
        <View style={[styles.listBadge, { backgroundColor: color + '15' }]}>
          <Text style={[styles.listBadgeText, { color }]}>{singularLabel}</Text>
        </View>
      )}
    </Pressable>
  );
});

// ============================================
// MAIN COMPONENT
// ============================================
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { clubs, tournaments, terrains, players } = useAppData();
  const { refreshData, updatePlayer, updateClub, updateTerrain, updateTournament, setItemPublic, getSharedPermission } = useAppActions();
  const { user } = useAuth();

  /** Only own directory rows or items shared with write — not public/other users' cards */
  const canUserGeolocateItem = useCallback((item: { id: string; userId?: string }) => {
    if (!user?.id) return false;
    if (item.userId === user.id || item.id === user.id) return true;
    return getSharedPermission(item.id) === 'write';
  }, [user?.id, getSharedPermission]);
  const { showAlert } = useAlert();
  const { showToast } = useToast();
  const { t, language } = useLanguage();
  const { lat: paramLat, lng: paramLng, name: paramName, filter: paramFilter, activeNow: paramActiveNow, mf: paramMapFocus } = useLocalSearchParams<{ lat?: string; lng?: string; name?: string; filter?: string; activeNow?: string; mf?: string }>();
  const [filter, setFilter] = useState<MarkerType>('all');
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchSuggestions, setSearchSuggestions] = useState<{ label: string; type: string; count?: number; lat?: number; lng?: number }[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapMode, setMapMode] = useState<MapMode>('all');
  const [showManageModal, setShowManageModal] = useState(false);
  const [currentRegion, setCurrentRegion] = useState(config.map.defaultRegion);

  const isMapFocused = useIsFocused();
  const [mapMounted, setMapMounted] = useState(false);
  const [mapTilesReady, setMapTilesReady] = useState(false);
  /** Android: defer markers until map + UI are stable (avoids RN bridge saturation). */
  const [markersReady, setMarkersReady] = useState(false);
  const [mapChrome, setMapChrome] = useState({ top: 0, bottom: 0 });
  const onHeroChromeLayout = useCallback((e: LayoutChangeEvent) => {
    const top = e.nativeEvent.layout.height;
    setMapChrome((prev) => (prev.top === top ? prev : { ...prev, top }));
  }, []);
  const onBottomChromeLayout = useCallback((e: LayoutChangeEvent) => {
    const bottom = e.nativeEvent.layout.height;
    setMapChrome((prev) => (prev.bottom === bottom ? prev : { ...prev, bottom }));
  }, []);
  const [showMapAd, setShowMapAd] = useState(false);
  const mapRef = useRef<any>(null);
  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clusterDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heatmapAnimRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const partnerLoadTaskRef = useRef<{ cancel?: () => void } | null>(null);

  // Public items state
  const [publicPlayers, setPublicPlayers] = useState<any[]>([]);
  const [publicClubs, setPublicClubs] = useState<any[]>([]);
  const [publicTerrains, setPublicTerrains] = useState<any[]>([]);
  const [publicTournaments, setPublicTournaments] = useState<any[]>([]);
  const [myItems, setMyItems] = useState<any>({ players: [], clubs: [], terrains: [], tournaments: [] });
  const [loadingPublic, setLoadingPublic] = useState(false);
  const [loadingManage, setLoadingManage] = useState(false);


  // Player sub-filters (ELO rank & trust score)
  const [eloRankFilter, setEloRankFilter] = useState<EloRankTier | null>(null);
  const [trustFilter, setTrustFilter] = useState<'verified' | 'high' | 'medium_low' | null>(null);

  // Terrain sub-filters (type & environment & characteristics)
  const [terrainTypeFilter, setTerrainTypeFilter] = useState<string | null>(null);
  const [terrainEnvFilter, setTerrainEnvFilter] = useState<'indoor' | 'outdoor' | null>(null);
  const [terrainLightingFilter, setTerrainLightingFilter] = useState<boolean | null>(null);
  const [terrainCoveredFilter, setTerrainCoveredFilter] = useState<boolean | null>(null);
  const [terrainParkingFilter, setTerrainParkingFilter] = useState<boolean | null>(null);
  const [terrainToiletsFilter, setTerrainToiletsFilter] = useState<boolean | null>(null);
  const [terrainPublicAccessFilter, setTerrainPublicAccessFilter] = useState<boolean | null>(null);
  const [terrainMembersOnlyFilter, setTerrainMembersOnlyFilter] = useState<boolean | null>(null);
  const [terrainMultiCourtsFilter, setTerrainMultiCourtsFilter] = useState<boolean | null>(null);

  // Club sub-filters (facilities)
  const [clubFacilityFilter, setClubFacilityFilter] = useState<string | null>(null);

  // Player extra sub-filters
  const [playerRoleFilter, setPlayerRoleFilter] = useState<string | null>(null);
  const [eloRangeFilter, setEloRangeFilter] = useState<'placement' | null>(null);

  // Tournament sub-filters (format & status)
  const [tournamentFormatFilter, setTournamentFormatFilter] = useState<string | null>(null);
  const [tournamentStatusFilter, setTournamentStatusFilter] = useState<string | null>(null);

  // Meetup invitation state
  const [showMeetupPicker, setShowMeetupPicker] = useState(false);
  const [meetupPickerUserId, setMeetupPickerUserId] = useState<string | null>(null);
  const [meetupPickerUserName, setMeetupPickerUserName] = useState('');
  const [activeMeetups, setActiveMeetups] = useState<MeetupType[]>([]);
  const [loadingMeetups, setLoadingMeetups] = useState(false);
  const [invitingToMeetup, setInvitingToMeetup] = useState<string | null>(null);

  const handleInviteToMeetupMap = useCallback(async (targetUserId: string, targetName: string) => {
    if (!targetUserId || targetUserId === user?.id) return;
    Haptics.selectionAsync();
    setMeetupPickerUserId(targetUserId);
    setMeetupPickerUserName(targetName);
    setLoadingMeetups(true);
    setShowMeetupPicker(true);
    const { meetups: mts } = await getMyActiveMeetups();
    setActiveMeetups(mts);
    setLoadingMeetups(false);
  }, [user?.id]);

  const handleConfirmInviteMap = useCallback(async (meetupId: string) => {
    if (!meetupPickerUserId) return;
    setInvitingToMeetup(meetupId);
    const { error } = await inviteSingleUserToMeetup(meetupId, meetupPickerUserId);
    setInvitingToMeetup(null);
    if (error === 'already_participant') {
      showAlert(t('meetup', 'alreadyParticipant'));
    } else if (error) {
      showAlert(t('common', 'error'), error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ message: t('meetup', 'inviteSentSuccess'), icon: 'check-circle', iconColor: theme.success });
      setShowMeetupPicker(false);
      setSelected(null);
    }
  }, [meetupPickerUserId, showAlert, showToast, t]);

  // Sponsored events state
  const [sponsoredEvents, setSponsoredEvents] = useState<SponsoredEvent[]>([]);
  const [sponsoredEventsLoaded, setSponsoredEventsLoaded] = useState(false);

  // Partner markers state (Gold/Silver ambassadors linked to terrains/clubs)
  const [partnerMarkers, setPartnerMarkers] = useState<(Ambassador & { _tier: string; _itemType: string; _itemId: string; location: any })[]>([]);
  const [partnerMarkersLoaded, setPartnerMarkersLoaded] = useState(false);
  const [partnerMarkersReloadKey, setPartnerMarkersReloadKey] = useState(0);

  const [playerMarkers, setPlayerMarkers] = useState<(Ambassador & { _tier: string; _itemType: string; _itemId: string; location: any })[]>([]);


  const [selectedPartner, setSelectedPartner] = useState<(typeof partnerMarkers)[0] | null>(null);

  // Cluster expansion list
  const [clusterListItems, setClusterListItems] = useState<ClusterItem[]>([]);
  const [showClusterList, setShowClusterList] = useState(false);

  // Compute top 3 most frequent cities from user data for quick search chips
  const topCities = useMemo(() => {
    const cityMap = new Map<string, { count: number; lat?: number; lng?: number }>();
    const addCity = (item: any) => {
      const city = item.city || item.location?.city;
      if (!city || typeof city !== 'string') return;
      const existing = cityMap.get(city) || { count: 0 };
      existing.count++;
      if (!existing.lat && item.location?.latitude) {
        existing.lat = item.location.latitude;
        existing.lng = item.location.longitude;
      }
      cityMap.set(city, existing);
    };
    terrains.forEach(addCity);
    clubs.forEach(addCity);
    players.forEach(addCity);
    tournaments.forEach(addCity);
    publicTerrains.forEach(addCity);
    publicClubs.forEach(addCity);
    publicPlayers.forEach(addCity);
    const sorted = Array.from(cityMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 3)
      .map(([name, data]) => ({ name, lat: data.lat, lng: data.lng }));
    return sorted;
  }, [terrains, clubs, players, tournaments, publicTerrains, publicClubs, publicPlayers]);

  const MARKER_CONFIG = useMemo(() => ({
    terrains: { label: t('map', 'terrains'), singular: t('map', 'terrainSingular'), icon: 'sports-soccer', color: theme.success },
    clubs: { label: t('map', 'clubs'), singular: t('map', 'clubSingular'), icon: 'home', color: theme.accent },
    tournaments: { label: t('map', 'tournaments'), singular: t('map', 'tournamentSingular'), icon: 'emoji-events', color: theme.carreauColor },
    players: { label: t('map', 'players'), singular: t('map', 'playerSingular'), icon: 'person', color: theme.primary },
    events: { label: language === 'fr' ? 'Defis' : 'Challenges', singular: language === 'fr' ? 'Defi' : 'Challenge', icon: 'campaign', color: '#7C3AED' },
    partners: { label: language === 'fr' ? 'Partenaires' : 'Partners', singular: language === 'fr' ? 'Partenaire' : 'Partner', icon: 'handshake', color: '#D4A017' },
  }), [language]);

  // Dynamic gradient based on active filter
  const activeGradient: [string, string, string] = useMemo(() => {
    const gradients: Record<MarkerType, [string, string, string]> = {
      all: ['#0F172A', '#1E3A8A', '#2563EB'],
      terrains: ['#022C22', '#064E3B', '#10B981'],
      clubs: ['#451A03', '#92400E', '#D97706'],
      tournaments: ['#451A03', '#78350F', '#B45309'],
      players: ['#0F172A', '#1E3A8A', '#2563EB'],
      events: ['#2E1065', '#5B21B6', '#7C3AED'],
      partners: ['#451A03', '#78350F', '#D4A017'],
    };
    return gradients[filter];
  }, [filter]);

  const activeFilterColor = useMemo(() => {
    const colors: Record<MarkerType, string> = {
      all: theme.primary,
      terrains: theme.success,
      clubs: theme.accent,
      tournaments: theme.carreauColor,
      players: theme.primary,
      events: '#7C3AED',
      partners: '#D4A017',
    };
    return colors[filter];
  }, [filter]);

  const [publicLoaded, setPublicLoaded] = useState(false);

  // Lazy-load public items only when needed (first filter interaction or on demand)
  const loadPublicItems = useCallback(async () => {
    if (publicLoaded || !user?.id) return;
    setLoadingPublic(true);
    const [pRes, cRes, tRes, toRes] = await Promise.all([
      fetchPublicPlayers(), fetchPublicClubs(), fetchPublicTerrains(), fetchPublicTournaments(),
    ]);
    if (!pRes.error) setPublicPlayers(pRes.items);
    if (!cRes.error) setPublicClubs(cRes.items);
    if (!tRes.error) setPublicTerrains(tRes.items);
    if (!toRes.error) setPublicTournaments(toRes.items);
    setLoadingPublic(false);
    setPublicLoaded(true);
  }, [publicLoaded, user?.id]);

  // Load sponsored events for map markers
  useEffect(() => {
    if (sponsoredEventsLoaded) return;
    getSponsoredEvents().then(({ events }) => {
      setSponsoredEvents(events);
      setSponsoredEventsLoaded(true);
    });
  }, [sponsoredEventsLoaded]);

  const loadPartnerMarkers = useCallback(async () => {
    try {
      invalidateAmbassadorCache();
      const { ambassadors } = await fetchAmbassadors();
      const supabase = getSupabaseClient();

      const partnerTiers = ambassadors.filter(a => isMapPartnerBadge(a.badgeType));
      const ambassadorTiers = ambassadors.filter(a => !isMapPartnerBadge(a.badgeType));

      const resolveAmbassadorPlayer = async (amb: Ambassador) => {
        const ids = [...new Set([amb.playerId, amb.userId].filter(Boolean))] as string[];
        for (const pid of ids) {
          const { data } = await supabase
            .from('players')
            .select('id, location, is_public, city, country')
            .eq('id', pid)
            .maybeSingle();
          if (!data?.is_public) continue;
          const location = await ensureMapCoordinates(data.location, data.city);
          if (!location) continue;
          return { playerId: data.id, location };
        }
        return null;
      };

      const partnerResults = await Promise.all(
        partnerTiers.map(async (amb) => {
          const resolved = await resolveAmbassadorPlayer(amb);
          if (!resolved) return null;
          return {
            ...amb,
            playerId: resolved.playerId,
            _tier: amb.badgeType,
            _itemType: 'partners' as const,
            _itemId: amb.id,
            location: resolved.location,
          };
        })
      );

      const ambassadorResults = await Promise.all(
        ambassadorTiers.map(async (amb) => {
          const resolved = await resolveAmbassadorPlayer(amb);
          if (!resolved) return null;
          return {
            ...amb,
            playerId: resolved.playerId,
            _tier: amb.badgeType,
            _itemType: 'players' as const,
            _itemId: amb.id,
            location: resolved.location,
          };
        })
      );

      setPartnerMarkers(partnerResults.filter(Boolean) as typeof partnerMarkers);
      setPlayerMarkers(ambassadorResults.filter(Boolean) as typeof playerMarkers);
    } catch (e) {
      console.log('[Map] Error loading partner markers:', e);
    } finally {
      setPartnerMarkersLoaded(true);
    }
  }, []);

  // Partner markers: many Supabase + geocode calls — defer until map is stable and only when needed.
  useEffect(() => {
    if (!isMapFocused || !mapTilesReady) return;
    if (filter !== 'all' && filter !== 'partners' && filter !== 'players') return;
    const timer = setTimeout(() => {
      partnerLoadTaskRef.current?.cancel?.();
      partnerLoadTaskRef.current = InteractionManager.runAfterInteractions(() => {
        loadPartnerMarkers();
      });
    }, IS_ANDROID_MAP ? 2500 : 800);
    return () => {
      clearTimeout(timer);
      partnerLoadTaskRef.current?.cancel?.();
      partnerLoadTaskRef.current = null;
    };
  }, [loadPartnerMarkers, partnerMarkersReloadKey, isMapFocused, mapTilesReady, filter]);

  // Mount MapView only while this tab is focused. Delay mount so tab transition finishes first;
  // tear down immediately on blur so the Android SurfaceView cannot steal touches from other tabs.
  useFocusEffect(
    useCallback(() => {
      let mountTimer: ReturnType<typeof setTimeout> | null = null;
      let adTimer: ReturnType<typeof setTimeout> | null = null;
      let interactionTask: { cancel?: () => void } | null = null;
      if (USE_NATIVE_MAP) {
        interactionTask = InteractionManager.runAfterInteractions(() => {
          mountTimer = setTimeout(() => setMapMounted(true), IS_ANDROID_MAP ? 350 : 120);
        });
      }
      if (user?.id) {
        InteractionManager.runAfterInteractions(() => {
          loadPublicItems();
        });
      }
      if (USE_NATIVE_MAP) {
        adTimer = setTimeout(() => setShowMapAd(true), IS_ANDROID_MAP ? 3000 : 1200);
      }
      return () => {
        interactionTask?.cancel?.();
        if (mountTimer) clearTimeout(mountTimer);
        if (adTimer) clearTimeout(adTimer);
        setMapMounted(false);
        setMapTilesReady(false);
        setShowMapAd(false);
        setSelected(null);
        setSelectedPartner(null);
        setShowHeatmap(false);
        setHeatmapAnimating(false);
        setBurstVisible(false);
        if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
        if (clusterDebounceRef.current) clearTimeout(clusterDebounceRef.current);
        if (heatmapAnimRef.current) clearInterval(heatmapAnimRef.current);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      };
    }, [user?.id, loadPublicItems])
  );

  // Call this after loading partner markers
const precachePartnerImages = useCallback((markers: typeof partnerMarkers) => {
  markers.forEach(pm => {
    if (pm.photo) {
      RNImage.prefetch(pm.photo).catch(() => {});
    }
  });
}, []);

// Prefetch marker images so Android bitmap capture includes photos (tracksViewChanges=false after load).
const precacheMarkerImages = useCallback((items: any[]) => {
  items.forEach(item => {
    const photo = getMapItemPhoto(item);
    if (photo) RNImage.prefetch(photo).catch(() => {});
    if (item._sponsorPhoto) RNImage.prefetch(item._sponsorPhoto).catch(() => {});
  });
}, []);

useEffect(() => {
  if (partnerMarkers.length > 0) {
    precachePartnerImages(partnerMarkers);
  }
}, [partnerMarkers]);

  // Helper: check if a location has valid coordinates (not 0,0)
  const hasValidLocation = useCallback((item: any) => {
    return isValidMapCoordUtil(item.location?.latitude, item.location?.longitude);
  }, []);

  const isPlayerPublicOnMap = useCallback((player: any) => {
    return !!(player?.isPublic ?? player?.is_public);
  }, []);

  // Enrich players with fallback location from associated terrain or club
  const enrichedPlayers = useMemo(() => {
    return players.map(player => {
      if (hasValidLocation(player)) return player;
      // Try terrain first
      if (player.terrainId) {
        const terrain = terrains.find(t => t.id === player.terrainId);
        if (terrain && hasValidLocation(terrain)) {
          return { ...player, location: { ...terrain.location, city: terrain.city }, _locationFallback: 'terrain' };
        }
      }
      // Try club
      if (player.clubId) {
        const club = clubs.find(c => c.id === player.clubId);
        if (club && hasValidLocation(club)) {
          return { ...player, location: { ...club.location, city: club.city }, _locationFallback: 'club' };
        }
      }
      return player;
    });
  }, [players, terrains, clubs, hasValidLocation]);

  // City-only profiles (onboarding): geocode city → lat/lng so pins can render
  const [mapGeocodedPlayers, setMapGeocodedPlayers] = useState(enrichedPlayers);
  useEffect(() => {
    setMapGeocodedPlayers(enrichedPlayers);
    if (!isMapFocused || !mapTilesReady) return;
    let cancelled = false;
    const needsGeocode = enrichedPlayers.filter(p => !hasValidLocation(p));
    if (needsGeocode.length === 0) return;
    const timer = setTimeout(() => {
      (async () => {
        const byId = new Map(enrichedPlayers.map(p => [p.id, p]));
        const batchSize = IS_ANDROID_MAP ? 2 : 6;
        for (let i = 0; i < needsGeocode.length; i += batchSize) {
          if (cancelled) break;
          const batch = needsGeocode.slice(i, i + batchSize);
          await Promise.all(batch.map(async (p) => {
            const loc = await ensureMapCoordinates(p.location, p.city);
            if (!loc) return;
            byId.set(p.id, { ...p, city: loc.city ?? p.city, location: { ...(p.location || {}), ...loc } });
          }));
          if (!cancelled) setMapGeocodedPlayers(Array.from(byId.values()) as typeof enrichedPlayers);
          if (IS_ANDROID_MAP) await new Promise(r => setTimeout(r, 120));
        }
      })();
    }, IS_ANDROID_MAP ? 2000 : 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enrichedPlayers, hasValidLocation, isMapFocused, mapTilesReady]);

  // Own data with locations — only public items appear on map
  const ownData = useMemo(() => ({
    terrains: terrains.filter(t => hasValidLocation(t) && t.isPublic),
    clubs: clubs.filter(c => hasValidLocation(c) && c.isPublic),
    players: mapGeocodedPlayers.filter(p => {
      if (!hasValidLocation(p)) return false;
      const isSelf = p.id === user?.id || p.userId === user?.id;
      return isPlayerPublicOnMap(p) || isSelf;
    }),
    tournaments: tournaments.filter(t => hasValidLocation(t) && (t as any).isPublic),
  }), [terrains, clubs, mapGeocodedPlayers, tournaments, hasValidLocation, isPlayerPublicOnMap, user?.id]);

  // Public data with locations
  const pubData = useMemo(() => ({
    terrains: publicTerrains.filter(hasValidLocation),
    clubs: publicClubs.filter(hasValidLocation),
    players: publicPlayers.filter(hasValidLocation),
    tournaments: publicTournaments.filter(hasValidLocation),
  }), [publicTerrains, publicClubs, publicPlayers, publicTournaments, hasValidLocation]);

  // Combined results
  const results = useMemo(() => {
    const q = search.toLowerCase().trim();
    const matchSearch = (item: any, type: string) => {
      if (!q) return true;
      const fields = type === 'terrains' ? [item.name, item.city, item.type] :
                     type === 'clubs' ? [item.name, item.city] :
                     type === 'players' ? [item.name, item.location?.city, item.club] :
                     [item.name, item.location?.city];
      return fields.some((f: string | undefined) => f?.toLowerCase().includes(q));
    };

    // Player sub-filter matching
    const matchPlayerSubFilters = (item: any) => {
      if (eloRankFilter) {
        const elo = item.eloRating || item.elo_rating || 1000;
        const rank = getEloRank(elo);
        if (rank.tier !== eloRankFilter) return false;
      }
      if (eloRangeFilter === 'placement') {
        const mp = item.matchesPlayed ?? item.stats?.matchesPlayed ?? 0;
        if (mp >= 10) return false;
      }
      if (trustFilter) {
        const trustScore = item.trustScore ?? item.trust_score ?? 75;
        if (trustFilter === 'verified' && trustScore < 80) return false;
        if (trustFilter === 'high' && (trustScore < 65 || trustScore >= 80)) return false;
        if (trustFilter === 'medium_low' && trustScore >= 65) return false;
      }
      if (playerRoleFilter) {
        const role = item.role || '';
        if (role !== playerRoleFilter) return false;
      }
      return true;
    };

    // Terrain sub-filter matching
    const matchTerrainSubFilters = (item: any) => {
      if (terrainTypeFilter) {
        if (item.type !== terrainTypeFilter) return false;
      }
      if (terrainEnvFilter) {
        const env = item.environment || 'outdoor';
        if (env !== terrainEnvFilter) return false;
      }
      if (terrainLightingFilter === true && !item.lighting) return false;
      if (terrainCoveredFilter === true && !item.covered) return false;
      if (terrainParkingFilter === true && !item.parking) return false;
      if (terrainToiletsFilter === true && !item.toilets) return false;
      if (terrainPublicAccessFilter === true && item.publicAccess === false) return false;
      if (terrainMembersOnlyFilter === true && item.publicAccess !== false) return false;
      if (terrainMultiCourtsFilter === true && (item.courtsCount || item.courts_count || 1) < 2) return false;
      return true;
    };

    // Club sub-filter matching
    const matchClubSubFilters = (item: any) => {
      if (clubFacilityFilter) {
        const facilities = item.facilities || [];
        if (!facilities.includes(clubFacilityFilter)) return false;
      }
      return true;
    };

    const items: any[] = [];
    const addItems = (data: any, type: string, isPublic: boolean) => {
      const filtered = data.filter((it: any) => matchSearch(it, type));
      filtered.forEach((it: any) => items.push({ ...it, itemType: type, _isPublic: isPublic }));
    };

    const showOwn = mapMode === 'all';
    const showPublic = true;

    if (filter === 'all' || filter === 'terrains') {
      const filterTerrains = (arr: any[]) => (terrainTypeFilter || terrainEnvFilter) ? arr.filter(matchTerrainSubFilters) : arr;
      if (showOwn) addItems(filterTerrains(ownData.terrains), 'terrains', false);
      if (showPublic) addItems(filterTerrains(pubData.terrains), 'terrains', true);
    }
    if (filter === 'all' || filter === 'clubs') {
      const filterClubs = (arr: any[]) => clubFacilityFilter ? arr.filter(matchClubSubFilters) : arr;
      if (showOwn) addItems(filterClubs(ownData.clubs), 'clubs', false);
      if (showPublic) addItems(filterClubs(pubData.clubs), 'clubs', true);
    }
    if (filter === 'all' || filter === 'tournaments') {
      // Only show upcoming/in-progress tournaments on map (exclude Terminé)
      const filterTournaments = (arr: any[]) => {
        let filtered = arr.filter(t => t.status !== 'Terminé');
        if (tournamentFormatFilter) filtered = filtered.filter(t => t.format === tournamentFormatFilter);
        if (tournamentStatusFilter) filtered = filtered.filter(t => t.status === tournamentStatusFilter);
        return filtered;
      };
      if (showOwn) addItems(filterTournaments(ownData.tournaments), 'tournaments', false);
      if (showPublic) addItems(filterTournaments(pubData.tournaments), 'tournaments', true);
    }
    if (filter === 'all' || filter === 'players') {
      const filterPlayers = (arr: any[]) => (eloRankFilter || eloRangeFilter || trustFilter || playerRoleFilter) ? arr.filter(matchPlayerSubFilters) : arr;
      const sponsorColorMap = new Map<string, string>();
      partnerMarkers.forEach(pm => { if (pm.brandColor) sponsorColorMap.set(pm.id, pm.brandColor); });
      const enrichWithSponsorColor = (arr: any[]) => arr.map(p => {
        if (p.sponsorId && sponsorColorMap.has(p.sponsorId)) return { ...p, sponsorBrandColor: sponsorColorMap.get(p.sponsorId) };
        return p;
      });

      if (showOwn) addItems(enrichWithSponsorColor(filterPlayers(ownData.players)), 'players', false);
      if (showPublic) addItems(enrichWithSponsorColor(filterPlayers(pubData.players)), 'players', true);

      const listedPlayerIds = new Set([
        ...ownData.players.map((p: any) => p.id),
        ...pubData.players.map((p: any) => p.id),
      ]);
      filterPlayers(playerMarkers).forEach((pm: any) => {
        const playerId = pm.playerId || pm.id;
        if (playerId && listedPlayerIds.has(playerId)) return;
        if (!isValidMapCoord(pm.location?.latitude, pm.location?.longitude)) return;
        items.push({
          ...pm,
          id: playerId,
          name: pm.displayName || pm.name,
          itemType: 'players',
          _isPublic: true,
          _tier: pm.badgeType || pm._tier,
        });
      });
    }
    if (filter === 'all' || filter === 'events') {
      // Skip events when partner filter active
      if (filter !== 'partners') sponsoredEvents.forEach(evt => {
        const terrain = terrains.find(tr => tr.id === evt.terrainId);
        const loc = terrain?.location;
        if (loc && (loc.latitude || loc.longitude)) {
          items.push({ ...evt, name: evt.title, location: loc, itemType: 'events', _isPublic: true });
        }
      });
    }

    // Partner filter: add partner markers as results for list view
    if (filter === 'all' || filter === 'partners') {
      partnerMarkers.forEach(pm => {
        if (isValidMapCoord(pm.location?.latitude, pm.location?.longitude)) {
          items.push({ ...pm, name: pm.displayName, itemType: 'partners', _isPublic: true });
        }
      });
    }

    // Deduplicate by id
    const seen = new Set<string>();

    const ambPlayerById = new Map<string, any>();
    playerMarkers.forEach((pm: any) => {
      if (pm.playerId) ambPlayerById.set(pm.playerId, pm);
    });

    items.forEach((item: any) => {
      if (item.sponsorId) {
        const sponsorInfo = partnerMarkers.find(pm => pm.id === item.sponsorId);
        if (sponsorInfo) {
          item._sponsorPhoto = sponsorInfo.photo;
          item._sponsorColor = sponsorInfo.brandColor || '#2563EB';
        }
      }
      if (item.itemType === 'players') {
        const amb = ambPlayerById.get(item.id);
        if (amb) {
          item._tier = amb.badgeType || item._tier;
          if (amb.photo && !item.avatar) item.avatar = amb.photo;
          if (amb.displayName && !item.name) item.name = amb.displayName;
        }
      }
    });

    return items.filter(it => {
      const key = `${it.itemType}-${it.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [ownData, pubData, filter, search, mapMode, eloRankFilter, eloRangeFilter, trustFilter, playerRoleFilter, terrainTypeFilter, terrainEnvFilter, terrainLightingFilter, terrainCoveredFilter, terrainParkingFilter, terrainToiletsFilter, terrainPublicAccessFilter, terrainMembersOnlyFilter, terrainMultiCourtsFilter, tournamentFormatFilter, tournamentStatusFilter, clubFacilityFilter, playerMarkers, partnerMarkers]);

  useEffect(() => {
    if (results.length > 0) {
      precacheMarkerImages(results);
    }
    if (!IS_ANDROID_MAP) {
      setReadyMarkers(new Set());
    }
  }, [results, precacheMarkerImages]);

  // Compute clusters with debounced region to avoid expensive re-clustering on every pan
  const [debouncedClusterInput, setDebouncedClusterInput] = useState({ results, region: currentRegion });

  useEffect(() => {
    if (clusterDebounceRef.current) clearTimeout(clusterDebounceRef.current);
    clusterDebounceRef.current = setTimeout(() => {
      setDebouncedClusterInput({ results, region: currentRegion });
    }, 120);
    return () => { if (clusterDebounceRef.current) clearTimeout(clusterDebounceRef.current); };
  }, [results, currentRegion]);

  const clusters = useMemo(() => {
    return clusterMarkers(debouncedClusterInput.results, debouncedClusterInput.region);
  }, [debouncedClusterInput]);

  // Total items in directory (regardless of location)
  const totalCounts = useMemo(() => ({
    terrains: terrains.length,
    clubs: clubs.length,
    players: players.length,
    tournaments: tournaments.length,
  }), [terrains.length, clubs.length, players.length, tournaments.length]);

  // Non-geolocated items the current user may edit (exclude public / other users' directory cards)
  const noGeoCount = useMemo(() => {
    const missing = (arr: { id: string; userId?: string; location?: any }[]) =>
      arr.filter(i => !hasValidLocation(i) && canUserGeolocateItem(i)).length;
    return (
      missing(terrains) +
      missing(clubs) +
      missing(enrichedPlayers) +
      missing(tournaments)
    );
  }, [terrains, clubs, enrichedPlayers, tournaments, hasValidLocation, canUserGeolocateItem]);

  const [showNoGeoBanner, setShowNoGeoBanner] = useState(true);
  const [showNoGeoModal, setShowNoGeoModal] = useState(false);
  const [batchGeoMode, setBatchGeoMode] = useState(false);
  const [geoSaving, setGeoSaving] = useState<string | null>(null);
  const [geolocatedIds, setGeolocatedIds] = useState<Set<string>>(new Set());

  const noGeoItems = useMemo(() => {
    const items: { id: string; name: string; type: string; icon: string; color: string; route: string }[] = [];
    terrains
      .filter(i => !hasValidLocation(i) && canUserGeolocateItem(i))
      .forEach(i => items.push({ id: i.id, name: i.name, type: t('map', 'terrainSingular'), icon: 'sports-soccer', color: theme.success, route: `/terrain/edit/${i.id}` }));
    clubs
      .filter(i => !hasValidLocation(i) && canUserGeolocateItem(i))
      .forEach(i => items.push({ id: i.id, name: i.name, type: t('map', 'clubSingular'), icon: 'home', color: theme.accent, route: `/club/edit/${i.id}` }));
    enrichedPlayers
      .filter(i => !hasValidLocation(i) && canUserGeolocateItem(i))
      .forEach(i => items.push({ id: i.id, name: i.name, type: t('map', 'playerSingular'), icon: 'person', color: theme.primary, route: `/player/edit/${i.id}` }));
    tournaments
      .filter(i => !hasValidLocation(i) && canUserGeolocateItem(i))
      .forEach(i => items.push({ id: i.id, name: i.name, type: t('map', 'tournamentSingular'), icon: 'emoji-events', color: theme.carreauColor, route: `/tournament/edit/${i.id}` }));
    return items;
  }, [terrains, clubs, enrichedPlayers, tournaments, hasValidLocation, canUserGeolocateItem, t]);

  const counts = useMemo(() => {
    const countType = (type: string) => results.filter(r => r.itemType === type).length;

    return {
      terrains: countType('terrains'),
      clubs: countType('clubs'),
      players: countType('players'),
      tournaments: countType('tournaments'),
      events: countType('events'),
      partners: countType('partners'),
      total: results.length,
      publicTotal: results.filter(r => r._isPublic).length,
    };
  }, [results]);

  const handleSelect = useCallback((item: any, type: string) => {
    if (!item) return;
    Haptics.selectionAsync();
    setShowClusterList(false);
    if (shouldUsePartnerPopup(item, type)) {
      const ambassadorId = item._itemId || item.id;
      if (ambassadorId) {
        trackAmbassadorEvent(ambassadorId, 'profile_view', undefined, { sourcePage: 'map' });
      }
      setSelected(null);
      setSelectedPartner(item);
    } else {
      setSelectedPartner(null);
      setSelected({ ...item, itemType: item.itemType ?? type });
    }
  }, []);

  const handleClusterPress = useCallback((cluster: Cluster) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Trigger burst animation with dominant cluster color
    const typeCounts: Record<string, number> = {};
    cluster.items.forEach(item => { typeCounts[item.itemType] = (typeCounts[item.itemType] || 0) + 1; });
    const dominant = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];
    const burstC = dominant ? (CLUSTER_COLOR_MAP[dominant[0]] || theme.primary) : theme.primary;
    triggerBurst(burstC);

    // Show cluster expansion list
    setClusterListItems(cluster.items);
    setShowClusterList(true);
  }, []);

  const handleClusterZoom = useCallback(() => {
    if (!mapRef.current || clusterListItems.length === 0) return;
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    clusterListItems.forEach(item => {
      const lat = item.location?.latitude || 0;
      const lng = item.location?.longitude || 0;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });
    const padLat = Math.max((maxLat - minLat) * 0.4, 0.01);
    const padLng = Math.max((maxLng - minLng) * 0.4, 0.01);
    mapRef.current.animateToRegion({
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: (maxLat - minLat) + padLat,
      longitudeDelta: (maxLng - minLng) + padLng,
    }, 400);
    setShowClusterList(false);
  }, [clusterListItems]);

  const handleNavigate = useCallback(() => {
    if (!selected) return;
    if (selected.itemType === 'events') {
      router.push(`/sponsored-event/${selected.id}` as any);
      setSelected(null);
      return;
    }
    if (selected._isPublic) return;
    const routes: Record<string, string> = {
      clubs: `/club/${selected.id}`, terrains: `/terrain/${selected.id}`,
      tournaments: `/tournament/${selected.id}`, players: `/player/${selected.id}`,
    };
    router.push(routes[selected.itemType] as any);
    setSelected(null);
  }, [selected]);

  const handleImportPublicItem = useCallback(async (item: any) => {
    if (!item) return;
    Haptics.selectionAsync();
    const tableMap: Record<string, any> = { players: 'players', clubs: 'clubs', terrains: 'terrains', tournaments: 'tournaments' };
    const table = tableMap[item.itemType];
    if (!table) return;

    const { newItemId, error } = await importPublicItemToDirectory(table, item.id);
    if (error) {
      showAlert(t('common', 'error'), error);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelected(null);
      // Refresh context so the imported item appears in directory immediately
      refreshData();
      // Show toast with directory tab navigation
      const tabMap: Record<string, { tab: string; labelKey: string; icon: string; color: string }> = {
        players: { tab: 'players', labelKey: 'playersTab', icon: 'person', color: '#4F46E5' },
        clubs: { tab: 'clubs', labelKey: 'clubsTab', icon: 'home', color: '#F97316' },
        terrains: { tab: 'terrains', labelKey: 'terrainsTab', icon: 'sports-soccer', color: '#22C55E' },
        tournaments: { tab: 'tournaments', labelKey: 'tournamentsTab', icon: 'emoji-events', color: '#EAB308' },
      };
      const tabInfo = tabMap[item.itemType];
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
  }, [showAlert, showToast, t]);

  const handleFilterPress = useCallback((f: MarkerType) => {
    Haptics.selectionAsync();
    setFilter(f);
    setSelected(null);
    // Reset sub-filters when switching categories
    if (f !== 'players') {
      setEloRankFilter(null);
      setTrustFilter(null);
      setPlayerRoleFilter(null);
      setEloRangeFilter(null);
    }
    if (f !== 'terrains') {
      setTerrainTypeFilter(null);
      setTerrainEnvFilter(null);
      setTerrainLightingFilter(null);
      setTerrainCoveredFilter(null);
      setTerrainParkingFilter(null);
      setTerrainToiletsFilter(null);
      setTerrainPublicAccessFilter(null);
      setTerrainMembersOnlyFilter(null);
      setTerrainMultiCourtsFilter(null);
    }
    if (f !== 'clubs') {
      setClubFacilityFilter(null);
    }
    if (f !== 'tournaments') {
      setTournamentFormatFilter(null);
      setTournamentStatusFilter(null);
    }
  }, []);

  // Stable sub-filter toggle handlers (avoid inline closures in JSX)
  const handleEloRankToggle = useCallback((tier: EloRankTier) => {
    Haptics.selectionAsync();
    setEloRankFilter(prev => prev === tier ? null : tier);
  }, []);

  const handleTrustToggle = useCallback((key: 'verified' | 'high' | 'medium_low') => {
    Haptics.selectionAsync();
    setTrustFilter(prev => prev === key ? null : key);
  }, []);

  const handleTerrainTypeToggle = useCallback((id: string) => {
    Haptics.selectionAsync();
    setTerrainTypeFilter(prev => prev === id ? null : id);
  }, []);

  const handleTerrainEnvToggle = useCallback((id: 'indoor' | 'outdoor') => {
    Haptics.selectionAsync();
    setTerrainEnvFilter(prev => prev === id ? null : id);
  }, []);

  const handleTournamentFormatToggle = useCallback((fmt: string) => {
    Haptics.selectionAsync();
    setTournamentFormatFilter(prev => prev === fmt ? null : fmt);
  }, []);

  const handleTournamentStatusToggle = useCallback((key: string) => {
    Haptics.selectionAsync();
    setTournamentStatusFilter(prev => prev === key ? null : key);
  }, []);

  const handlePlayerRoleToggle = useCallback((role: string) => {
    Haptics.selectionAsync();
    setPlayerRoleFilter(prev => prev === role ? null : role);
  }, []);

  const handleEloRangeToggle = useCallback((key: 'placement') => {
    Haptics.selectionAsync();
    setEloRangeFilter(prev => prev === key ? null : key);
  }, []);

  const handleClearPlayerSubFilters = useCallback(() => {
    Haptics.selectionAsync();
    setEloRankFilter(null);
    setTrustFilter(null);
    setPlayerRoleFilter(null);
    setEloRangeFilter(null);
  }, []);

  const handleTerrainCharToggle = useCallback((key: 'lighting' | 'covered' | 'parking' | 'toilets' | 'public_access' | 'members_only' | 'multi_courts') => {
    Haptics.selectionAsync();
    if (key === 'lighting') setTerrainLightingFilter(prev => prev === true ? null : true);
    else if (key === 'covered') setTerrainCoveredFilter(prev => prev === true ? null : true);
    else if (key === 'parking') setTerrainParkingFilter(prev => prev === true ? null : true);
    else if (key === 'toilets') setTerrainToiletsFilter(prev => prev === true ? null : true);
    else if (key === 'public_access') { setTerrainPublicAccessFilter(prev => prev === true ? null : true); setTerrainMembersOnlyFilter(null); }
    else if (key === 'members_only') { setTerrainMembersOnlyFilter(prev => prev === true ? null : true); setTerrainPublicAccessFilter(null); }
    else if (key === 'multi_courts') setTerrainMultiCourtsFilter(prev => prev === true ? null : true);
  }, []);

  const handleClubFacilityToggle = useCallback((facility: string) => {
    Haptics.selectionAsync();
    setClubFacilityFilter(prev => prev === facility ? null : facility);
  }, []);

  const handleClearClubSubFilters = useCallback(() => {
    Haptics.selectionAsync();
    setClubFacilityFilter(null);
  }, []);

  const handleClearTerrainSubFilters = useCallback(() => {
    Haptics.selectionAsync();
    setTerrainTypeFilter(null);
    setTerrainEnvFilter(null);
    setTerrainLightingFilter(null);
    setTerrainCoveredFilter(null);
    setTerrainParkingFilter(null);
    setTerrainToiletsFilter(null);
    setTerrainPublicAccessFilter(null);
    setTerrainMembersOnlyFilter(null);
    setTerrainMultiCourtsFilter(null);
  }, []);

  const handleClearTournamentSubFilters = useCallback(() => {
    Haptics.selectionAsync();
    setTournamentFormatFilter(null);
    setTournamentStatusFilter(null);
  }, []);

  const handleRegionChange = useCallback((region: any) => {
    if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
    regionDebounceRef.current = setTimeout(() => {
      setCurrentRegion({
        latitude: region.latitude,
        longitude: region.longitude,
        latitudeDelta: region.latitudeDelta,
        longitudeDelta: region.longitudeDelta,
      });
    }, 650);
  }, []);

  // Cleanup debounces on unmount
  useEffect(() => {
    return () => {
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current);
      if (clusterDebounceRef.current) clearTimeout(clusterDebounceRef.current);
      if (heatmapAnimRef.current) clearInterval(heatmapAnimRef.current);
    };
  }, []);

  // Active now mode from directory
  const [activeNowMode, setActiveNowMode] = useState(false);
  const [activeNowTerrainIds, setActiveNowTerrainIds] = useState<Set<string>>(new Set());

  // Terrain activity data from dedicated hook (accurate active-now detection)
  const terrainActivityMap = useTerrainActivity();

  // Player density heatmap
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [heatmapPeriod, setHeatmapPeriod] = useState<'all' | 'week' | 'month' | '3months'>('all');
  const [heatmapAnimating, setHeatmapAnimating] = useState(false);
  const [heatmapAnimStep, setHeatmapAnimStep] = useState(0);
  const HEATMAP_ANIM_STEPS = 4;
  const [heatmapCumulative, setHeatmapCumulative] = useState(false);

  // Heatmap animation timer
  useEffect(() => {
    if (!heatmapAnimating) {
      if (heatmapAnimRef.current) { clearInterval(heatmapAnimRef.current); heatmapAnimRef.current = null; }
      return;
    }
    setHeatmapAnimStep(0);
    heatmapAnimRef.current = setInterval(() => {
      setHeatmapAnimStep(prev => (prev + 1) % HEATMAP_ANIM_STEPS);
    }, 1500);
    return () => { if (heatmapAnimRef.current) { clearInterval(heatmapAnimRef.current); heatmapAnimRef.current = null; } };
  }, [heatmapAnimating]);

  // Stop animation when heatmap is hidden or period is 'all'
  useEffect(() => {
    if (!showHeatmap || heatmapPeriod === 'all') {
      setHeatmapAnimating(false);
      setHeatmapAnimStep(0);
    }
  }, [showHeatmap, heatmapPeriod]);

  // Cluster burst animation
  const [burstVisible, setBurstVisible] = useState(false);
  const [burstColor, setBurstColor] = useState(theme.primary);
  const burstRing1 = useSharedValue(0);
  const burstRing2 = useSharedValue(0);
  const burstRing3 = useSharedValue(0);

  const burstRing1Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + burstRing1.value * 2.5 }],
    opacity: 1 - burstRing1.value,
  }));
  const burstRing2Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + burstRing2.value * 2 }],
    opacity: 1 - burstRing2.value,
  }));
  const burstRing3Style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + burstRing3.value * 1.5 }],
    opacity: 1 - burstRing3.value,
  }));

  const triggerBurst = useCallback((color: string) => {
    setBurstColor(color);
    setBurstVisible(true);
    burstRing1.value = 0;
    burstRing2.value = 0;
    burstRing3.value = 0;
    burstRing1.value = withTiming(1, { duration: 500 });
    burstRing2.value = withSequence(withTiming(0, { duration: 80 }), withTiming(1, { duration: 420 }));
    burstRing3.value = withSequence(withTiming(0, { duration: 160 }), withTiming(1, { duration: 340 }));
    setTimeout(() => setBurstVisible(false), 550);
  }, []);

  // Player density heatmap data
  const heatmapData = useMemo(() => {
    if (!showHeatmap) return [];
    const allPlayersWithLoc = [...ownData.players, ...pubData.players].filter(p => {
      const lat = p.location?.latitude;
      const lng = p.location?.longitude;
      return lat && lng && lat !== 0 && lng !== 0;
    });
    const seen = new Set<string>();
    let uniquePlayers = allPlayersWithLoc.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    // Time period filtering
    const now = Date.now();
    const periodMs: Record<string, number> = { week: 7 * 86400000, month: 30 * 86400000, '3months': 90 * 86400000 };
    const totalPeriod = periodMs[heatmapPeriod] || 0;
    if (totalPeriod > 0) {
      if (heatmapAnimating) {
        const sliceDuration = totalPeriod / HEATMAP_ANIM_STEPS;
        if (heatmapCumulative) {
          // Cumulative: show all players from period start up to end of current slice
          const periodStart = now - totalPeriod;
          const cumulativeEnd = periodStart + (heatmapAnimStep + 1) * sliceDuration;
          uniquePlayers = uniquePlayers.filter(p => {
            const lmd = (p as any).lastMatchDate || (p as any).last_match_date;
            if (!lmd) return false;
            const t = new Date(lmd).getTime();
            return t >= periodStart && t < cumulativeEnd;
          });
        } else {
          // Isolated: show only players active in current time slice
          const sliceStart = now - totalPeriod + heatmapAnimStep * sliceDuration;
          const sliceEnd = sliceStart + sliceDuration;
          uniquePlayers = uniquePlayers.filter(p => {
            const lmd = (p as any).lastMatchDate || (p as any).last_match_date;
            if (!lmd) return false;
            const t = new Date(lmd).getTime();
            return t >= sliceStart && t < sliceEnd;
          });
        }
      } else {
        // Static: show all players within period
        const cutoff = now - totalPeriod;
        uniquePlayers = uniquePlayers.filter(p => {
          const lmd = (p as any).lastMatchDate || (p as any).last_match_date;
          if (!lmd) return false;
          return new Date(lmd).getTime() >= cutoff;
        });
      }
    }

    if (uniquePlayers.length === 0) return [];
    const gridSize = 10;
    const latStep = currentRegion.latitudeDelta / gridSize;
    const lngStep = currentRegion.longitudeDelta / gridSize;
    const minLat = currentRegion.latitude - currentRegion.latitudeDelta / 2;
    const minLng = currentRegion.longitude - currentRegion.longitudeDelta / 2;
    const grid = new Map<string, { lat: number; lng: number; count: number }>();
    uniquePlayers.forEach(p => {
      const lat = p.location.latitude;
      const lng = p.location.longitude;
      const r = Math.floor((lat - minLat) / latStep);
      const c = Math.floor((lng - minLng) / lngStep);
      if (r < 0 || r >= gridSize || c < 0 || c >= gridSize) return;
      const key = `${r}-${c}`;
      if (!grid.has(key)) grid.set(key, { lat: minLat + (r + 0.5) * latStep, lng: minLng + (c + 0.5) * lngStep, count: 0 });
      grid.get(key)!.count++;
    });
    const cells = Array.from(grid.values()).filter(c => c.count > 0);
    const maxCount = Math.max(...cells.map(c => c.count), 1);
    const baseRadius = Math.max(currentRegion.latitudeDelta * 111000 / gridSize * 0.55, 300);
    return cells.map(c => {
      const ratio = c.count / maxCount;
      const fillColor = ratio >= 0.7 ? 'rgba(239,68,68,0.35)' : ratio >= 0.4 ? 'rgba(245,158,11,0.30)' : ratio >= 0.15 ? 'rgba(59,130,246,0.25)' : 'rgba(147,197,253,0.20)';
      const strokeColor = ratio >= 0.7 ? 'rgba(239,68,68,0.50)' : ratio >= 0.4 ? 'rgba(245,158,11,0.40)' : ratio >= 0.15 ? 'rgba(59,130,246,0.35)' : 'rgba(147,197,253,0.30)';
      return { ...c, radius: baseRadius * (0.6 + ratio * 0.6), fillColor, strokeColor };
    });
  }, [showHeatmap, ownData.players, pubData.players, currentRegion, heatmapPeriod, heatmapAnimating, heatmapAnimStep, heatmapCumulative]);

  const heatmapPlayerCount = useMemo(() => {
    if (!showHeatmap) return 0;
    return heatmapData.reduce((s, c) => s + c.count, 0);
  }, [showHeatmap, heatmapData]);

  // Handle filter param from directory
  useEffect(() => {
    if (paramFilter === 'terrains') {
      setFilter('terrains');
    }
    if (paramActiveNow === 'true') {
      setActiveNowMode(true);
      setFilter('terrains');
    }
  }, [paramFilter, paramActiveNow]);

  // Compute active-now terrain IDs from useTerrainActivity hook
  // Separate truly LIVE terrains (red dot always visible) from habitual ones (green, only when mode on)
  const [liveTerrainIds, setLiveTerrainIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const activeIds = new Set<string>();
    const liveIds = new Set<string>();
    terrainActivityMap.forEach((info, terrainId) => {
      if (info.isActiveNow) {
        liveIds.add(terrainId);
        activeIds.add(terrainId);
      } else if (info.habitualScore > 10) {
        activeIds.add(terrainId);
      }
    });
    setActiveNowTerrainIds(activeIds);
    setLiveTerrainIds(liveIds);
  }, [terrainActivityMap]);

  /** LIVE (red) + habitual (green, active-now mode) terrains — pulse drawn as map circles on Android. */
  const terrainPulseItems = useMemo(() => {
    const items: { id: string; latitude: number; longitude: number; color: string }[] = [];
    for (const cluster of clusters) {
      if (cluster.isCluster) continue;
      const item = cluster.items[0];
      if (item.itemType !== 'terrains') continue;
      const live = liveTerrainIds.has(item.id);
      const habitual = activeNowMode && activeNowTerrainIds.has(item.id) && !live;
      if (!live && !habitual) continue;
      const latitude = cluster.latitude;
      const longitude = cluster.longitude;
      if (!isValidMapCoord(latitude, longitude)) continue;
      items.push({
        id: item.id,
        latitude,
        longitude,
        color: live ? '#EF4444' : '#22C55E',
      });
    }
    return items;
  }, [clusters, liveTerrainIds, activeNowTerrainIds, activeNowMode]);

  // Access matches for active-now computation
  const { matches: allMatches } = useAppData();

  // Zoom from deep links (home proximity, directory, terrain detail, etc.).
  // Callers pass mf (map focus nonce) so repeat navigation with the same lat/lng/name still re-runs this effect.
  // Previously handledParamRef skipped the second visit; unchanged deps also skipped React's useEffect.
  useEffect(() => {
    if (!paramLat || !paramLng) return;
    const lat = parseFloat(paramLat);
    const lng = parseFloat(paramLng);
    if (isNaN(lat) || isNaN(lng)) return;
    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.animateToRegion(
          {
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.001,
            longitudeDelta: 0.001,
          },
          600
        );
      }
      if (paramName) {
        showToast({ message: paramName, icon: 'place', iconColor: theme.success });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [paramLat, paramLng, paramName, paramMapFocus, showToast]);

  const loadManageData = useCallback(async () => {
    setLoadingManage(true);
    const data = await getMyPublicableItems();
    setMyItems(data);
    setLoadingManage(false);
  }, []);

  const handleTogglePublic = useCallback(async (table: 'players' | 'clubs' | 'terrains' | 'tournaments', id: string, current: boolean) => {
    Haptics.selectionAsync();
    const { error } = await toggleItemPublic(table, id, !current);
    if (error) {
      showAlert(t('common', 'error'), error);
    } else {
      setMyItems((prev: any) => ({
        ...prev,
        [table]: prev[table].map((it: any) => it.id === id ? { ...it, isPublic: !current } : it),
      }));
      // Sync with AppContext so player card and other pages reflect the change
      setItemPublic(table, id, !current);
      const refreshers: Record<string, () => Promise<any>> = {
        players: fetchPublicPlayers, clubs: fetchPublicClubs,
        terrains: fetchPublicTerrains, tournaments: fetchPublicTournaments,
      };
      const res = await refreshers[table]();
      if (!res.error) {
        const setters: Record<string, any> = {
          players: setPublicPlayers, clubs: setPublicClubs,
          terrains: setPublicTerrains, tournaments: setPublicTournaments,
        };
        setters[table](res.items);
      }
    }
  }, [showAlert, t]);

  const getSingularLabel = useCallback((itemType: string) => {
    return MARKER_CONFIG[itemType as keyof typeof MARKER_CONFIG]?.singular || itemType;
  }, [MARKER_CONFIG]);

  // Responsive
  const [screenWidth, setScreenWidth] = useState(() => Dimensions.get('window').width || 375);
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setScreenWidth(window.width));
    return () => sub?.remove();
  }, []);
  const isTablet = screenWidth >= 600;

  const renderItem = useCallback(({ item }: { item: any }) => (
    <ListItem
      item={item}
      onPress={() => handleSelect(item, item.itemType)}
      singularLabel={getSingularLabel(item.itemType)}
      terrainTypeLabel={item.itemType === 'terrains' ? t('terrainTypes', item.type) : undefined}
      isPublicItem={item._isPublic}
      onImport={item._isPublic ? () => handleImportPublicItem(item) : undefined}
      t={t}
    />
  ), [handleSelect, getSingularLabel, t, handleImportPublicItem]);

  const keyExtractor = useCallback((item: any) => `${item.itemType}-${item.id}-${item._isPublic ? 'p' : 'o'}`, []);

    // In the parent, track per-marker readiness:
  const [readyMarkers, setReadyMarkers] = useState<Set<string>>(new Set());

  const handleMarkerReady = useCallback((id: string) => {
    setReadyMarkers(prev => new Set([...prev, id]));
  }, []);

  // iOS: stop tracksViewChanges if a marker never calls onReady (broken image URL, etc.)
  useEffect(() => {
    if (IS_ANDROID_MAP) return;
    const pendingIds = clusters
      .filter(c => !c.isCluster)
      .map(c => c.items[0]?.id)
      .filter((id): id is string => !!id && !readyMarkers.has(id));
    if (pendingIds.length === 0) return;
    const timer = setTimeout(() => {
      setReadyMarkers(prev => new Set([...prev, ...pendingIds]));
    }, 2500);
    return () => clearTimeout(timer);
  }, [clusters, readyMarkers]);

  // iOS only: brief tracksViewChanges refresh when clusters change. On Android this blocks marker taps.
  const [clusterTracksViewChanges, setClusterTracksViewChanges] = useState(false);
  useEffect(() => {
    if (IS_ANDROID_MAP) return;
    setClusterTracksViewChanges(true);
    const timer = setTimeout(() => setClusterTracksViewChanges(false), 600);
    return () => clearTimeout(timer);
  }, [clusters]);

  const handleMapReady = useCallback(() => {
    requestAnimationFrame(() => {
      setTimeout(() => setMapTilesReady(true), IS_ANDROID_MAP ? 200 : 50);
    });
  }, []);

  useEffect(() => {
    if (!mapTilesReady || !isMapFocused) {
      setMarkersReady(false);
      return;
    }
    if (!IS_ANDROID_MAP) {
      setMarkersReady(true);
      return;
    }
    const timer = setTimeout(() => setMarkersReady(true), 1200);
    return () => {
      clearTimeout(timer);
      setMarkersReady(false);
    };
  }, [mapTilesReady, isMapFocused]);

  const renderMapMarkers = () => {
    if (!mapTilesReady || !MarkerComponent) return null;
    if (IS_ANDROID_MAP && !markersReady) return null;

    if (ANDROID_USE_SIMPLE_MARKERS) {
      return clusters.map((cluster) => {
        if (cluster.isCluster) {
          return (
            <MarkerComponent
              key={cluster.id}
              coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
              pinColor="purple"
              title={String(cluster.items.length)}
              onPress={() => handleClusterPress(cluster)}
              tappable
              tracksViewChanges={false}
            />
          );
        }
        const item = cluster.items[0];
        const cfg = MARKER_CONFIG[item.itemType as keyof typeof MARKER_CONFIG];
        if (!cfg) return null;
        const terrainLive = item.itemType === 'terrains' && liveTerrainIds.has(item.id);
        const terrainHabitual = activeNowMode && item.itemType === 'terrains' && activeNowTerrainIds.has(item.id) && !terrainLive;
        const markerColor = terrainLive ? '#EF4444' : (terrainHabitual ? '#22C55E' : cfg.color);
        const imageUri = getMapItemPhoto(item) || item.avatar || item.photo || item._sponsorPhoto;
        const pinColor = resolveAndroidPinColor(markerColor, { live: terrainLive, habitual: terrainHabitual });
        return (
          <MarkerComponent
            key={cluster.id}
            coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
            {...(imageUri ? { image: { uri: imageUri } } : { pinColor })}
            onPress={() => handleSelect(item, item.itemType)}
            tappable
            tracksViewChanges={false}
          />
        );
      });
    }

    return clusters.map(cluster => {
          if (cluster.isCluster) {
            // Cluster marker
            const typeCounts: Record<string, number> = {};
            cluster.items.forEach(item => {
              typeCounts[item.itemType] = (typeCounts[item.itemType] || 0) + 1;
            });
            return (
              <MarkerComponent
                key={cluster.id}
                coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
                onPress={() => handleClusterPress(cluster)}
                anchor={MAP_MARKER_BUBBLE_ANCHOR}
                style={MAP_MARKER_NATIVE_STYLE}
                tappable
                tracksViewChanges={IS_ANDROID_MAP ? false : clusterTracksViewChanges}
              >
                <ClusterMarkerView count={cluster.items.length} typeCounts={typeCounts} />
              </MarkerComponent>
            );
          } else {
            // Single marker
            const item = cluster.items[0];
            const cfg = MARKER_CONFIG[item.itemType as keyof typeof MARKER_CONFIG];
            if (!cfg) return null;
            const tc = item.itemType === 'terrains' ? config.terrainTypes.find(tt => tt.id === item.type) : null;
            const terrainLive = item.itemType === 'terrains' && liveTerrainIds.has(item.id);
            const terrainHabitual = activeNowMode && item.itemType === 'terrains' && activeNowTerrainIds.has(item.id) && !terrainLive;
            const markerHasPulse = terrainLive || terrainHabitual;
            const markerIcon = tc?.icon || cfg.icon;
            const itemPhoto = getMapItemPhoto(item);
            const onMarkerReady = () => handleMarkerReady(item.id);
            // Android: always false — true freezes map/tabs (see docs/map-marker-android-fix.md).
            // iOS: keep true until bitmap ready or pulse animating.
            const markerTracksViewChanges = IS_ANDROID_MAP
              ? false
              : (markerHasPulse || !readyMarkers.has(item.id));
            let markerContent: React.ReactNode;
            if (isPartnerMapItem(item) || isAmbassadorPlayerItem(item)) {
              markerContent = (
                <PartnerMarkerView
                  partner={{ ...item, _tier: item._tier, photo: item.photo || item.avatar }}
                  onReady={onMarkerReady}
                />
              );
            } else if (isSponsoredMapItem(item)) {
              markerContent = (
                <SponsoredSplitMarkerView
                  itemIcon={markerIcon}
                  itemColor={cfg.color}
                  itemPhoto={itemPhoto}
                  sponsorPhoto={item._sponsorPhoto}
                  sponsorColor={item._sponsorColor || '#2563EB'}
                  size={40}
                  onReady={onMarkerReady}
                />
              );
            } else if (itemPhoto) {
              markerContent = (
                <EntityPhotoMarkerView
                  photo={itemPhoto}
                  color={terrainLive ? '#EF4444' : (terrainHabitual ? '#22C55E' : cfg.color)}
                  icon={markerIcon}
                  isPublic={item._isPublic}
                  onReady={onMarkerReady}
                />
              );
            } else if (item.itemType === 'players' && item.avatar) {
              markerContent = (
                <PlayerAvatarMarkerView
                  avatar={item.avatar}
                  color={cfg.color}
                  isPublic={item._isPublic}
                  onReady={onMarkerReady}
                />
              );
            } else {
              markerContent = (
                <SingleMarkerView
                  color={terrainLive ? '#EF4444' : (terrainHabitual ? '#22C55E' : cfg.color)}
                  icon={markerIcon}
                  isPublic={item._isPublic}
                  accessIndicator={item.itemType === 'terrains' ? (item.publicAccess !== false ? 'public' : 'private') : null}
                  fallbackSource={item.itemType === 'players' ? (item._locationFallback || null) : null}
                  isVerified={item.itemType === 'clubs' && item.isVerified}
                  isActiveNow={terrainHabitual}
                  isLive={terrainLive}
                  sponsorColor={item.itemType === 'players' && item.sponsorBrandColor ? item.sponsorBrandColor : null}
                  onReady={onMarkerReady}
                />
              );
            }
            return (
              <MarkerComponent
                key={cluster.id}
                coordinate={{ latitude: cluster.latitude, longitude: cluster.longitude }}
                onPress={() => handleSelect(item, item.itemType)}
                anchor={MAP_MARKER_BUBBLE_ANCHOR}
                style={IS_ANDROID_MAP ? MAP_MARKER_NATIVE_STYLE : (getMapMarkerNativeStyle({ pulse: markerHasPulse && USE_IN_MARKER_PULSE }) ?? MAP_MARKER_NATIVE_STYLE)}
                tappable
                tracksViewChanges={markerTracksViewChanges}
              >
                {markerContent}
              </MarkerComponent>
            );
          }
        });
  };

  const renderMap = () => {
    if (!MapViewComponent || !mapMounted || !isMapFocused) return null;
    return (
      <MapViewComponent
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.mapFill}
        initialRegion={config.map.defaultRegion}
        showsUserLocation={false}
        showsMyLocationButton={false}
        loadingEnabled={IS_ANDROID_MAP}
        moveOnMarkerPress={false}
        scrollEnabled
        zoomEnabled
        zoomTapEnabled
        rotateEnabled
        pitchEnabled={false}
        scrollDuringRotateOrZoomEnabled
        zoomControlEnabled={IS_ANDROID_MAP}
        onMapReady={handleMapReady}
        onPress={() => { Keyboard.dismiss(); setSelected(null); setSelectedPartner(null); }}
        onRegionChangeComplete={handleRegionChange}
        mapPadding={{ top: 8, right: 8, bottom: 8, left: 8 }}
      >
        {renderMapMarkers()}
        {mapTilesReady ? <MapTerrainPulseLayer items={terrainPulseItems} /> : null}
        {/* Player density heatmap circles */}
        {mapTilesReady && showHeatmap && !IS_ANDROID_MAP && CircleComponent ? heatmapData.map((cell, idx) => (
          <CircleComponent
            key={`heat-${idx}`}
            center={{ latitude: cell.lat, longitude: cell.lng }}
            radius={cell.radius}
            fillColor={cell.fillColor}
            strokeColor={cell.strokeColor}
            strokeWidth={1}
            zIndex={-1}
          />
        )) : null}
      </MapViewComponent>
    );
  };

  const renderList = () => (
    <View style={styles.listContainer}>
      <View style={styles.listHeader}>
        <MaterialIcons name="map" size={48} color={theme.textMuted} />
        <Text style={styles.listTitle}>{t('map', 'interactiveMap')}</Text>
        <Text style={styles.listSubtitle}>{t('map', 'availableOnMobile')}</Text>
      </View>
      <FlatList
        data={results}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={[styles.listScroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={5}
        removeClippedSubviews={true}
        getItemLayout={(_data, index) => ({ length: 64, offset: 64 * index, index })}
      />
    </View>
  );

  /** Android emulator: no MapView (freezes Nox/AVD). Same filters + scrollable results. */
  const renderMapTabList = () => (
    <View style={styles.mapTabListRoot}>
      <View style={styles.emulatorMapBanner}>
        <MaterialIcons name="info-outline" size={16} color={theme.primary} />
        <Text style={styles.emulatorMapBannerText}>
          {language === 'fr'
            ? 'Mode liste sur emulateur. Carte interactive sur telephone.'
            : 'List mode on emulator. Interactive map on a real phone.'}
        </Text>
      </View>
      <FlatList
        data={results}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.mapTabListScroll}
        showsVerticalScrollIndicator={false}
        initialNumToRender={12}
        maxToRenderPerBatch={8}
        windowSize={5}
        removeClippedSubviews
      />
    </View>
  );

  // Manage modal section renderer
  const handleBatchTogglePublic = useCallback(async (table: 'players' | 'clubs' | 'terrains' | 'tournaments', items: any[], makePublic: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const toToggle = items.filter((i: any) => i.isPublic !== makePublic);
    for (const item of toToggle) {
      await handleTogglePublic(table, item.id, item.isPublic);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [handleTogglePublic]);

  const renderManageSection = (table: 'players' | 'clubs' | 'terrains' | 'tournaments', items: any[], icon: string, color: string, label: string) => {
    if (items.length === 0) return null;
    const publicCount = items.filter((i: any) => i.isPublic).length;
    const allPublic = publicCount === items.length;
    const allPrivate = publicCount === 0;
    return (
      <View style={styles.manageSection}>
        <View style={styles.manageSectionHeader}>
          <View style={[styles.manageSectionIcon, { backgroundColor: color + '15' }]}>
            <MaterialIcons name={icon as any} size={16} color={color} />
          </View>
          <Text style={styles.manageSectionTitle}>{label}</Text>
          <Text style={styles.manageSectionCount}>
            {publicCount}/{items.length}
          </Text>
        </View>
        {items.length > 1 ? (
          <View style={styles.batchToggleRow}>
            <Pressable
              style={[styles.batchToggleBtn, allPublic && { opacity: 0.5 }]}
              onPress={() => handleBatchTogglePublic(table, items, true)}
              disabled={allPublic}
            >
              <MaterialIcons name="public" size={14} color={theme.success} />
              <Text style={[styles.batchToggleBtnText, { color: theme.success }]}>{language === 'fr' ? 'Tout public' : 'All public'}</Text>
            </Pressable>
            <Pressable
              style={[styles.batchToggleBtn, allPrivate && { opacity: 0.5 }]}
              onPress={() => handleBatchTogglePublic(table, items, false)}
              disabled={allPrivate}
            >
              <MaterialIcons name="lock" size={14} color={theme.textSecondary} />
              <Text style={[styles.batchToggleBtnText, { color: theme.textSecondary }]}>{language === 'fr' ? 'Tout masquer' : 'All private'}</Text>
            </Pressable>
          </View>
        ) : null}
        {items.map((item: any) => (
          <View key={item.id} style={styles.manageItem}>
            <Text style={styles.manageItemName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.manageItemRight}>
              {item.isPublic ? (
                <View style={styles.publicBadgeManage}>
                  <MaterialIcons name="public" size={12} color={theme.success} />
                  <Text style={styles.publicBadgeManageText}>{t('map', 'publicLabel')}</Text>
                </View>
              ) : (
                <View style={styles.privateBadgeManage}>
                  <MaterialIcons name="lock" size={12} color={theme.textMuted} />
                  <Text style={styles.privateBadgeManageText}>{t('map', 'privateLabel')}</Text>
                </View>
              )}
              <Switch
                value={item.isPublic}
                onValueChange={() => handleTogglePublic(table, item.id, item.isPublic)}
                trackColor={{ false: theme.border, true: theme.success + '60' }}
                thumbColor={item.isPublic ? theme.success : theme.textMuted}
              />
            </View>
          </View>
        ))}
      </View>
    );
  };


  
  const renderHeroHeader = () => (
    <View style={[styles.heroSection, { paddingTop: insets.top }]} pointerEvents="box-none">
      <View style={[styles.heroGradient, { backgroundColor: '#0F172A' }]} pointerEvents="auto">
        <View style={styles.heroDecoCircle1} />
        <View style={styles.heroDecoCircle2} />
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroTitle}>{t('map', 'map')}</Text>
            <Text style={styles.heroSubtitle}>
              {counts.total} {t('map', 'results')} {counts.publicTotal > 0 ? `• ${counts.publicTotal} ${t('map', 'publicLabel')}` : ''}
            </Text>
          </View>
          <View style={styles.heroActions}>
            <Pressable
              style={styles.heroActionBtn}
              onPress={() => {
                Haptics.selectionAsync();
                loadManageData();
                setShowManageModal(true);
              }}
            >
              <MaterialIcons name="public" size={18} color="#FFF" />
            </Pressable>
            <Pressable
              style={[styles.heroActionBtn, showSearch && styles.heroActionBtnActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setShowSearch(!showSearch);
                if (showSearch) setSearch('');
              }}
            >
              <MaterialIcons name={showSearch ? 'close' : 'search'} size={20} color="#FFF" />
            </Pressable>
            <Pressable
              style={[styles.heroActionBtn, activeNowMode && { backgroundColor: 'rgba(34,197,94,0.35)' }]}
              onPress={() => {
                Haptics.selectionAsync();
                const next = !activeNowMode;
                setActiveNowMode(next);
                if (next) setFilter('terrains');
              }}
            >
              <MaterialIcons name="local-fire-department" size={18} color={activeNowMode ? '#FFF' : 'rgba(255,255,255,0.7)'} />
            </Pressable>
            <Pressable
              style={[styles.heroActionBtn, showHeatmap && { backgroundColor: 'rgba(37,99,235,0.35)' }]}
              onPress={() => { Haptics.selectionAsync(); setShowHeatmap(prev => !prev); }}
            >
              <MaterialIcons name="blur-on" size={18} color={showHeatmap ? '#FFF' : 'rgba(255,255,255,0.7)'} />
            </Pressable>
          </View>
        </View>
        <View style={styles.heroStatsSummary}>
          {(Object.keys(MARKER_CONFIG) as (keyof typeof MARKER_CONFIG)[]).map((k, i) => {
            const isActive = filter === k;
            return (
              <React.Fragment key={k}>
                {i > 0 ? <View style={styles.heroStatDivider} /> : null}
                <Pressable style={styles.heroStatItem} onPress={() => handleFilterPress(k)}>
                  <Text style={[styles.heroStatValue, isActive && { color: '#FFF', fontSize: 19 }]}>{counts[k]}</Text>
                  <Text style={[styles.heroStatLabel, isActive && { color: 'rgba(255,255,255,0.7)' }]}>{MARKER_CONFIG[k].label}</Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      </View>
      {showMapAd ? (
        <View style={styles.heroAdBanner}>
          <AdBanner position="inline" />
        </View>
      ) : null}
    </View>
  );

  const renderBottomPanel = () => (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={Platform.OS === 'ios'}
    >
      <View style={styles.bottomPanel} pointerEvents="auto">
        {showSearch ? (
          <Animated.View entering={FadeIn.duration(200)} style={styles.searchRowOuter}>
            <View style={styles.searchBar}>
              <MaterialIcons name="search" size={18} color={theme.textMuted} />
              <TextInput
                style={styles.searchInput}
                placeholder={language === 'fr' ? 'Ville, terrain, club, joueur...' : 'City, terrain, club, player...'}
                placeholderTextColor={theme.textMuted}
                value={search}
                onChangeText={(text) => {
                  setSearch(text);
                  if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
                  if (text.trim().length < 2) { setSearchSuggestions([]); setShowSuggestions(false); return; }
                  searchDebounceRef.current = setTimeout(() => {
                    const q = text.toLowerCase().trim();
                    const suggestions: { label: string; type: string; count?: number; lat?: number; lng?: number; icon?: string; color?: string }[] = [];
                    const cityMap = new Map<string, { count: number; lat?: number; lng?: number }>();
                    [...ownData.terrains, ...ownData.clubs, ...ownData.players, ...pubData.terrains, ...pubData.clubs, ...pubData.players].forEach(item => {
                      const city = item.city || item.location?.city;
                      if (city && city.toLowerCase().includes(q)) {
                        const existing = cityMap.get(city) || { count: 0 };
                        existing.count++;
                        if (!existing.lat && item.location?.latitude) { existing.lat = item.location.latitude; existing.lng = item.location.longitude; }
                        cityMap.set(city, existing);
                      }
                    });
                    cityMap.forEach((v, city) => {
                      suggestions.push({ label: city, type: language === 'fr' ? 'Ville' : 'City', count: v.count, lat: v.lat, lng: v.lng, icon: 'location-city', color: '#3B82F6' });
                    });
                    const nameMatches: typeof suggestions = [];
                    const typeLabels: Record<string, { label: string; icon: string; color: string }> = {
                      terrains: { label: language === 'fr' ? 'Terrain' : 'Terrain', icon: 'sports-soccer', color: theme.success },
                      clubs: { label: 'Club', icon: 'home', color: theme.accent },
                      players: { label: language === 'fr' ? 'Joueur' : 'Player', icon: 'person', color: theme.primary },
                    };
                    const addNameMatches = (items: any[], itemType: string) => {
                      items.filter(it => it.name?.toLowerCase().includes(q)).slice(0, 3).forEach(it => {
                        const tl = typeLabels[itemType];
                        if (tl) nameMatches.push({ label: it.name, type: tl.label, lat: it.location?.latitude, lng: it.location?.longitude, icon: tl.icon, color: tl.color });
                      });
                    };
                    addNameMatches([...ownData.terrains, ...pubData.terrains], 'terrains');
                    addNameMatches([...ownData.clubs, ...pubData.clubs], 'clubs');
                    addNameMatches([...ownData.players, ...pubData.players], 'players');
                    suggestions.push(...nameMatches.slice(0, 5));
                    const seen = new Set<string>();
                    const deduped = suggestions.filter(s => { const key = `${s.label}-${s.type}`; if (seen.has(key)) return false; seen.add(key); return true; });
                    setSearchSuggestions(deduped.slice(0, 8));
                    setShowSuggestions(deduped.length > 0);
                  }, 200);
                }}
                autoFocus
              />
              {search.length > 0 ? (
                <Pressable onPress={() => { setSearch(''); setSearchSuggestions([]); setShowSuggestions(false); }} hitSlop={8}><MaterialIcons name="close" size={16} color={theme.textMuted} /></Pressable>
              ) : null}
            </View>
            {!search.trim() ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionChipsRow}>
                {[{ label: language === 'fr' ? 'Pres de moi' : 'Near me', icon: 'my-location', onPress: () => {
                  if (mapRef.current) {
                    mapRef.current.animateToRegion({ ...currentRegion, latitudeDelta: 0.1, longitudeDelta: 0.1 }, 400);
                  }
                }},
                ...topCities.map(tc => ({
                  label: tc.name, icon: 'location-city' as const,
                  onPress: () => { setSearch(tc.name); if (tc.lat && tc.lng && mapRef.current) mapRef.current.animateToRegion({ latitude: tc.lat, longitude: tc.lng, latitudeDelta: 0.12, longitudeDelta: 0.12 }, 500); },
                })),
                ].map((chip, i) => (
                  <Pressable key={i} style={styles.suggestionChip} onPress={() => { Haptics.selectionAsync(); chip.onPress(); }}>
                    <MaterialIcons name={chip.icon as any} size={13} color={theme.textSecondary} />
                    <Text style={styles.suggestionChipText}>{chip.label}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {showSuggestions && searchSuggestions.length > 0 ? (
              <ScrollView style={styles.suggestionsContainer} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {searchSuggestions.map((sug, idx) => (
                  <Pressable
                    key={`${sug.label}-${sug.type}-${idx}`}
                    style={styles.suggestionItem}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSearch(sug.label);
                      setShowSuggestions(false);
                      if (sug.lat && sug.lng && mapRef.current) {
                        mapRef.current.animateToRegion({
                          latitude: sug.lat,
                          longitude: sug.lng,
                          latitudeDelta: sug.type === (language === 'fr' ? 'Ville' : 'City') ? 0.08 : 0.02,
                          longitudeDelta: sug.type === (language === 'fr' ? 'Ville' : 'City') ? 0.08 : 0.02,
                        }, 500);
                      }
                    }}
                  >
                    <View style={[styles.suggestionIcon, { backgroundColor: ((sug as any).color || theme.primary) + '12' }]}>
                      <MaterialIcons name={((sug as any).icon || 'place') as any} size={16} color={(sug as any).color || theme.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.suggestionLabel} numberOfLines={1}>{sug.label}</Text>
                      <Text style={styles.suggestionMeta}>{sug.type}{sug.count ? ` • ${sug.count} ${language === 'fr' ? 'elements' : 'items'}` : ''}</Text>
                    </View>
                    {sug.lat ? <MaterialIcons name="near-me" size={14} color={theme.textMuted} /> : null}
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            {search.trim() && !showSuggestions ? <Text style={styles.searchCount}>{counts.total} {counts.total !== 1 ? t('map', 'results') : t('map', 'result')}</Text> : null}
          </Animated.View>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
          contentContainerStyle={styles.filters}
        >
          <FilterChip label={t('map', 'all')} icon="layers" isActive={filter === 'all'} onPress={() => handleFilterPress('all')} />
          {(Object.keys(MARKER_CONFIG) as (keyof typeof MARKER_CONFIG)[]).map(k => (
            <FilterChip key={k} label={MARKER_CONFIG[k].label} icon={MARKER_CONFIG[k].icon} isActive={filter === k} activeColor={MARKER_CONFIG[k].color} onPress={() => handleFilterPress(k)} />
          ))}
        </ScrollView>
        {filter === 'terrains' ? (
          <TerrainSubFilters
            terrainTypeFilter={terrainTypeFilter}
            terrainEnvFilter={terrainEnvFilter}
            terrainLightingFilter={terrainLightingFilter}
            terrainCoveredFilter={terrainCoveredFilter}
            terrainParkingFilter={terrainParkingFilter}
            terrainToiletsFilter={terrainToiletsFilter}
            terrainPublicAccessFilter={terrainPublicAccessFilter}
            terrainMembersOnlyFilter={terrainMembersOnlyFilter}
            terrainMultiCourtsFilter={terrainMultiCourtsFilter}
            onTerrainTypePress={handleTerrainTypeToggle}
            onTerrainEnvPress={handleTerrainEnvToggle}
            onTerrainCharPress={handleTerrainCharToggle}
            onClear={handleClearTerrainSubFilters}
            count={counts.terrains}
            language={language}
          />
        ) : null}
        {filter === 'clubs' ? (
          <View style={styles.subFiltersContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subFiltersRow}>
              <View style={styles.subFilterLabel}>
                <MaterialIcons name="build" size={12} color={theme.textMuted} />
                <Text style={styles.subFilterLabelText}>{language === 'fr' ? 'Equipements' : 'Facilities'}</Text>
              </View>
              {(['Parking', 'Buvette', 'Toilettes', 'Eclairage', 'Boulodrome couvert', 'Vestiaires', 'Location de boules', 'Wi-Fi', 'Restaurant'] as const).map(fac => (
                <SubFilterChip key={fac} label={fac} isActive={clubFacilityFilter === fac} color={theme.accent} onPress={() => handleClubFacilityToggle(fac)} />
              ))}
            </ScrollView>
            {clubFacilityFilter ? (
              <View style={styles.subFilterActiveBar}>
                <Text style={styles.subFilterActiveText}>{counts.clubs} {language === 'fr' ? 'club(s) filtre(s)' : 'club(s) filtered'}</Text>
                <Pressable style={styles.subFilterClearBtn} onPress={handleClearClubSubFilters}>
                  <MaterialIcons name="close" size={12} color={theme.primary} />
                  <Text style={styles.subFilterClearText}>{language === 'fr' ? 'Effacer' : 'Clear'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        ) : null}
        {filter === 'tournaments' ? (
          <TournamentSubFilters
            tournamentFormatFilter={tournamentFormatFilter}
            tournamentStatusFilter={tournamentStatusFilter}
            onFormatPress={handleTournamentFormatToggle}
            onStatusPress={handleTournamentStatusToggle}
            onClear={handleClearTournamentSubFilters}
            count={counts.tournaments}
            language={language}
          />
        ) : null}
        {filter === 'players' ? (
          <PlayerSubFilters
            eloRankFilter={eloRankFilter}
            eloRangeFilter={eloRangeFilter}
            trustFilter={trustFilter}
            roleFilter={playerRoleFilter}
            onEloRankPress={handleEloRankToggle}
            onEloRangePress={handleEloRangeToggle}
            onTrustPress={handleTrustToggle}
            onRolePress={handlePlayerRoleToggle}
            onClear={handleClearPlayerSubFilters}
            count={counts.players}
            language={language}
          />
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? renderList() : (
        <>
          {USE_NATIVE_MAP ? (
          <View
            style={[styles.mapLayer, { top: mapChrome.top, bottom: mapChrome.bottom }]}
            collapsable={false}
            pointerEvents="box-none"
          >
            {mapMounted && isMapFocused ? renderMap() : (
              <View style={styles.mapPlaceholder}>
                <ActivityIndicator size="small" color={theme.primary} />
              </View>
            )}

      {/* Cluster burst animation overlay */}
      {burstVisible && mapMounted ? (
        <View style={styles.burstOverlay} pointerEvents="none">
          <Animated.View style={[styles.burstRing, { borderColor: burstColor }, burstRing1Style]} />
          <Animated.View style={[styles.burstRing, { borderColor: burstColor, width: 48, height: 48, borderRadius: 24 }, burstRing2Style]} />
          <Animated.View style={[styles.burstRing, { borderColor: burstColor, width: 36, height: 36, borderRadius: 18, borderWidth: 3 }, burstRing3Style]} />
        </View>
      ) : null}

      {/* Active Now legend */}
      {activeNowMode && mapMounted ? (
        <View style={[styles.heatmapLegend, { top: 8, minWidth: 160 }]} pointerEvents="none">
          <View style={styles.heatmapLegendHeader}>
            <MaterialIcons name="local-fire-department" size={14} color="#22C55E" />
            <Text style={[styles.heatmapLegendTitle, { color: '#166534' }]}>{language === 'fr' ? 'Terrains actifs' : 'Active terrains'}</Text>
          </View>
          <Text style={styles.heatmapLegendCount}>
            {activeNowTerrainIds.size} {language === 'fr' ? 'terrain(s) actif(s)' : 'active terrain(s)'}
          </Text>
          <View style={styles.heatmapLegendScale}>
            <View style={styles.heatmapLegendItem}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#EF4444', borderWidth: 2, borderColor: '#FFF' }} />
              <Text style={styles.heatmapLegendLabel}>LIVE</Text>
            </View>
            <View style={styles.heatmapLegendItem}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#22C55E' }} />
              <Text style={styles.heatmapLegendLabel}>{language === 'fr' ? 'Habituel' : 'Habitual'}</Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* Heatmap legend + controls */}
      {showHeatmap && !activeNowMode && mapMounted ? (
        <View style={[styles.heatmapLegend, { top: 8 }]} pointerEvents="box-none">
          <View pointerEvents="none">
          <View style={styles.heatmapLegendHeader}>
            <MaterialIcons name="blur-on" size={14} color={theme.primary} />
            <Text style={styles.heatmapLegendTitle}>{language === 'fr' ? 'Densite joueurs' : 'Player density'}</Text>
          </View>
          <Text style={styles.heatmapLegendCount}>{heatmapPlayerCount} {language === 'fr' ? 'joueurs publics' : 'public players'}</Text>
          <View style={styles.heatmapLegendScale}>
            {[
              { color: 'rgba(147,197,253,0.6)', label: language === 'fr' ? 'Faible' : 'Low' },
              { color: 'rgba(59,130,246,0.7)', label: language === 'fr' ? 'Moyen' : 'Medium' },
              { color: 'rgba(245,158,11,0.8)', label: language === 'fr' ? 'Eleve' : 'High' },
              { color: 'rgba(239,68,68,0.85)', label: language === 'fr' ? 'Tres eleve' : 'Very high' },
            ].map((item, i) => (
              <View key={i} style={styles.heatmapLegendItem}>
                <View style={[styles.heatmapLegendDot, { backgroundColor: item.color }]} />
                <Text style={styles.heatmapLegendLabel}>{item.label}</Text>
              </View>
            ))}
          </View>
          </View>
          {/* Period filter chips */}
          <View style={styles.heatmapDivider} />
          <Text style={styles.heatmapPeriodLabel}>{language === 'fr' ? 'Periode' : 'Period'}</Text>
          <View style={styles.heatmapPeriodRow}>
            {([{ key: 'all' as const, label: language === 'fr' ? 'Tout' : 'All' }, { key: 'week' as const, label: '7j' }, { key: 'month' as const, label: '30j' }, { key: '3months' as const, label: '3m' }]).map(p => (
              <Pressable
                key={p.key}
                style={[styles.heatmapPeriodChip, heatmapPeriod === p.key && styles.heatmapPeriodChipActive]}
                onPress={() => { Haptics.selectionAsync(); setHeatmapPeriod(p.key); }}
              >
                <Text style={[styles.heatmapPeriodChipText, heatmapPeriod === p.key && styles.heatmapPeriodChipTextActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          {/* Animation controls */}
          {heatmapPeriod !== 'all' ? (
            <View style={{ gap: 6 }}>
              <View style={styles.heatmapAnimRow}>
                <Pressable
                  style={[styles.heatmapAnimBtn, heatmapAnimating && styles.heatmapAnimBtnActive]}
                  onPress={() => { Haptics.selectionAsync(); setHeatmapAnimating(prev => !prev); }}
                >
                  <MaterialIcons name={heatmapAnimating ? 'pause' : 'play-arrow'} size={16} color={heatmapAnimating ? '#FFF' : theme.primary} />
                </Pressable>
                {heatmapAnimating ? (
                  <View style={styles.heatmapAnimInfo}>
                    <View style={styles.heatmapAnimDots}>
                      {Array.from({ length: HEATMAP_ANIM_STEPS }).map((_, i) => (
                        <View key={i} style={[styles.heatmapAnimDot, i <= (heatmapCumulative ? heatmapAnimStep : -1) && styles.heatmapAnimDotFilled, i === heatmapAnimStep && styles.heatmapAnimDotActive]} />
                      ))}
                    </View>
                    <Text style={styles.heatmapAnimLabel}>
                      {(() => {
                        const periodMs: Record<string, number> = { week: 7 * 86400000, month: 30 * 86400000, '3months': 90 * 86400000 };
                        const total = periodMs[heatmapPeriod] || 0;
                        const sliceDur = total / HEATMAP_ANIM_STEPS;
                        const fmt = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;
                        if (heatmapCumulative) {
                          const periodStart = new Date(Date.now() - total);
                          const cumulativeEnd = new Date(periodStart.getTime() + (heatmapAnimStep + 1) * sliceDur);
                          return `${fmt(periodStart)} \u2192 ${fmt(cumulativeEnd)}`;
                        }
                        const sliceStart = new Date(Date.now() - total + heatmapAnimStep * sliceDur);
                        const sliceEnd = new Date(sliceStart.getTime() + sliceDur);
                        return `${fmt(sliceStart)} - ${fmt(sliceEnd)}`;
                      })()}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.heatmapAnimHint}>{language === 'fr' ? 'Evolution' : 'Evolution'}</Text>
                )}
              </View>
              {/* Cumulative toggle */}
              <Pressable
                style={[styles.heatmapCumulativeToggle, heatmapCumulative && styles.heatmapCumulativeToggleActive]}
                onPress={() => { Haptics.selectionAsync(); setHeatmapCumulative(prev => !prev); }}
              >
                <MaterialIcons name={heatmapCumulative ? 'stacked-bar-chart' : 'bar-chart'} size={13} color={heatmapCumulative ? '#FFF' : theme.textSecondary} />
                <Text style={[styles.heatmapCumulativeText, heatmapCumulative && styles.heatmapCumulativeTextActive]}>
                  {language === 'fr' ? 'Cumulatif' : 'Cumulative'}
                </Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

          </View>
          ) : null}

          <View style={styles.mapChromeColumn} pointerEvents="box-none">
            <View onLayout={onHeroChromeLayout} style={styles.mapChromeTop} pointerEvents="box-none">
              {renderHeroHeader()}
            </View>

            {!USE_NATIVE_MAP ? renderMapTabList() : (
              <View style={styles.mapChromeSpacer} pointerEvents="none" />
            )}

      {/* No-Geo Banner — above map layer for reliable touches */}
      {noGeoCount > 0 && showNoGeoBanner ? (
        <Animated.View entering={FadeInDown.duration(300)} style={styles.noGeoBannerDocked}>
          <View style={styles.noGeoBannerIcon}>
            <MaterialIcons name="location-off" size={20} color={theme.warning} />
          </View>
          <View style={styles.noGeoBannerContent}>
            <Text style={styles.noGeoBannerTitle}>{t('map', 'noGeoBannerTitle')}</Text>
            <Text style={styles.noGeoBannerDesc}>{noGeoCount} {t('map', 'noGeoBannerDesc')}</Text>
          </View>
          <Pressable style={styles.noGeoBannerBtn} onPress={() => { Haptics.selectionAsync(); setShowNoGeoModal(true); }}>
            <Text style={styles.noGeoBannerBtnText}>{t('map', 'noGeoBannerAction')}</Text>
          </Pressable>
          <Pressable style={styles.noGeoBannerClose} onPress={() => setShowNoGeoBanner(false)} hitSlop={8}>
            <MaterialIcons name="close" size={14} color={theme.textMuted} />
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Selected Card */}
      {selected ? (() => {
        const selectedCfg = MARKER_CONFIG[selected.itemType as keyof typeof MARKER_CONFIG];
        const selectedColor = selectedCfg?.color || theme.primary;
        const selectedIcon = getMapItemIcon(selected.itemType, selected.type);
        return (
        <Animated.View entering={FadeInUp.duration(250)} style={styles.selectedCardDocked}>
          <Pressable style={styles.selectedInner} onPress={selected._isPublic ? undefined : handleNavigate}>
            <View style={[styles.selectedIcon, { backgroundColor: selectedColor }]}>
              <MaterialIcons name={selectedIcon as any} size={22} color="#FFF" />
            </View>
            <View style={styles.selectedContent}>
              <View style={styles.selectedTitleRow}>
                <Text style={styles.selectedTitle} numberOfLines={1}>{selected.name || selected.displayName || '-'}</Text>
                {selected._isPublic && selected.itemType === 'players' && selected.isPremium ? (
                  <View style={styles.premiumBadgeMap}>
                    <MaterialIcons name="star" size={8} color="#A8B4C0" />
                  </View>
                ) : null}
                {selected._isPublic ? (
                  <View style={styles.publicBadgeSelected}>
                    <MaterialIcons name="public" size={10} color={theme.success} />
                    <Text style={styles.publicBadgeSelectedText}>{t('map', 'publicLabel')}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.selectedMeta}>
                <MaterialIcons name="place" size={12} color={theme.textMuted} />
                <Text style={styles.selectedMetaText}>
                  {selected.itemType === 'terrains' ? `${selected.city} • ${t('terrainTypes', selected.type)}` :
                   selected.itemType === 'clubs' ? selected.city :
                   selected.itemType === 'players' ? (selected.location?.city || selected.club || '-') :
                   selected.location?.city}
                </Text>
              </View>
              <View style={styles.selectedTags}>
                <View style={[styles.tag, { backgroundColor: selectedColor + '15' }]}>
                  <Text style={[styles.tagText, { color: selectedColor }]}>
                    {selectedCfg?.singular || selected.itemType}
                  </Text>
                </View>
                {selected.itemType === 'terrains' && selected.courtsCount ? (
                  <View style={styles.tag}><Text style={styles.tagText}>{selected.courtsCount} {selected.courtsCount > 1 ? t('map', 'courts') : t('map', 'court')}</Text></View>
                ) : null}
                {selected.itemType === 'terrains' && (() => {
                  const actInfo = terrainActivityMap.get(selected.id);
                  if (!actInfo) return null;
                  if (actInfo.isActiveNow) return (
                    <View style={[styles.tag, { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA' }]}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' }} />
                      <Text style={[styles.tagText, { color: '#DC2626' }]}>LIVE</Text>
                    </View>
                  );
                  if (actInfo.habitualScore > 0) return (
                    <View style={[styles.tag, { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' }]}>
                      <MaterialIcons name="schedule" size={8} color="#22C55E" />
                      <Text style={[styles.tagText, { color: '#16A34A' }]}>{actInfo.peakLabel}</Text>
                    </View>
                  );
                  return null;
                })()}
                {selected.itemType === 'players' && selected.role ? (
                  <View style={styles.tag}><Text style={styles.tagText}>{selected.role}</Text></View>
                ) : null}
                {selected.itemType === 'players' && (selected.eloRating || selected.elo_rating) ? (() => {
                  const elo = selected.eloRating || selected.elo_rating || 1000;
                  const rank = getEloRank(elo);
                  return <View style={[styles.tag, { backgroundColor: rank.color + '15' }]}><MaterialIcons name={rank.icon as any} size={8} color={rank.color} /><Text style={[styles.tagText, { color: rank.color }]}>{elo}</Text></View>;
                })() : null}
                {selected.itemType === 'tournaments' ? (
                  <View style={styles.tag}><Text style={styles.tagText}>{t('formats', selected.format)}</Text></View>
                ) : null}
                {selected.itemType === 'events' ? (
                  <View style={styles.tag}><Text style={styles.tagText}>{selected.challengeType === '10_tirs' ? '10 Tirs' : selected.challengeType === '10_tirs_sautee' ? '10 Tirs sautee' : 'Precision'}</Text></View>
                ) : null}
                {selected.itemType === 'events' && selected.status ? (
                  <View style={[styles.tag, { backgroundColor: selected.status === 'active' ? '#22C55E15' : '#F59E0B15' }]}><Text style={[styles.tagText, { color: selected.status === 'active' ? '#22C55E' : '#F59E0B' }]}>{selected.status === 'active' ? (language === 'fr' ? 'En cours' : 'Active') : (language === 'fr' ? 'A venir' : 'Upcoming')}</Text></View>
                ) : null}
              </View>
            </View>
            <View style={{ alignItems: 'center', gap: 6 }}>
              {selected.itemType === 'events' ? (
                <Pressable style={[styles.selectedArrow, { backgroundColor: '#7C3AED15' }]} onPress={handleNavigate}>
                  <MaterialIcons name="arrow-forward" size={18} color="#7C3AED" />
                </Pressable>
              ) : selected._isPublic ? (
                <Pressable style={styles.importBtn} onPress={() => handleImportPublicItem(selected)}>
                  <MaterialIcons name="add-circle" size={24} color={theme.primary} />
                </Pressable>
              ) : (
                <View style={styles.selectedArrow}>
                  <MaterialIcons name="arrow-forward" size={18} color={theme.primary} />
                </View>
              )}
              {selected._isPublic && selected.itemType === 'players' && selected.userId && selected.userId !== user?.id ? (
                <Pressable style={styles.selectedInviteBtn} onPress={() => handleInviteToMeetupMap(selected.userId, getMapItemDisplayName(selected))}>
                  <MaterialIcons name="event" size={14} color={theme.primary} />
                </Pressable>
              ) : null}
              {selected.itemType === 'terrains' ? (
                <Pressable
                  style={styles.selectedMeetupBtn}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelected(null);
                    router.push({ pathname: '/meetup/new', params: { terrainId: selected.id } } as any);
                  }}
                >
                  <MaterialIcons name="group-add" size={14} color={theme.success} />
                </Pressable>
              ) : null}
            </View>
          </Pressable>
          <Pressable style={styles.selectedClose} onPress={() => setSelected(null)}>
            <MaterialIcons name="close" size={16} color={theme.textMuted} />
          </Pressable>
        </Animated.View>
        );
      })() : null}

      {/* Partner Detail Popup */}
      {selectedPartner ? (() => {
        const customColor = normalizeBrandColor(selectedPartner.brandColor);
        const tierCfg = customColor
          ? {
              primary: customColor,
              bg: hexToRgba(customColor, 0.5),
              border: customColor,
            }
          : TIER_COLORS[selectedPartner._tier] || TIER_COLORS.sponsor;

        const isPartner = isPartnerMapItem(selectedPartner);
        const isGold = selectedPartner._tier === 'gold_sponsor';
        const tierLabel = getAmbassadorTierLabel(selectedPartner, language);
        const partnerDisplayName = getMapItemDisplayName(selectedPartner);
        const ambassadorId = selectedPartner._itemId || selectedPartner.id;

        return (
          <Animated.View entering={FadeInUp.duration(250)} style={styles.partnerPopupDocked}>
            <Pressable style={styles.partnerPopupClose} onPress={() => setSelectedPartner(null)} hitSlop={8}>
              <MaterialIcons name="close" size={16} color={theme.textMuted} />
            </Pressable>
            {/* Header */}
            <View style={styles.partnerPopupHeader}>
              {selectedPartner.photo ? (
                <RNImage
                  source={{ uri: selectedPartner.photo }}
                  style={[styles.partnerPopupAvatar, { borderColor: tierCfg.border, backgroundColor: tierCfg.bg }]}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.partnerPopupAvatarFallback, { backgroundColor: tierCfg.bg, borderColor: tierCfg.border }]}>
                  <MaterialIcons name={isGold ? 'workspace-premium' : 'handshake'} size={24} color={tierCfg.primary} />
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.partnerPopupName} numberOfLines={1}>{partnerDisplayName}</Text>
                {tierLabel ? (
                  <View style={[styles.partnerPopupBadge, { backgroundColor: tierCfg.primary }]}>
                    <MaterialIcons name={isGold ? 'star' : 'workspace-premium'} size={9} color="#FFF" />
                    <Text style={styles.partnerPopupBadgeText}>{tierLabel.toUpperCase()}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            {/* Bio */}
            {selectedPartner.bio ? (
              <Text style={styles.partnerPopupBio} numberOfLines={3}>{selectedPartner.bio}</Text>
            ) : null}
            {/* Social links */}
            {(selectedPartner.youtubeUrl || selectedPartner.instagramHandle || selectedPartner.twitterHandle || selectedPartner.tiktokUrl) ? (
              <View style={styles.partnerPopupSocials}>
                {selectedPartner.youtubeUrl ? (
                  <Pressable style={[styles.partnerPopupSocialChip, { backgroundColor: '#FF000010', borderColor: '#FF000020' }]} onPress={() => { if (ambassadorId) trackAmbassadorEvent(ambassadorId, 'social_click', 'youtube', { sourcePage: 'map' }); Linking.openURL(selectedPartner.youtubeUrl!); }}>
                    <MaterialIcons name="play-arrow" size={14} color="#FF0000" />
                    <Text style={[styles.partnerPopupSocialText, { color: '#FF0000' }]}>YouTube</Text>
                  </Pressable>
                ) : null}
                {selectedPartner.instagramHandle ? (
                  <Pressable style={[styles.partnerPopupSocialChip, { backgroundColor: '#E4405F10', borderColor: '#E4405F20' }]} onPress={() => { if (ambassadorId) trackAmbassadorEvent(ambassadorId, 'social_click', 'instagram', { sourcePage: 'map' }); Linking.openURL(`https://instagram.com/${selectedPartner.instagramHandle}`); }}>
                    <MaterialIcons name="camera-alt" size={14} color="#E4405F" />
                    <Text style={[styles.partnerPopupSocialText, { color: '#E4405F' }]}>Instagram</Text>
                  </Pressable>
                ) : null}
                {selectedPartner.twitterHandle ? (
                  <Pressable style={[styles.partnerPopupSocialChip, { backgroundColor: '#1DA1F210', borderColor: '#1DA1F220' }]} onPress={() => { if (ambassadorId) trackAmbassadorEvent(ambassadorId, 'social_click', 'twitter', { sourcePage: 'map' }); Linking.openURL(`https://x.com/${selectedPartner.twitterHandle}`); }}>
                    <MaterialIcons name="alternate-email" size={14} color="#1DA1F2" />
                    <Text style={[styles.partnerPopupSocialText, { color: '#1DA1F2' }]}>X</Text>
                  </Pressable>
                ) : null}
                {selectedPartner.tiktokUrl ? (
                  <Pressable style={[styles.partnerPopupSocialChip, { backgroundColor: '#01010108', borderColor: '#01010112' }]} onPress={() => { if (ambassadorId) trackAmbassadorEvent(ambassadorId, 'social_click', 'tiktok', { sourcePage: 'map' }); Linking.openURL(selectedPartner.tiktokUrl!); }}>
                    <MaterialIcons name="music-note" size={14} color="#010101" />
                    <Text style={[styles.partnerPopupSocialText, { color: '#333' }]}>TikTok</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {/* Actions */}
            <View style={styles.partnerPopupActions}>
              {selectedPartner.websiteUrl ? (
                <Pressable
                  style={({ pressed }) => [styles.partnerPopupVisitBtn, { borderColor: tierCfg.primary }, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                  onPress={() => { if (ambassadorId) trackAmbassadorEvent(ambassadorId, 'social_click', 'website', { sourcePage: 'map' }); Linking.openURL(selectedPartner.websiteUrl!); }}
                >
                  <MaterialIcons name="open-in-new" size={16} color={tierCfg.primary} />
                  <Text style={[styles.partnerPopupVisitText, { color: tierCfg.primary }]}>{language === 'fr' ? 'Visiter le site' : 'Visit website'}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={({ pressed }) => [styles.partnerPopupProfileBtn, pressed && { opacity: 0.85 }]}
                onPress={() => {
                  setSelectedPartner(null);
                  if (isPartner) {
                    router.push('/partners' as any);
                  } else if (ambassadorId) {
                    router.push(`/partner/${ambassadorId}` as any);
                  }
                }}
              >
                <MaterialIcons name="arrow-forward" size={16} color={theme.primary} />
              </Pressable>
            </View>
          </Animated.View>
        );
      })() : null}

            <View onLayout={onBottomChromeLayout} style={styles.mapChromeBottom} pointerEvents="box-none">
              {renderBottomPanel()}
            </View>
          </View>
        </>
      )}

      {/* No-Geo Items Modal */}
      <Modal visible={showNoGeoModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setShowNoGeoModal(false); setBatchGeoMode(false); }}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('map', 'noGeoModalTitle')}</Text>
            <Pressable style={styles.modalClose} onPress={() => { setShowNoGeoModal(false); setBatchGeoMode(false); }}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.manageInfo}>
            <MaterialIcons name="location-off" size={18} color={theme.warning} />
            <Text style={styles.manageInfoText}>{noGeoCount} {t('map', 'noGeoBannerDesc')}</Text>
          </View>
          {/* Batch mode toggle */}
          <View style={styles.batchToggleRow}>
            <Pressable
              style={[styles.batchToggleBtn, !batchGeoMode && styles.batchToggleBtnActive]}
              onPress={() => setBatchGeoMode(false)}
            >
              <MaterialIcons name="edit" size={16} color={!batchGeoMode ? '#FFF' : theme.textSecondary} />
              <Text style={[styles.batchToggleText, !batchGeoMode && styles.batchToggleTextActive]}>{t('map', 'noGeoEditBtn')}</Text>
            </Pressable>
            <Pressable
              style={[styles.batchToggleBtn, batchGeoMode && styles.batchToggleBtnActive]}
              onPress={() => setBatchGeoMode(true)}
            >
              <MaterialIcons name="my-location" size={16} color={batchGeoMode ? '#FFF' : theme.textSecondary} />
              <Text style={[styles.batchToggleText, batchGeoMode && styles.batchToggleTextActive]}>{t('map', 'noGeoBatchMode')}</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.modalContent} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
            {noGeoItems.filter(item => !geolocatedIds.has(item.id)).map(item => (
              <View key={`${item.type}-${item.id}`} style={styles.noGeoItemBatch}>
                <Pressable
                  style={styles.noGeoItem}
                  onPress={() => {
                    if (!batchGeoMode) {
                      setShowNoGeoModal(false);
                      setBatchGeoMode(false);
                      router.push(item.route as any);
                    }
                  }}
                >
                  <View style={[styles.noGeoItemIcon, { backgroundColor: item.color + '15' }]}>
                    <MaterialIcons name={item.icon as any} size={20} color={item.color} />
                  </View>
                  <View style={styles.noGeoItemInfo}>
                    <Text style={styles.noGeoItemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.noGeoItemType}>{item.type}</Text>
                  </View>
                  {!batchGeoMode ? (
                    <View style={styles.noGeoItemBtn}>
                      <MaterialIcons name="edit-location-alt" size={18} color={theme.primary} />
                      <Text style={styles.noGeoItemBtnText}>{t('map', 'noGeoEditBtn')}</Text>
                    </View>
                  ) : geoSaving === item.id ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : null}
                </Pressable>
                {batchGeoMode ? (
                  <View style={styles.batchLocationPicker}>
                    <LocationPicker
                      label=""
                      showCityOnly
                      placeholder={t('map', 'noGeoSetLocation')}
                      onChange={async (loc: LocationData) => {
                        if (!loc.latitude && !loc.longitude) return;
                        setGeoSaving(item.id);
                        try {
                          const locationUpdate = { location: { address: loc.address, city: loc.city, country: loc.country, latitude: loc.latitude, longitude: loc.longitude } };
                          const typeTable = item.icon === 'sports-soccer' ? 'terrain' : item.icon === 'home' ? 'club' : item.icon === 'person' ? 'player' : 'tournament';
                          if (typeTable === 'terrain') await updateTerrain(item.id, { ...locationUpdate, city: loc.city, address: loc.address } as any);
                          else if (typeTable === 'club') await updateClub(item.id, { ...locationUpdate, city: loc.city, address: loc.address } as any);
                          else if (typeTable === 'player') await updatePlayer(item.id, locationUpdate as any);
                          else await updateTournament(item.id, locationUpdate as any);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                          setGeolocatedIds(prev => new Set([...prev, item.id]));
                          showToast({ message: `${item.name} — ${t('map', 'noGeoLocationSaved')}`, icon: 'check-circle', iconColor: theme.success });
                        } catch (e) { /* silent */ }
                        setGeoSaving(null);
                      }}
                    />
                  </View>
                ) : null}
              </View>
            ))}
            {noGeoItems.filter(item => !geolocatedIds.has(item.id)).length === 0 ? (
              <View style={styles.manageEmpty}>
                <MaterialIcons name="check-circle" size={48} color={theme.success} />
                <Text style={styles.manageEmptyText}>{t('common', 'success')}</Text>
                <Text style={styles.manageEmptyDesc}>{t('map', 'noGeoLocationSaved')}</Text>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Manage Public Items Modal */}
      <Modal visible={showManageModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowManageModal(false)}>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('map', 'managePublic')}</Text>
            <Pressable style={styles.modalClose} onPress={() => setShowManageModal(false)}>
              <MaterialIcons name="close" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>
          <ScrollView style={styles.modalContent} contentContainerStyle={{ paddingBottom: insets.bottom + 32 }} showsVerticalScrollIndicator={false}>
            {/* Info */}
            <View style={styles.manageInfo}>
              <MaterialIcons name="info-outline" size={18} color={theme.primary} />
              <Text style={styles.manageInfoText}>{t('map', 'publicItemsDesc')}</Text>
            </View>

            {loadingManage ? (
              <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 40 }} />
            ) : (
              <>
                {renderManageSection('players', myItems.players.filter((p: any) => p.id === user?.id), 'person', theme.primary, t('map', 'players'))}
                {renderManageSection('clubs', myItems.clubs, 'home', theme.accent, t('map', 'clubs'))}
                {renderManageSection('terrains', myItems.terrains, 'sports-soccer', theme.success, t('map', 'terrains'))}
                {renderManageSection('tournaments', myItems.tournaments, 'emoji-events', theme.carreauColor, t('map', 'tournaments'))}

                {myItems.players.length === 0 && myItems.clubs.length === 0 && myItems.terrains.length === 0 && myItems.tournaments.length === 0 ? (
                  <View style={styles.manageEmpty}>
                    <MaterialIcons name="folder-off" size={48} color={theme.textMuted} />
                    <Text style={styles.manageEmptyText}>{t('map', 'noPublicItems')}</Text>
                    <Text style={styles.manageEmptyDesc}>{t('map', 'noPublicItemsDesc')}</Text>
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Cluster Expansion List Modal */}
      <Modal visible={showClusterList} animationType="slide" transparent onRequestClose={() => setShowClusterList(false)}>
        <View style={styles.clusterListOverlay}>
          <View style={styles.clusterListContent}>
            <View style={styles.clusterListHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.clusterListTitle}>{clusterListItems.length} {language === 'fr' ? 'elements' : 'items'}</Text>
                <Text style={styles.clusterListSub}>
                  {(() => {
                    const tc: Record<string, number> = {};
                    clusterListItems.forEach(it => { tc[it.itemType] = (tc[it.itemType] || 0) + 1; });
                    return Object.entries(tc).map(([type, count]) => `${count} ${MARKER_CONFIG[type as keyof typeof MARKER_CONFIG]?.label || type}`).join(' · ');
                  })()}
                </Text>
              </View>
              <Pressable style={styles.clusterListZoomBtn} onPress={handleClusterZoom}>
                <MaterialIcons name="zoom-in" size={18} color={theme.primary} />
              </Pressable>
              <Pressable style={styles.clusterListCloseBtn} onPress={() => setShowClusterList(false)}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <ScrollView style={{ maxHeight: 350 }} showsVerticalScrollIndicator={false}>
              {clusterListItems.map((item, idx) => {
                const cfg = MARKER_CONFIG[item.itemType as keyof typeof MARKER_CONFIG];
                if (!cfg) return null;
                const tc = item.itemType === 'terrains' ? config.terrainTypes.find(tt => tt.id === item.type) : null;
                return (
                  <Pressable
                    key={`${item.itemType}-${item.id}-${idx}`}
                    style={styles.clusterListItem}
                    onPress={() => {
                      setShowClusterList(false);
                      handleSelect(item, item.itemType);
                    }}
                  >
                    <View style={[styles.clusterListItemIcon, { backgroundColor: cfg.color }]}>
                      <MaterialIcons name={(tc?.icon || cfg.icon) as any} size={16} color="#FFF" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.clusterListItemName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.clusterListItemMeta} numberOfLines={1}>
                        {item.city || item.location?.city || ''}
                        {item.itemType === 'terrains' && item.type ? ` · ${t('terrainTypes', item.type)}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.clusterListItemType, { backgroundColor: cfg.color + '12' }]}>
                      <Text style={[styles.clusterListItemTypeText, { color: cfg.color }]}>{cfg.singular}</Text>
                    </View>
                    {item._isPublic ? (
                      <Pressable
                        style={styles.clusterListImportBtn}
                        onPress={(e) => { e.stopPropagation?.(); setShowClusterList(false); handleImportPublicItem(item); }}
                        hitSlop={4}
                      >
                        <MaterialIcons name="add-circle" size={20} color={theme.primary} />
                      </Pressable>
                    ) : (
                      <MaterialIcons name="chevron-right" size={18} color={theme.textMuted} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Meetup Invitation Picker Modal (Map) */}
      <Modal visible={showMeetupPicker} animationType="slide" transparent onRequestClose={() => setShowMeetupPicker(false)}>
        <View style={styles.meetupOverlay}>
          <View style={styles.meetupPickerContent}>
            <View style={styles.meetupPickerHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.meetupPickerTitle}>{t('meetup', 'inviteToMeetup')}</Text>
                <Text style={styles.meetupPickerSubtitle}>{meetupPickerUserName}</Text>
              </View>
              <Pressable style={styles.meetupPickerClose} onPress={() => setShowMeetupPicker(false)}>
                <MaterialIcons name="close" size={22} color={theme.textSecondary} />
              </Pressable>
            </View>
            <Text style={styles.meetupPickerDesc}>{t('meetup', 'chooseMeetup')}</Text>
            {loadingMeetups ? (
              <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator size="large" color={theme.primary} /></View>
            ) : activeMeetups.length > 0 ? (
              <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                {activeMeetups.map((m) => {
                  const mDate = new Date(m.date);
                  return (
                    <Pressable key={m.id} style={[styles.meetupPickerItem, invitingToMeetup === m.id && { opacity: 0.6 }]} onPress={() => handleConfirmInviteMap(m.id)} disabled={!!invitingToMeetup}>
                      <View style={styles.meetupPickerItemDate}>
                        <Text style={styles.meetupPickerItemDay}>{mDate.getDate()}</Text>
                        <Text style={styles.meetupPickerItemMonth}>{mDate.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-US', { month: 'short' }).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.meetupPickerItemTitle} numberOfLines={1}>{m.title}</Text>
                        <Text style={styles.meetupPickerItemTime}>{mDate.toLocaleTimeString(language === 'fr' ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
                      </View>
                      {invitingToMeetup === m.id ? <ActivityIndicator size="small" color={theme.primary} /> : (
                        <View style={styles.meetupPickerItemArrow}><MaterialIcons name="send" size={16} color={theme.primary} /></View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={{ alignItems: 'center', paddingVertical: 32 }}>
                <MaterialIcons name="event-busy" size={40} color={theme.textMuted} />
                <Text style={styles.meetupPickerEmptyText}>{t('meetup', 'noActiveMeetups')}</Text>
                <Text style={styles.meetupPickerEmptyDesc}>{t('meetup', 'noActiveMeetupsDesc')}</Text>
                <Pressable style={styles.meetupPickerCreateBtn} onPress={() => { setShowMeetupPicker(false); router.push('/meetup/new' as any); }}>
                  <MaterialIcons name="add" size={18} color="#FFF" />
                  <Text style={styles.meetupPickerCreateBtnText}>{t('meetup', 'createMeetupFirst')}</Text>
                </Pressable>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  /** Map band between measured hero + bottom chrome — SurfaceView must not cover filters or tab bar. */
  mapLayer: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    overflow: 'hidden' as const,
    zIndex: 0,
    backgroundColor: theme.backgroundSecondary,
  },
  mapChromeColumn: {
    flex: 1,
    zIndex: 2,
  },
  mapChromeTop: {
    zIndex: 3,
    ...Platform.select({
      android: { elevation: 20, renderToHardwareTextureAndroid: true } as ViewStyle,
      default: {},
    }),
  },
  mapChromeBottom: {
    zIndex: 3,
    ...Platform.select({
      android: { elevation: 20, renderToHardwareTextureAndroid: true } as ViewStyle,
      default: {},
    }),
  },
  mapChromeSpacer: {
    flex: 1,
    minHeight: 0,
  },
  mapRegion: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden' as const,
    position: 'relative' as const,
    backgroundColor: theme.backgroundSecondary,
  },
  mapFill: { flex: 1, width: '100%' as const },
  mapPlaceholder: {
    flex: 1,
    width: '100%' as const,
    backgroundColor: theme.backgroundSecondary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  },
  mapTabListRoot: { flex: 1, minHeight: 0 },
  mapTabListScroll: { paddingHorizontal: 12, paddingBottom: 8, gap: 4 },
  emulatorMapBanner: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: theme.primary + '12',
    borderWidth: 1,
    borderColor: theme.primary + '25',
  },
  emulatorMapBannerText: { flex: 1, fontSize: 11, fontWeight: '600' as const, color: theme.textSecondary },
  // ========== GRADIENT HERO HEADER ==========
  heroSection: {
    zIndex: 8,
    backgroundColor: '#0F172A',
    ...Platform.select({ android: { elevation: 8 }, default: {} }),
  },
  heroAdBanner: {
    paddingHorizontal: 12,
    paddingBottom: 6,
    backgroundColor: '#0F172A',
  },
  heroGradient: { paddingTop: 8, paddingBottom: 12, paddingHorizontal: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, overflow: 'hidden' as const, position: 'relative' as const },
  heroDecoCircle1: { position: 'absolute' as const, top: -40, right: -30, width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.04)' },
  heroDecoCircle2: { position: 'absolute' as const, bottom: -20, left: -20, width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(255,255,255,0.03)' },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#FFF', letterSpacing: -0.3 },
  heroSubtitle: { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 2, fontWeight: '500' },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroActionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  heroActionBtnActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  heroStatsSummary: { flexDirection: 'row' as const, alignItems: 'center' as const, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  heroStatItem: { flex: 1, alignItems: 'center' as const },
  heroStatValue: { fontSize: 13, fontWeight: '800' as const, color: 'rgba(255,255,255,0.5)' },
  heroStatLabel: { fontSize: 7, fontWeight: '700' as const, color: 'rgba(255,255,255,0.3)', marginTop: 1, textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  heroStatDivider: { width: 1, height: 18, backgroundColor: 'rgba(255,255,255,0.08)' },

  bottomPanel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: Platform.select({ ios: 4, default: 4 }),
    shadowColor: '#0F172A', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 16,
    borderTopWidth: 1, borderTopColor: '#E8EDF2',
    zIndex: 8,
    ...Platform.select({ android: { elevation: 8 }, default: {} }),
  },

  // Player sub-filters
  subFiltersContainer: { paddingTop: 2, paddingBottom: 2, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  subFiltersRow: { paddingHorizontal: 10, paddingVertical: 3, gap: 4, alignItems: 'center' as const },
  subFilterLabel: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, marginRight: 4 },
  subFilterLabelText: { fontSize: 9, fontWeight: '700' as const, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
  subChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F8FAFC', borderWidth: 1.5, borderColor: '#E2E8F0' },
  subChipText: { fontSize: 11, fontWeight: '600' as const },
  subFilterActiveBar: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingHorizontal: 16, paddingVertical: 5 },
  subFilterActiveText: { fontSize: 11, fontWeight: '600' as const, color: theme.textSecondary },
  subFilterClearBtn: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: theme.primary + '10' },
  subFilterClearText: { fontSize: 11, fontWeight: '600' as const, color: theme.primary },

  searchRowOuter: {
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2,  position: 'relative',  zIndex: 50,             // ← add this
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9',
    borderRadius: 12, paddingHorizontal: 12, height: 38, gap: 8, borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchInput: { flex: 1, fontSize: 14, color: theme.textPrimary },
  searchCount: { fontSize: 11, color: theme.textSecondary, marginTop: 6, textAlign: 'center' },
  suggestionsContainer: { backgroundColor: '#FFF', borderRadius: 12, marginTop: 6, borderWidth: 1, borderColor: '#E2E8F0', maxHeight: 220, overflow: 'hidden' as const,
    position: 'absolute',
    bottom: '100%',         // ← anchors above search bar
    left: 0,
    right: 0,
    zIndex: 100,
   },
  suggestionItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  suggestionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  suggestionLabel: { fontSize: 13, fontWeight: '600' as const, color: theme.textPrimary },
  suggestionMeta: { fontSize: 11, color: theme.textSecondary, marginTop: 1 },
  suggestionChipsRow: { flexDirection: 'row' as const, gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  suggestionChip: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  suggestionChipText: { fontSize: 11, fontWeight: '600' as const, color: theme.textSecondary },
  filters: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4, gap: 5 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18, backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#E2E8F0' },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { fontSize: 11, fontWeight: '600', color: theme.textSecondary },
  chipTextActive: { color: '#FFF' },

  panelLeaderboardCard: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, marginHorizontal: 12, marginTop: 6, marginBottom: 4, backgroundColor: '#F8FAFC', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#E8EDF2' },
  panelLeaderboardIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: theme.primary, alignItems: 'center' as const, justifyContent: 'center' as const },
  panelLeaderboardTitle: { fontSize: 13, fontWeight: '700' as const, color: theme.textPrimary },
  panelLeaderboardSub: { fontSize: 10, color: theme.textMuted, marginTop: 1 },

  // Single markers (avoid theme.shadows.card elevation on Android — same bitmap clipping as clusters)
  marker: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFF', ...MAP_MARKER_SHADOW },
  markerPublic: { borderColor: theme.success, borderWidth: 3 },
  markerWrapper: { alignItems: 'center', justifyContent: 'center' },
  accessBadge: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF', ...MAP_MARKER_SHADOW },
  accessBadgePublic: { backgroundColor: theme.success },
  accessBadgePrivate: { backgroundColor: '#F59E0B' },
  verifiedBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF', ...MAP_MARKER_SHADOW },
  fallbackBadge: { width: 14, height: 14, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF', ...MAP_MARKER_SHADOW },
  sponsorBadge: { width: 16, height: 16, borderRadius: 8, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1.5, borderColor: '#FFF', ...MAP_MARKER_SHADOW },
  sponsorBadgeText: { fontSize: 8, fontWeight: '900' as const, color: '#FFF' },
  markerFallback: { opacity: 0.85, borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.6)' },
  activeNowPulseRing: { position: 'absolute' as const, width: 44, height: 44, borderRadius: 22, backgroundColor: 'transparent', borderWidth: 2.5, borderColor: '#22C55E' } as any,
  // Cluster markers
  clusterOuter: {
    position: 'absolute' as const,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  clusterInner: {
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: '#FFF',
    ...theme.shadows.cardElevated,
  },
  clusterCount: {
    fontWeight: '800', color: '#FFF',
  },
  clusterPillRow: {
    flexDirection: 'row' as const, gap: 3, marginTop: 1,
  },
  clusterPill: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 1,
    backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 6,
    paddingHorizontal: 3, paddingVertical: 1,
  },
  clusterPillText: {
    fontSize: 7, fontWeight: '800' as const, color: '#FFF',
  },
  clusterDots: {
    position: 'absolute' as const,
    flexDirection: 'row', gap: 3,
  },
  clusterDot: {
    width: 7, height: 7, borderRadius: 3.5, borderWidth: 1.5, borderColor: '#FFF',
  },
  burstOverlay: {
    position: 'absolute' as const,
    top: '50%' as any,
    left: '50%' as any,
    marginTop: -30,
    marginLeft: -30,
    width: 60,
    height: 60,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    zIndex: 50,
  },
  burstRing: {
    position: 'absolute' as const,
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    backgroundColor: 'transparent',
  },
  // Selected card
  selectedCardDocked: {
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.lg,
    ...theme.shadows.cardElevated,
    zIndex: 40,
    ...Platform.select({ android: { elevation: 40 }, default: {} }),
  },
  selectedCard: {
    position: 'absolute', left: 16, right: 16,
    backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, ...theme.shadows.cardElevated,
  },
  selectedInner: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  selectedIcon: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  selectedContent: { flex: 1 },
  selectedTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  selectedTitle: { fontSize: 15, fontWeight: '600', color: theme.textPrimary, flex: 1 },
  selectedMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  selectedMetaText: { fontSize: 12, color: theme.textSecondary },
  selectedTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, backgroundColor: theme.backgroundSecondary, borderRadius: 4 },
  tagText: { fontSize: 10, fontWeight: '600', color: theme.textSecondary },
  selectedArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' },
  importBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' },
  selectedClose: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  publicBadgeSelected: {
    flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: theme.success + '15',
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: theme.borderRadius.full,
  },
  publicBadgeSelectedText: { fontSize: 9, fontWeight: '600', color: theme.success },
  premiumBadgeMap: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#A8B4C0' + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#A8B4C0' + '40' },
  // List fallback
  listContainer: { flex: 1, paddingBottom: 200 },
  listHeader: { alignItems: 'center', paddingHorizontal: 24, marginBottom: 16 },
  listTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary, marginTop: 8 },
  listSubtitle: { fontSize: 13, color: theme.textSecondary },
  listScroll: { paddingHorizontal: 16, gap: 8 },
  listItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, padding: 12, borderRadius: theme.borderRadius.md, ...theme.shadows.card },
  listIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  listContent: { flex: 1 },
  listNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listName: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, marginBottom: 2, flex: 1 },
  listMeta: { fontSize: 12, color: theme.textSecondary },
  listBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  listBadgeText: { fontSize: 10, fontWeight: '600' },
  publicBadgeSmall: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: theme.success + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  importBtnSmall: { padding: 4 },
  premiumBadgeListMap: { width: 14, height: 14, borderRadius: 7, backgroundColor: '#A8B4C0' + '20', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#A8B4C0' + '40' },
  selectedInviteBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary + '10', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.primary + '25' },
  selectedMeetupBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.success + '10', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: theme.success + '25' },
  // Meetup Picker (Map)
  meetupOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 24 },
  meetupPickerContent: { backgroundColor: theme.surface, borderRadius: 24, padding: 24 },
  meetupPickerHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  meetupPickerTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  meetupPickerSubtitle: { fontSize: 13, color: theme.primary, fontWeight: '600', marginTop: 2 },
  meetupPickerClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.backgroundSecondary, alignItems: 'center', justifyContent: 'center' },
  meetupPickerDesc: { fontSize: 13, color: theme.textSecondary, marginBottom: 16 },
  meetupPickerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: theme.backgroundSecondary, borderRadius: 14, padding: 14, marginBottom: 10 },
  meetupPickerItemDate: { width: 46, height: 46, borderRadius: 12, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' },
  meetupPickerItemDay: { fontSize: 18, fontWeight: '900', color: theme.primary, lineHeight: 20 },
  meetupPickerItemMonth: { fontSize: 9, fontWeight: '700', color: theme.primary, letterSpacing: 0.5 },
  meetupPickerItemTitle: { fontSize: 14, fontWeight: '600', color: theme.textPrimary, marginBottom: 2 },
  meetupPickerItemTime: { fontSize: 12, color: theme.textMuted },
  meetupPickerItemArrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.primary + '15', alignItems: 'center', justifyContent: 'center' },
  meetupPickerEmptyText: { fontSize: 15, fontWeight: '600', color: theme.textPrimary, marginTop: 12 },
  meetupPickerEmptyDesc: { fontSize: 13, color: theme.textSecondary, textAlign: 'center', marginTop: 4, marginBottom: 16, paddingHorizontal: 16 },
  meetupPickerCreateBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  meetupPickerCreateBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  // Manage Modal
  modalContainer: { flex: 1, backgroundColor: theme.backgroundSecondary },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, backgroundColor: theme.surface,
    borderBottomWidth: 1, borderBottomColor: theme.border,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  modalClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  modalContent: { padding: 16 },
  manageInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: theme.primary + '06',
    padding: 16, borderRadius: 16, marginBottom: 20,
    borderWidth: 1.5, borderColor: theme.primary + '15',
  },
  manageInfoText: { flex: 1, fontSize: 13, color: theme.textSecondary, lineHeight: 19 },
  manageSection: { marginBottom: 24 },
  manageSectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.border },
  manageSectionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  manageSectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.textPrimary },
  manageSectionCount: { fontSize: 13, fontWeight: '700', color: theme.textMuted, backgroundColor: theme.backgroundSecondary, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  manageItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.surface, padding: 16, borderRadius: 14,
    marginBottom: 10, ...theme.shadows.card, borderWidth: 1, borderColor: theme.border,
  },
  manageItemName: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.textPrimary, marginRight: 12 },
  manageItemRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  publicBadgeManage: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.success + '12',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: theme.success + '25',
  },
  publicBadgeManageText: { fontSize: 11, fontWeight: '700', color: theme.success },
  privateBadgeManage: {
    flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: theme.backgroundSecondary,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1, borderColor: theme.border,
  },
  privateBadgeManageText: { fontSize: 11, fontWeight: '600', color: theme.textMuted },
  manageEmpty: { alignItems: 'center', paddingVertical: 48 },
  manageEmptyText: { fontSize: 17, fontWeight: '700', color: theme.textPrimary, marginTop: 16 },
  manageEmptyDesc: { fontSize: 14, color: theme.textSecondary, textAlign: 'center', marginTop: 8, maxWidth: 300, lineHeight: 20 },

  // Floating ad banner - repositioned to top area to not block filters
  floatingAdBanner: {
    position: 'absolute' as const, left: 12, right: 12,
    opacity: 0.92, zIndex: 15,
  },
  // No-Geo Banner
  noGeoBannerDocked: {
    marginHorizontal: 12,
    marginBottom: 6,
    zIndex: 25,
    ...Platform.select({ android: { elevation: 25 }, default: {} }),
  },
  noGeoBanner: {
    position: 'absolute', left: 12, right: 12,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: theme.borderRadius.md, padding: 12,
    ...theme.shadows.cardElevated, borderLeftWidth: 3, borderLeftColor: theme.warning,
  },
  noGeoBannerIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: theme.warning + '15',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  noGeoBannerContent: { flex: 1 },
  noGeoBannerTitle: { fontSize: 13, fontWeight: '700', color: theme.textPrimary },
  noGeoBannerDesc: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  noGeoBannerBtn: {
    backgroundColor: theme.warning, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: theme.borderRadius.sm, marginLeft: 8,
  },
  noGeoBannerBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  noGeoBannerClose: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20,
    borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  // No-Geo Modal items
  noGeoItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface,
    borderRadius: theme.borderRadius.md, padding: 14, marginBottom: 8, gap: 12,
    ...theme.shadows.card,
  },
  noGeoItemIcon: {
    width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  noGeoItemInfo: { flex: 1 },
  noGeoItemName: { fontSize: 15, fontWeight: '600', color: theme.textPrimary },
  noGeoItemType: { fontSize: 12, color: theme.textSecondary, marginTop: 2 },
  noGeoItemBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.primary + '15', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: theme.borderRadius.sm,
  },
  noGeoItemBtnText: { fontSize: 12, fontWeight: '600', color: theme.primary },
  noGeoItemBatch: { marginBottom: 4 },
  batchLocationPicker: {
    paddingHorizontal: 12, paddingBottom: 12,
    backgroundColor: theme.surface, borderBottomLeftRadius: theme.borderRadius.md, borderBottomRightRadius: theme.borderRadius.md,
    marginTop: -8, marginBottom: 4,
  },
  batchToggleRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
  },
  batchToggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: theme.borderRadius.md, backgroundColor: theme.backgroundSecondary,
  },
  batchToggleBtnActive: { backgroundColor: theme.primary },
  batchToggleText: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
  batchToggleBtnText: { fontSize: 12, fontWeight: '700' },
  batchToggleTextActive: { color: '#FFF' },
  // Partner popup
  partnerPopupDocked: {
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: 16,
    ...theme.shadows.cardElevated,
    borderWidth: 1,
    borderColor: '#E8EDF2',
    zIndex: 40,
    ...Platform.select({ android: { elevation: 40 }, default: {} }),
  },
  partnerPopup: {
    position: 'absolute' as const, left: 16, right: 16,
    backgroundColor: theme.surface, borderRadius: 20,
    padding: 16, ...theme.shadows.cardElevated,
    borderWidth: 1, borderColor: '#E8EDF2',
  },
  partnerPopupClose: {
    position: 'absolute' as const, top: 8, right: 8, width: 28, height: 28, borderRadius: 14,
    backgroundColor: theme.backgroundSecondary, alignItems: 'center' as const, justifyContent: 'center' as const, zIndex: 10,
  },
  partnerPopupHeader: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 12, marginBottom: 10,
  },
  partnerPopupAvatar: {
    width: 52, height: 52, borderRadius: 16, borderWidth: 2.5, overflow: 'hidden' as const,
  },
  partnerPopupAvatarFallback: {
    width: 52, height: 52, borderRadius: 16, borderWidth: 2.5,
    alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  partnerPopupName: {
    fontSize: 17, fontWeight: '700' as const, color: theme.textPrimary, marginBottom: 4,
  },
  partnerPopupBadge: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4,
    alignSelf: 'flex-start' as const, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  partnerPopupBadgeText: {
    fontSize: 8, fontWeight: '900' as const, color: '#FFF', letterSpacing: 0.5,
  },
  partnerPopupBio: {
    fontSize: 13, color: theme.textSecondary, lineHeight: 19, marginBottom: 10,
  },
  partnerPopupSocials: {
    flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6, marginBottom: 12,
  },
  partnerPopupSocialChip: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1,
  },
  partnerPopupSocialText: {
    fontSize: 11, fontWeight: '600' as const,
  },
  partnerPopupActions: {
    flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8,
  },
  partnerPopupVisitBtn: {
    flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8,
    paddingVertical: 11, borderRadius: 12, borderWidth: 1.5, backgroundColor: '#FFF',
  },
  partnerPopupVisitText: {
    fontSize: 13, fontWeight: '700' as const,
  },
  partnerPopupProfileBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: theme.primary + '12', alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 1, borderColor: theme.primary + '20',
  },
  // Heatmap
  heatmapToggle: {
    position: 'absolute' as const, right: 16, width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.95)', alignItems: 'center' as const, justifyContent: 'center' as const,
    borderWidth: 1, borderColor: '#E2E8F0', zIndex: 25,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4 }, android: { elevation: 3 }, default: {} }),
  },
  heatmapToggleActive: {
    backgroundColor: theme.primary, borderColor: theme.primary,
  },
  heatmapLegend: {
    position: 'absolute' as const, left: 16, backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 14, padding: 12, zIndex: 25, minWidth: 140,
    borderWidth: 1, borderColor: '#E2E8F0',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 6 }, android: { elevation: 3 }, default: {} }),
  },
  heatmapLegendHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 4 },
  heatmapLegendTitle: { fontSize: 12, fontWeight: '700' as const, color: theme.textPrimary },
  heatmapLegendCount: { fontSize: 10, fontWeight: '600' as const, color: theme.textSecondary, marginBottom: 8 },
  heatmapLegendScale: { gap: 4 },
  heatmapLegendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
  heatmapLegendDot: { width: 12, height: 12, borderRadius: 6 },
  heatmapLegendLabel: { fontSize: 10, fontWeight: '600' as const, color: theme.textSecondary },
  heatmapDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 },
  heatmapPeriodLabel: { fontSize: 9, fontWeight: '700' as const, color: theme.textMuted, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 5 },
  heatmapPeriodRow: { flexDirection: 'row' as const, gap: 4 },
  heatmapPeriodChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  heatmapPeriodChipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  heatmapPeriodChipText: { fontSize: 10, fontWeight: '700' as const, color: theme.textSecondary },
  heatmapPeriodChipTextActive: { color: '#FFF' },
  heatmapAnimRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginTop: 8 },
  heatmapAnimBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: theme.primary + '15', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1.5, borderColor: theme.primary + '30' },
  heatmapAnimBtnActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  heatmapAnimInfo: { flex: 1, gap: 3 },
  heatmapAnimDots: { flexDirection: 'row' as const, gap: 4 },
  heatmapAnimDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#E2E8F0' },
  heatmapAnimDotActive: { backgroundColor: theme.primary, transform: [{ scale: 1.2 }] },
  heatmapAnimLabel: { fontSize: 9, fontWeight: '600' as const, color: theme.textMuted },
  heatmapAnimHint: { fontSize: 10, fontWeight: '600' as const, color: theme.textMuted },
  heatmapAnimDotFilled: { backgroundColor: theme.primary + '50' },
  heatmapCumulativeToggle: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 5, alignSelf: 'flex-start' as const, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  heatmapCumulativeToggleActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  heatmapCumulativeText: { fontSize: 10, fontWeight: '700' as const, color: theme.textSecondary },
  heatmapCumulativeTextActive: { color: '#FFF' },
  // Cluster expansion list
  clusterListOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' as const },
  clusterListContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, paddingBottom: Platform.select({ ios: 34, default: 16 }), paddingHorizontal: 16 },
  clusterListHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  clusterListTitle: { fontSize: 17, fontWeight: '700' as const, color: theme.textPrimary },
  clusterListSub: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  clusterListZoomBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: theme.primary + '12', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: theme.primary + '20' },
  clusterListCloseBtn: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' as const, justifyContent: 'center' as const },
  clusterListItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F1F5F9' },
  clusterListItemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const },
  clusterListItemName: { fontSize: 14, fontWeight: '600' as const, color: theme.textPrimary },
  clusterListItemMeta: { fontSize: 11, color: theme.textSecondary, marginTop: 1 },
  clusterListItemType: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  clusterListItemTypeText: { fontSize: 9, fontWeight: '700' as const },
  clusterListImportBtn: { padding: 4 },
  keyboardAvoid: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 30,
  },
});
