/**
 * Admin Quick Navigation Bar
 * 
 * Grouped horizontal navigation with category headers.
 * Highlights the currently active section with underline indicator.
 * Includes a prominent Dashboard home button.
 * Auto-scrolls to the active page on mount.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, LayoutChangeEvent } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import * as Haptics from '@/services/haptics';
import { getSupabaseClient } from '@/template';

interface NavSection {
  route: string;
  icon: string;
  label: string;
  color: string;
  group: string;
}

const ADMIN_SECTIONS: NavSection[] = [
  { route: '/admin-moderation', icon: 'gavel', label: 'Moderation', color: '#DC2626', group: 'moderation' },
  { route: '/admin-anticheat', icon: 'security', label: 'Anti-cheat', color: '#EF4444', group: 'moderation' },
  { route: '/admin-users', icon: 'people', label: 'Users', color: '#3B82F6', group: 'data' },
  { route: '/admin-clubs', icon: 'home', label: 'Clubs', color: '#7C3AED', group: 'data' },
  { route: '/admin-terrains', icon: 'sports-soccer', label: 'Terrains', color: '#10B981', group: 'data' },
  { route: '/admin-partners', icon: 'handshake', label: 'Partenaires', color: '#D4A017', group: 'marketing' },
  { route: '/admin-sponsors', icon: 'stars', label: 'Ambassadeurs', color: '#7C3AED', group: 'marketing' },
  { route: '/admin-promos', icon: 'confirmation-number', label: 'Promos', color: '#0EA5E9', group: 'marketing' },
  { route: '/admin-announcements', icon: 'campaign', label: 'Annonces', color: '#7C3AED', group: 'marketing' },
  { route: '/admin-maintenance', icon: 'construction', label: 'Maint.', color: '#D97706', group: 'system' },
  { route: '/admin-reports', icon: 'assessment', label: 'Rapports', color: '#0EA5E9', group: 'system' },
  { route: '/admin-activity-log', icon: 'history', label: 'Journal', color: '#64748B', group: 'system' },
  { route: '/admin-notifications', icon: 'notifications', label: 'Alertes', color: '#DC2626', group: 'system' },
  { route: '/admin-changelog', icon: 'update', label: 'Changelog', color: '#0EA5E9', group: 'system' },
];

const GROUP_SEPARATORS: Record<string, string> = {
  moderation: '',
  data: '•',
  marketing: '•',
  system: '•',
};

interface AdminQuickNavProps {
  currentRoute?: string;
}

// Badge counts type
interface BadgeCounts {
  moderation: number;
  clubs: number;
  notifications: number;
}

export default function AdminQuickNav({ currentRoute }: AdminQuickNavProps) {
  const pathname = usePathname();
  const active = currentRoute || pathname;
  const scrollRef = useRef<ScrollView>(null);
  const itemPositions = useRef<Map<string, number>>(new Map());
  const isDashboard = active === '/admin-dashboard';
  const [badges, setBadges] = useState<BadgeCounts>({ moderation: 0, clubs: 0, notifications: 0 });

  // Fetch live badge counts
  useEffect(() => {
    let mounted = true;
    const fetchCounts = async () => {
      try {
        const supabase = getSupabaseClient();
        const [reportsRes, clubsRes, appealsRes] = await Promise.all([
          supabase.from('player_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
          supabase.from('clubs').select('id', { count: 'exact', head: true }).eq('is_verified', false),
          supabase.from('ban_appeals').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        ]);
        if (mounted) {
          setBadges({
            moderation: reportsRes.count || 0,
            clubs: clubsRes.count || 0,
            notifications: appealsRes.count || 0,
          });
        }
      } catch { /* silent */ }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  // Map routes to badge keys
  const routeBadgeMap: Record<string, keyof BadgeCounts> = {
    '/admin-moderation': 'moderation',
    '/admin-clubs': 'clubs',
    '/admin-notifications': 'notifications',
  };

  // Track item positions for accurate auto-scroll
  const handleItemLayout = useCallback((route: string, event: LayoutChangeEvent) => {
    itemPositions.current.set(route, event.nativeEvent.layout.x);
  }, []);

  // Auto-scroll to active item with accurate position
  useEffect(() => {
    const timer = setTimeout(() => {
      const pos = itemPositions.current.get(active);
      if (pos !== undefined && scrollRef.current) {
        // Center the active item: scroll so it's roughly in the middle
        scrollRef.current.scrollTo({ x: Math.max(0, pos - 100), animated: true });
      } else {
        // Fallback: estimate position
        const idx = ADMIN_SECTIONS.findIndex(s => active === s.route || active.includes(s.route.replace('/admin-', '')));
        if (idx > 2 && scrollRef.current) {
          scrollRef.current.scrollTo({ x: Math.max(0, idx * 95 - 100), animated: true });
        }
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [active]);

  let lastGroup = '';

  return (
    <View style={s.container}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        {/* Dashboard Home Button — always visible */}
        <Pressable
          style={[s.homeBtn, isDashboard && s.homeBtnActive]}
          onPress={() => {
            if (!isDashboard) {
              Haptics.selectionAsync();
              router.push('/admin-dashboard' as any);
            }
          }}
        >
          <MaterialIcons name="dashboard" size={18} color={isDashboard ? '#FFF' : '#0F172A'} />
          {(() => {
            const total = badges.moderation + badges.clubs + badges.notifications;
            if (total <= 0) return null;
            return (
              <View style={s.homeBadge}>
                <Text style={s.homeBadgeText}>{total > 99 ? '99' : total}</Text>
              </View>
            );
          })()}
        </Pressable>

        <View style={s.homeSeparator} />

        {/* Section items */}
        {ADMIN_SECTIONS.map((section) => {
          const isActive = active === section.route || active.includes(section.route.replace('/admin-', ''));
          const showSep = section.group !== lastGroup && lastGroup !== '';
          lastGroup = section.group;

          return (
            <React.Fragment key={section.route}>
              {showSep ? (
                <View style={s.separator}>
                  <View style={s.separatorDot} />
                </View>
              ) : null}
              <Pressable
                style={[s.navItem, isActive && s.navItemActive]}
                onPress={() => {
                  if (!isActive) {
                    Haptics.selectionAsync();
                    router.push(section.route as any);
                  }
                }}
                onLayout={(e) => handleItemLayout(section.route, e)}
              >
                <View style={{ position: 'relative' }}>
                  <MaterialIcons
                    name={section.icon as any}
                    size={16}
                    color={isActive ? section.color : '#94A3B8'}
                  />
                  {/* Badge counter */}
                  {(() => {
                    const badgeKey = routeBadgeMap[section.route];
                    const count = badgeKey ? badges[badgeKey] : 0;
                    if (count <= 0) return null;
                    return (
                      <View style={s.badgeContainer}>
                        <Text style={s.badgeText}>{count > 99 ? '99' : count}</Text>
                      </View>
                    );
                  })()}
                </View>
                <Text
                  style={[s.navText, isActive && { color: section.color, fontWeight: '700' }]}
                  numberOfLines={1}
                >
                  {section.label}
                </Text>
                {/* Active underline indicator */}
                {isActive ? <View style={[s.activeIndicator, { backgroundColor: section.color }]} /> : null}
              </Pressable>
            </React.Fragment>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingTop: 8,
    paddingBottom: 4,
  },
  scrollContent: {
    paddingHorizontal: 12,
    gap: 5,
    alignItems: 'center',
  },
  homeBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  homeBtnActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  homeBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  homeBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFF',
  },
  homeSeparator: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 10,
    borderRadius: 10,
    position: 'relative',
  },
  navItemActive: {
    backgroundColor: '#F8FAFC',
  },
  navText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 8,
    right: 8,
    height: 3,
    borderRadius: 1.5,
  },
  separator: {
    width: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separatorDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#CBD5E1',
  },
  badgeContainer: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#FFF',
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFF',
  },
});
