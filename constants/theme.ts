// PetanqueScore Theme - Sport Tracking Design System

export const theme = {
  // Primary Colors - Trustworthy Blue
  primary: '#2563EB',
  primaryLight: '#60A5FA',
  primaryDark: '#1D4ED8',
  
  // Accent Colors - Energetic Orange
  accent: '#F59E0B',
  accentLight: '#FCD34D',
  accentDark: '#D97706',
  
  // Backgrounds
  background: '#FFFFFF',
  backgroundSecondary: '#F8FAFC',
  surface: '#FFFFFF',
  
  // Text
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  
  // Borders
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  
  // Status
  success: '#10B981',
  successLight: '#D1FAE5',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  
  // Game specific
  pointColor: '#10B981',
  tirColor: '#3B82F6',
  carreauColor: '#F59E0B',
  
  // Spacing
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },
  
  // Border Radius
  borderRadius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
  },
  
  // Typography
  typography: {
    heroValue: {
      fontSize: 48,
      fontWeight: '700' as const,
    },
    heroLabel: {
      fontSize: 11,
      fontWeight: '600' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 1,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600' as const,
    },
    cardValue: {
      fontSize: 24,
      fontWeight: '700' as const,
    },
    sectionHeader: {
      fontSize: 14,
      fontWeight: '600' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.5,
    },
    body: {
      fontSize: 15,
      fontWeight: '400' as const,
    },
    caption: {
      fontSize: 13,
      fontWeight: '400' as const,
    },
    small: {
      fontSize: 11,
      fontWeight: '500' as const,
    },
  },
  
  // Shadows
  shadows: {
    card: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 4,
      elevation: 2,
    },
    cardElevated: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 4,
    },
  },
};

// Blurhash placeholders for expo-image
export const blurhash = {
  avatar: 'L6Pj0^jE.mfQ_3j[t7j[?bWB%gof',
  terrain: 'L5H2EC=PM+yV0g-mq.wG9c010J}I',
  banner: 'L4SPbN~q00xu_3WCRjWB00ay?bWB',
  default: 'L6PZfSi_.AyE_3j[t7j[?bWBxvof',
};

export default theme;
