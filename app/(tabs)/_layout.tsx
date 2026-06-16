import { MaterialIcons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Platform } from 'react-native';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();

  const tabBarHeight = Platform.select({
    ios: insets.bottom + 60,
    android: insets.bottom + 60,
    default: 70,
  });

  const tabBarStyle = {
    height: tabBarHeight,
    paddingTop: 8,
    paddingBottom: Platform.select({
      ios: insets.bottom + 8,
      android: insets.bottom + 8,
      default: 8,
    }),
    paddingHorizontal: 8,
    backgroundColor: theme.background,
    borderTopWidth: 1,
    borderTopColor: theme.border,
    ...Platform.select({
      android: { elevation: 32, zIndex: 32 },
      default: {},
    }),
  };

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs', 'home'),
          tabBarTestID: 'tab-home',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t('tabs', 'stats'),
          tabBarTestID: 'tab-stats',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="bar-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="directory"
        options={{
          title: t('tabs', 'directory'),
          tabBarTestID: 'tab-directory',
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('tabs', 'map'),
          tabBarTestID: 'tab-map',
          lazy: true,
          unmountOnBlur: true,
          tabBarIcon: ({ color, size }) => (
            <MaterialIcons name="map" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
