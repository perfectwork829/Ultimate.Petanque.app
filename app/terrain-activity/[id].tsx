/**
 * Terrain Activity History
 * 
 * Monthly calendar view showing activity intensity per day (matches, meetups, tournaments, challenges).
 * Tapping a day shows detail for that day.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { useLanguage } from '@/hooks/useLanguage';
import { useAppData } from '@/contexts/AppContext';
import { getSupabaseClient } from '@/template';

interface DayActivity {
  date: string; // YYYY-MM-DD
  matches: { id: string; date: string; teamANames: string[]; teamBNames: string[]; scoreA: number; scoreB: number; winner: string }[];
  meetups: { id: string; title: string; date: string; status: string }[];
  tournaments: { id: string; name: string; date: string; status: string }[];
  challenges: { id: string; type: string; date: string; mode?: string; totalShots?: number; totalPoints?: number; maxPoints?: number }[];
  total: number;
}

const MONTH_NAMES_FR = ['Janvier', 'Fevrier', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Aout', 'Septembre', 'Octobre', 'Novembre', 'Decembre'];
const MONTH_NAMES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES_FR = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const DAY_NAMES_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getIntensityColor(count: number, maxCount: number): string {
  if (count === 0) return 'transparent';
  const ratio = count / Math.max(maxCount, 1);
  if (ratio >= 0.75) return '#DC2626';
  if (ratio >= 0.5) return '#F59E0B';
  if (ratio >= 0.25) return '#3B82F6';
  return '#93C5FD';
}

function getIntensityBg(count: number, maxCount: number): string {
  if (count === 0) return theme.backgroundSecondary;
  const ratio = count / Math.max(maxCount, 1);
  if (ratio >= 0.75) return '#FEE2E2';
  if (ratio >= 0.5) return '#FEF3C7';
  if (ratio >= 0.25) return '#DBEAFE';
  return '#EFF6FF';
}

function toDateKey(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const direct = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (direct) return direct[1];
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameViewedMonth(dateKey: string | null, year: number, month: number): boolean {
  if (!dateKey) return false;
  const [y, m] = dateKey.split('-').map(Number);
  return y === year && m === month + 1;
}

function getChallengeLabel(type?: string, fr = false): string {
  switch (type) {
    case '10_tirs':
      return fr ? '10 tirs' : '10 shots';
    case '10_tirs_sautee':
      return fr ? '10 tirs sautés' : '10 jump shots';
    case 'precision':
      return fr ? 'Précision' : 'Precision';
    default:
      return fr ? 'Défi' : 'Challenge';
  }
}

export default function TerrainActivityScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { language } = useLanguage();
  const fr = language === 'fr';
  const { matches: allMatches, tournaments: allTournaments, challenges: allChallenges, terrains } = useAppData();

  const terrain = terrains.find(t => t.id === id);
  const [loading, setLoading] = useState(true);
  const [monthOffset, setMonthOffset] = useState(0); // 0 = current month, -1 = prev, etc.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [meetupsData, setMeetupsData] = useState<{ terrain_id: string; date: string; title: string; status: string; id: string }[]>([]);

  const now = new Date();
  const viewYear = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getFullYear();
  const viewMonth = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1).getMonth();

  const monthNames = fr ? MONTH_NAMES_FR : MONTH_NAMES_EN;
  const dayNames = fr ? DAY_NAMES_FR : DAY_NAMES_EN;

  // Load meetups from Supabase
  useEffect(() => {
    if (!id) return;
    const loadMeetups = async () => {
      try {
        const supabase = getSupabaseClient();
        const { data } = await supabase
          .from('terrain_meetups')
          .select('id, terrain_id, date, title, status')
          .eq('terrain_id', id);
        setMeetupsData(data || []);
      } catch { /* silent */ }
      setLoading(false);
    };
    loadMeetups();
  }, [id]);

  // Build day activity map for the viewed month
  const dayActivityMap = useMemo(() => {
    const map = new Map<string, DayActivity>();
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);

    // Initialize all days
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      map.set(dateStr, { date: dateStr, matches: [], meetups: [], tournaments: [], challenges: [], total: 0 });
    }

    // Matches
    allMatches.filter(m => m.terrainId === id).forEach(m => {
      const dateStr = toDateKey(m.date);
      if (isSameViewedMonth(dateStr, viewYear, viewMonth)) {
        const entry = map.get(dateStr!);
        if (entry) {
          entry.matches.push({
            id: m.id,
            date: m.date,
            teamANames: (m.teamA as any)?.playerNames || [],
            teamBNames: (m.teamB as any)?.playerNames || [],
            scoreA: (m.teamA as any)?.score ?? 0,
            scoreB: (m.teamB as any)?.score ?? 0,
            winner: m.winner,
          });
          entry.total++;
        }
      }
    });

    // Meetups
    meetupsData.forEach(mt => {
      const dateStr = toDateKey(mt.date);
      if (isSameViewedMonth(dateStr, viewYear, viewMonth)) {
        const entry = map.get(dateStr!);
        if (entry) {
          entry.meetups.push({ id: mt.id, title: mt.title, date: mt.date, status: mt.status });
          entry.total++;
        }
      }
    });

    // Tournaments
    allTournaments.filter(t => t.terrainId === id).forEach(t => {
      const dateStr = toDateKey(t.date);
      if (isSameViewedMonth(dateStr, viewYear, viewMonth)) {
        const entry = map.get(dateStr!);
        if (entry) {
          entry.tournaments.push({ id: t.id, name: t.name, date: t.date, status: t.status });
          entry.total++;
        }
      }
    });

    // Challenges — count as terrain activity too
    allChallenges.filter((c: any) => {
      const linkedTerrainId = c.terrainId || c.terrain_id || c.courtId || c.court_id;
      return linkedTerrainId === id;
    }).forEach((c: any) => {
      const dateStr = toDateKey(c.date);
      if (isSameViewedMonth(dateStr, viewYear, viewMonth)) {
        const entry = map.get(dateStr!);
        if (entry) {
          entry.challenges.push({
            id: c.id,
            type: c.type,
            date: c.date,
            mode: c.mode,
            totalShots: c.totalShots ?? c.total_shots,
            totalPoints: c.totalPoints ?? c.total_points,
            maxPoints: c.maxPoints ?? c.max_points,
          });
          entry.total++;
        }
      }
    });

    return map;
  }, [id, allMatches, allTournaments, allChallenges, meetupsData, viewYear, viewMonth]);

  const maxDayCount = useMemo(() => {
    let max = 1;
    dayActivityMap.forEach(v => { if (v.total > max) max = v.total; });
    return max;
  }, [dayActivityMap]);

  // Monthly stats
  const monthStats = useMemo(() => {
    let totalMatches = 0;
    let totalMeetups = 0;
    let totalTournaments = 0;
    let totalChallenges = 0;
    let activeDays = 0;
    dayActivityMap.forEach(v => {
      totalMatches += v.matches.length;
      totalMeetups += v.meetups.length;
      totalTournaments += v.tournaments.length;
      totalChallenges += v.challenges.length;
      if (v.total > 0) activeDays++;
    });
    return { totalMatches, totalMeetups, totalTournaments, totalChallenges, activeDays };
  }, [dayActivityMap]);

  // Calendar grid
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    // Monday = 0
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const cells: (string | null)[] = [];
    // Leading empty cells
    for (let i = 0; i < startDow; i++) cells.push(null);
    // Day cells
    for (let d = 1; d <= lastDay.getDate(); d++) {
      cells.push(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    // Trailing empty cells to fill last row
    while (cells.length % 7 !== 0) cells.push(null);

    // Split into weeks
    const weeks: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7));
    }
    return weeks;
  }, [viewYear, viewMonth]);

  const selectedDayData = selectedDay ? dayActivityMap.get(selectedDay) : null;
  const todayStr = now.toISOString().slice(0, 10);
  const isCurrentMonth = monthOffset === 0;
  const canGoForward = monthOffset < 0;

  return (
    <SafeAreaView edges={['top']} style={s.container}>
      <View style={s.header}>
        <Pressable style={s.backBtn} onPress={() => router.back()}>
          <MaterialIcons name="arrow-back" size={24} color={theme.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{fr ? 'Historique d\'activite' : 'Activity History'}</Text>
          {terrain ? <Text style={s.headerSub} numberOfLines={1}>{terrain.name}</Text> : null}
        </View>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          {/* Month Stats */}
          <View style={s.statsRow}>
            <View style={[s.statCard, { borderColor: '#3B82F620' }]}>
              <MaterialIcons name="sports" size={18} color="#3B82F6" />
              <Text style={[s.statValue, { color: '#3B82F6' }]}>{monthStats.totalMatches}</Text>
              <Text style={s.statLabel}>{fr ? 'Matchs' : 'Matches'}</Text>
            </View>
            <View style={[s.statCard, { borderColor: '#10B98120' }]}>
              <MaterialIcons name="event" size={18} color="#10B981" />
              <Text style={[s.statValue, { color: '#10B981' }]}>{monthStats.totalMeetups}</Text>
              <Text style={s.statLabel}>{fr ? 'RDV' : 'Meetups'}</Text>
            </View>
            <View style={[s.statCard, { borderColor: '#F59E0B20' }]}>
              <MaterialIcons name="emoji-events" size={18} color="#F59E0B" />
              <Text style={[s.statValue, { color: '#F59E0B' }]}>{monthStats.totalTournaments}</Text>
              <Text style={s.statLabel}>{fr ? 'Tournois' : 'Tournaments'}</Text>
            </View>
            <View style={[s.statCard, { borderColor: '#8B5CF620' }]}>
              <MaterialIcons name="track-changes" size={18} color="#8B5CF6" />
              <Text style={[s.statValue, { color: '#8B5CF6' }]}>{monthStats.totalChallenges}</Text>
              <Text style={s.statLabel}>{fr ? 'Défis' : 'Challenges'}</Text>
            </View>
            <View style={[s.statCard, { borderColor: '#7C3AED20' }]}>
              <MaterialIcons name="calendar-today" size={18} color="#7C3AED" />
              <Text style={[s.statValue, { color: '#7C3AED' }]}>{monthStats.activeDays}</Text>
              <Text style={s.statLabel}>{fr ? 'Jours actifs' : 'Active days'}</Text>
            </View>
          </View>

          {/* Month Navigator */}
          <View style={s.monthNav}>
            <Pressable style={s.monthNavBtn} onPress={() => { Haptics.selectionAsync(); setMonthOffset(o => o - 1); setSelectedDay(null); }}>
              <MaterialIcons name="chevron-left" size={24} color={theme.textPrimary} />
            </Pressable>
            <View style={s.monthNavCenter}>
              <Text style={s.monthNavTitle}>{monthNames[viewMonth]} {viewYear}</Text>
              {!isCurrentMonth ? (
                <Pressable style={s.monthNavToday} onPress={() => { setMonthOffset(0); setSelectedDay(null); }}>
                  <Text style={s.monthNavTodayText}>{fr ? 'Aujourd\'hui' : 'Today'}</Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable style={[s.monthNavBtn, !canGoForward && { opacity: 0.3 }]} onPress={() => { if (canGoForward) { Haptics.selectionAsync(); setMonthOffset(o => o + 1); setSelectedDay(null); } }} disabled={!canGoForward}>
              <MaterialIcons name="chevron-right" size={24} color={theme.textPrimary} />
            </Pressable>
          </View>

          {/* Calendar Grid */}
          <View style={s.calendarCard}>
            {/* Day headers */}
            <View style={s.calendarHeaderRow}>
              {dayNames.map((dn, i) => (
                <View key={i} style={s.calendarHeaderCell}>
                  <Text style={s.calendarHeaderText}>{dn}</Text>
                </View>
              ))}
            </View>
            {/* Week rows */}
            {calendarGrid.map((week, wi) => (
              <View key={wi} style={s.calendarWeekRow}>
                {week.map((dateStr, di) => {
                  if (!dateStr) {
                    return <View key={di} style={s.calendarCell} />;
                  }
                  const dayData = dayActivityMap.get(dateStr);
                  const count = dayData?.total || 0;
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDay;
                  const dayNum = parseInt(dateStr.split('-')[2], 10);
                  const bg = getIntensityBg(count, maxDayCount);
                  const dotColor = getIntensityColor(count, maxDayCount);

                  return (
                    <Pressable
                      key={di}
                      style={[
                        s.calendarCell,
                        { backgroundColor: bg },
                        isToday && s.calendarCellToday,
                        isSelected && s.calendarCellSelected,
                      ]}
                      onPress={() => { Haptics.selectionAsync(); setSelectedDay(dateStr === selectedDay ? null : dateStr); }}
                    >
                      <Text style={[
                        s.calendarCellText,
                        isToday && { color: theme.primary, fontWeight: '800' },
                        isSelected && { color: '#FFF' },
                      ]}>{dayNum}</Text>
                      {count > 0 ? (
                        <View style={s.calendarCellDots}>
                          {(dayData?.matches?.length || 0) > 0 ? <View style={[s.calendarDot, { backgroundColor: '#3B82F6' }]} /> : null}
                          {(dayData?.meetups?.length || 0) > 0 ? <View style={[s.calendarDot, { backgroundColor: '#10B981' }]} /> : null}
                          {(dayData?.tournaments?.length || 0) > 0 ? <View style={[s.calendarDot, { backgroundColor: '#F59E0B' }]} /> : null}
                          {(dayData?.challenges?.length || 0) > 0 ? <View style={[s.calendarDot, { backgroundColor: '#8B5CF6' }]} /> : null}
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Legend */}
          <View style={s.legendRow}>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#3B82F6' }]} /><Text style={s.legendText}>{fr ? 'Match' : 'Match'}</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#10B981' }]} /><Text style={s.legendText}>{fr ? 'RDV' : 'Meetup'}</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#F59E0B' }]} /><Text style={s.legendText}>{fr ? 'Tournoi' : 'Tournament'}</Text></View>
            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: '#8B5CF6' }]} /><Text style={s.legendText}>{fr ? 'Défi' : 'Challenge'}</Text></View>
          </View>

          {/* Selected Day Detail */}
          {selectedDay && selectedDayData ? (
            <View style={s.dayDetail}>
              <View style={s.dayDetailHeader}>
                <MaterialIcons name="event" size={18} color={theme.primary} />
                <Text style={s.dayDetailTitle}>
                  {new Date(selectedDay + 'T12:00:00').toLocaleDateString(fr ? 'fr-FR' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
                </Text>
              </View>

              {selectedDayData.total === 0 ? (
                <View style={s.dayDetailEmpty}>
                  <MaterialIcons name="event-busy" size={36} color={theme.textMuted} />
                  <Text style={s.dayDetailEmptyText}>{fr ? 'Aucune activite ce jour' : 'No activity this day'}</Text>
                </View>
              ) : (
                <>
                  {/* Matches */}
                  {selectedDayData.matches.map((m) => (
                    <Pressable key={m.id} style={s.dayItem} onPress={() => router.push(`/match-detail/${m.id}` as any)}>
                      <View style={[s.dayItemIcon, { backgroundColor: '#3B82F615' }]}>
                        <MaterialIcons name="sports" size={16} color="#3B82F6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.dayItemTitle} numberOfLines={1}>
                          {m.teamANames.join(', ') || (fr ? 'Equipe A' : 'Team A')} vs {m.teamBNames.join(', ') || (fr ? 'Equipe B' : 'Team B')}
                        </Text>
                        <Text style={s.dayItemSub}>{m.scoreA} - {m.scoreB}</Text>
                      </View>
                      <View style={[s.dayItemBadge, { backgroundColor: m.winner === 'A' ? '#22C55E15' : m.winner === 'B' ? '#EF444415' : '#94A3B815' }]}>
                        <Text style={[s.dayItemBadgeText, { color: m.winner === 'A' ? '#22C55E' : m.winner === 'B' ? '#EF4444' : '#94A3B8' }]}>
                          {m.winner === 'A' ? (fr ? 'V' : 'W') : m.winner === 'B' ? (fr ? 'D' : 'L') : '='}
                        </Text>
                      </View>
                    </Pressable>
                  ))}

                  {/* Meetups */}
                  {selectedDayData.meetups.map((mt) => (
                    <Pressable key={mt.id} style={s.dayItem} onPress={() => router.push(`/meetup/${mt.id}` as any)}>
                      <View style={[s.dayItemIcon, { backgroundColor: '#10B98115' }]}>
                        <MaterialIcons name="event" size={16} color="#10B981" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.dayItemTitle} numberOfLines={1}>{mt.title}</Text>
                        <Text style={s.dayItemSub}>
                          {new Date(mt.date).toLocaleTimeString(fr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                      <View style={[s.dayItemBadge, { backgroundColor: '#10B98115' }]}>
                        <Text style={[s.dayItemBadgeText, { color: '#10B981' }]}>{fr ? 'RDV' : 'Meet'}</Text>
                      </View>
                    </Pressable>
                  ))}

                  {/* Tournaments */}
                  {selectedDayData.tournaments.map((t) => (
                    <Pressable key={t.id} style={s.dayItem} onPress={() => router.push(`/tournament/${t.id}` as any)}>
                      <View style={[s.dayItemIcon, { backgroundColor: '#F59E0B15' }]}>
                        <MaterialIcons name="emoji-events" size={16} color="#F59E0B" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.dayItemTitle} numberOfLines={1}>{t.name}</Text>
                        <Text style={s.dayItemSub}>{t.status}</Text>
                      </View>
                      <View style={[s.dayItemBadge, { backgroundColor: '#F59E0B15' }]}>
                        <MaterialIcons name="emoji-events" size={12} color="#F59E0B" />
                      </View>
                    </Pressable>
                  ))}

                  {/* Challenges */}
                  {selectedDayData.challenges.map((c) => (
                    <Pressable key={c.id} style={s.dayItem} onPress={() => router.push(`/challenge/${c.id}` as any)}>
                      <View style={[s.dayItemIcon, { backgroundColor: '#8B5CF615' }]}>
                        <MaterialIcons name="track-changes" size={16} color="#8B5CF6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.dayItemTitle} numberOfLines={1}>{getChallengeLabel(c.type, fr)}</Text>
                        <Text style={s.dayItemSub}>
                          {new Date(c.date).toLocaleTimeString(fr ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                          {c.totalShots ? ` • ${c.totalShots} tirs` : ''}
                          {c.totalPoints != null && c.maxPoints ? ` • ${c.totalPoints}/${c.maxPoints} pts` : ''}
                        </Text>
                      </View>
                      <View style={[s.dayItemBadge, { backgroundColor: '#8B5CF615' }]}>
                        <Text style={[s.dayItemBadgeText, { color: '#8B5CF6' }]}>{fr ? 'Défi' : 'Challenge'}</Text>
                      </View>
                    </Pressable>
                  ))}
                </>
              )}
            </View>
          ) : !selectedDay ? (
            <View style={s.dayDetailHint}>
              <MaterialIcons name="touch-app" size={20} color={theme.textMuted} />
              <Text style={s.dayDetailHintText}>{fr ? 'Appuyez sur un jour pour voir le detail' : 'Tap a day to see details'}</Text>
            </View>
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.backgroundSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: theme.textPrimary },
  headerSub: { fontSize: 12, color: theme.textSecondary, marginTop: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },

  // Stats
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statCard: {
    flexGrow: 1,
    flexBasis: '18%',
    minWidth: 62,
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderRadius: 14,
    paddingVertical: 14,
    borderWidth: 1,
    gap: 4,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 }, android: { elevation: 1 }, default: {} }),
  },
  statValue: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 9, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },

  // Month Nav
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  monthNavBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.border,
  },
  monthNavCenter: { flex: 1, alignItems: 'center', gap: 4 },
  monthNavTitle: { fontSize: 18, fontWeight: '700', color: theme.textPrimary },
  monthNavToday: { paddingHorizontal: 12, paddingVertical: 4, backgroundColor: theme.primary + '12', borderRadius: 12 },
  monthNavTodayText: { fontSize: 11, fontWeight: '700', color: theme.primary },

  // Calendar
  calendarCard: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.border,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }),
  },
  calendarHeaderRow: { flexDirection: 'row', marginBottom: 6 },
  calendarHeaderCell: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  calendarHeaderText: { fontSize: 11, fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase' },
  calendarWeekRow: { flexDirection: 'row' },
  calendarCell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 2,
    borderRadius: 10,
  },
  calendarCellToday: {
    borderWidth: 2,
    borderColor: theme.primary,
  },
  calendarCellSelected: {
    backgroundColor: theme.primary,
    borderWidth: 0,
  },
  calendarCellText: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  calendarCellDots: { flexDirection: 'row', gap: 2, marginTop: 2 },
  calendarDot: { width: 4, height: 4, borderRadius: 2 },

  // Legend
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, marginBottom: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '600', color: theme.textSecondary },

  // Day Detail
  dayDetail: {
    backgroundColor: theme.surface,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  dayDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  dayDetailTitle: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, textTransform: 'capitalize' },
  dayDetailEmpty: { alignItems: 'center', paddingVertical: 24, gap: 8 },
  dayDetailEmptyText: { fontSize: 13, color: theme.textMuted },
  dayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  dayItemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  dayItemTitle: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  dayItemSub: { fontSize: 11, color: theme.textSecondary, marginTop: 2 },
  dayItemBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  dayItemBadgeText: { fontSize: 11, fontWeight: '700' },

  // Hint
  dayDetailHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
    backgroundColor: theme.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.border,
    marginBottom: 16,
  },
  dayDetailHintText: { fontSize: 13, color: theme.textMuted },
});
