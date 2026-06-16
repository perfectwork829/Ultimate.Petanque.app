/**
 * GamePreferencesSection — Extracted heavy radar chart + preferences from player/[id].tsx
 * Wrapped in React.memo to skip re-renders when unrelated state changes.
 */
import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import Svg, { Polygon, Line, Circle as SvgCircle, Text as SvgText, G } from 'react-native-svg';
import theme from '@/constants/theme';

// ============================================
// Mini Radar Chart
// ============================================
function MiniRadar({ data, labels, size }: {
  data: { label: string; value: number; color: string }[];
  labels: string[];
  size: number;
}) {
  if (data.length < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const R = (size - 50) / 2;
  const n = data.length;
  const angleStep = (2 * Math.PI) / n;
  const levels = [33, 66, 100];

  const getPoint = (angle: number, value: number) => ({
    x: cx + (value / 100) * R * Math.sin(angle),
    y: cy - (value / 100) * R * Math.cos(angle),
  });

  const pts = data.map((d, i) => getPoint(i * angleStep, d.value));
  const polygon = pts.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <Svg width={size} height={size}>
      {levels.map(level => {
        const lpts = Array.from({ length: n }, (_, i) => {
          const p = getPoint(i * angleStep, level);
          return `${p.x},${p.y}`;
        }).join(' ');
        return <Polygon key={level} points={lpts} fill="none" stroke={theme.border} strokeWidth={0.8} opacity={0.4} />;
      })}
      {data.map((_, i) => {
        const p = getPoint(i * angleStep, 100);
        return <Line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={theme.border} strokeWidth={0.6} opacity={0.4} />;
      })}
      <Polygon points={polygon} fill={theme.primary + '18'} stroke={theme.primary} strokeWidth={2} opacity={0.9} />
      {pts.map((p, i) => (
        <SvgCircle key={i} cx={p.x} cy={p.y} r={4} fill={data[i].color} stroke="#FFF" strokeWidth={2} />
      ))}
      {data.map((d, i) => {
        const p = getPoint(i * angleStep, 120);
        return (
          <G key={`l-${i}`}>
            <SvgText x={p.x} y={p.y + 4} fontSize="10" fill={theme.textSecondary} textAnchor="middle" fontWeight="600">
              {labels[i]}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

function getRoleColor(role: string): string {
  switch (role) {
    case 'Tireur': return '#F97316';
    case 'Pointeur': return '#3B82F6';
    case 'Milieu': return '#8B5CF6';
    default: return theme.textSecondary;
  }
}

function getRoleIcon(role: string): any {
  switch (role) {
    case 'Tireur': return 'gps-fixed';
    case 'Pointeur': return 'adjust';
    case 'Milieu': return 'swap-horiz';
    default: return 'person';
  }
}

interface GamePreferencesSectionProps {
  roleAnalysis: { roleCounts: Record<string, number>; totalWithRoles: number; preferredRole: string };
  terrainAnalysis: { terrainCounts: Record<string, number>; totalWithTerrain: number; preferredTerrain: string };
  partnerAnalysis: { partnerCounts: Record<string, { count: number; name: string }>; totalWithPartners: number; preferredPartner: { id: string; name: string; count: number } };
  preferredBoulesAnalysis: { set: any; stats: any; role: string } | null;
  playerBoules?: { name?: string; diameter?: number } | null;
  radarData: Array<{ label: string; value: number; color: string }>;
  language: string;
  t: (section: string, key: string) => string;
  screenWidth: number;
  partnerPlayer?: { avatar?: string; name: string } | null;
}

function GamePreferencesSectionInner({
  roleAnalysis, terrainAnalysis, partnerAnalysis, preferredBoulesAnalysis,
  playerBoules, radarData, language, t, screenWidth, partnerPlayer,
}: GamePreferencesSectionProps) {
  const hasData = roleAnalysis.totalWithRoles > 0 || terrainAnalysis.totalWithTerrain > 0 || partnerAnalysis.totalWithPartners > 0 || !!preferredBoulesAnalysis;
  if (!hasData) return null;

  return (
    <View style={s.sectionCard}>
      <View style={s.sectionHeader}>
        <View style={[s.sectionIconBox, { backgroundColor: '#8B5CF6' + '15' }]}>
          <MaterialIcons name="psychology" size={18} color="#8B5CF6" />
        </View>
        <Text style={s.sectionTitle}>{t('gamePreferences', 'title')}</Text>
      </View>
      <Text style={s.sectionDesc}>{t('gamePreferences', 'descOther')}</Text>

      {radarData.length >= 3 ? (
        <View style={s.radarContainer}>
          <MiniRadar data={radarData} labels={radarData.map(d => d.label)} size={Math.min(screenWidth - 96, 220)} />
        </View>
      ) : null}

      {/* Radar Legend */}
      {radarData.length >= 3 ? (
        <View style={s.radarLegend}>
          {[
            { color: radarData[0]?.color, label: radarData[0]?.label, desc: t('gamePreferences', 'roleLoyalty') },
            { color: radarData[1]?.color, label: radarData[1]?.label, desc: t('gamePreferences', 'terrainLoyalty') },
            { color: radarData[2]?.color, label: radarData[2]?.label, desc: t('gamePreferences', 'partnerConsistency') },
            { color: radarData[3]?.color, label: radarData[3]?.label, desc: t('gamePreferences', 'overallWinRate') },
            { color: radarData[4]?.color, label: radarData[4]?.label, desc: t('gamePreferences', 'shotAccuracy') },
          ].map((item, i) => (
            <View key={i} style={s.radarLegendItem}>
              <View style={[s.radarLegendDot, { backgroundColor: item.color }]} />
              <View style={s.radarLegendTexts}>
                <Text style={s.radarLegendLabel}>{item.label}</Text>
                <Text style={s.radarLegendDesc}>{item.desc}</Text>
              </View>
              <Text style={[s.radarLegendValue, { color: item.color }]}>{radarData[i]?.value}%</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/* Preferred Role */}
      {roleAnalysis.totalWithRoles > 0 ? (
        <View style={s.prefItem}>
          <View style={[s.prefItemIcon, { backgroundColor: (getRoleColor(roleAnalysis.preferredRole)) + '15' }]}>
            <MaterialIcons name={getRoleIcon(roleAnalysis.preferredRole)} size={18} color={getRoleColor(roleAnalysis.preferredRole)} />
          </View>
          <View style={s.prefItemInfo}>
            <Text style={s.prefItemLabel}>{t('player', 'preferredRole')}</Text>
            <Text style={s.prefItemValue}>{t('roles', roleAnalysis.preferredRole)}</Text>
          </View>
          <Text style={s.prefItemPct}>{Math.round((roleAnalysis.roleCounts[roleAnalysis.preferredRole] / roleAnalysis.totalWithRoles) * 100)}%</Text>
        </View>
      ) : null}

      {/* Preferred Terrain */}
      {terrainAnalysis.totalWithTerrain > 0 ? (
        <View style={s.prefItem}>
          <View style={[s.prefItemIcon, { backgroundColor: theme.success + '15' }]}>
            <MaterialIcons name="landscape" size={18} color={theme.success} />
          </View>
          <View style={s.prefItemInfo}>
            <Text style={s.prefItemLabel}>{t('player', 'preferredTerrain')}</Text>
            <Text style={s.prefItemValue}>{t('terrainTypes', terrainAnalysis.preferredTerrain)}</Text>
          </View>
          <Text style={s.prefItemPct}>{Math.round((terrainAnalysis.terrainCounts[terrainAnalysis.preferredTerrain] / terrainAnalysis.totalWithTerrain) * 100)}%</Text>
        </View>
      ) : null}

      {/* Preferred Partner */}
      {partnerAnalysis.totalWithPartners > 0 ? (
        <View style={s.prefItem}>
          <View style={[s.prefItemIcon, { backgroundColor: '#EC4899' + '15', overflow: 'hidden' }]}>
            {partnerPlayer?.avatar ? (
              <Image source={{ uri: partnerPlayer.avatar }} style={{ width: 36, height: 36, borderRadius: 10 }} contentFit="cover" />
            ) : (
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#EC4899' }}>{partnerAnalysis.preferredPartner.name.charAt(0)}</Text>
            )}
          </View>
          <View style={s.prefItemInfo}>
            <Text style={s.prefItemLabel}>{t('player', 'preferredPartner')}</Text>
            <Text style={s.prefItemValue}>{partnerAnalysis.preferredPartner.name}</Text>
          </View>
          <Text style={s.prefItemPct}>{partnerAnalysis.preferredPartner.count} {t('gamePreferences', 'matchesUnit')}</Text>
        </View>
      ) : null}

      {/* Preferred Boules */}
      {preferredBoulesAnalysis ? (
        <View style={s.prefItem}>
          <View style={[s.prefItemIcon, { backgroundColor: theme.accent + '15' }]}>
            <MaterialIcons name="sports-baseball" size={18} color={theme.accent} />
          </View>
          <View style={s.prefItemInfo}>
            <Text style={s.prefItemLabel}>{t('equipment', 'preferredBoules')}</Text>
            <Text style={s.prefItemValue}>{preferredBoulesAnalysis.set.name}</Text>
          </View>
          <Text style={s.prefItemPct}>{preferredBoulesAnalysis.stats.matches} {t('gamePreferences', 'matchesUnit')}</Text>
        </View>
      ) : playerBoules && (playerBoules.name || playerBoules.diameter) ? (
        <View style={s.prefItem}>
          <View style={[s.prefItemIcon, { backgroundColor: theme.accent + '15' }]}>
            <MaterialIcons name="sports-baseball" size={18} color={theme.accent} />
          </View>
          <View style={s.prefItemInfo}>
            <Text style={s.prefItemLabel}>{t('equipment', 'boulesLabel')}</Text>
            <Text style={s.prefItemValue}>{playerBoules.name || t('player', 'boulesLabel')}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  sectionCard: { backgroundColor: theme.surface, borderRadius: theme.borderRadius.lg, padding: 16, marginBottom: 14, ...theme.shadows.card },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  sectionIconBox: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: theme.textPrimary },
  sectionDesc: { fontSize: 12, color: theme.textMuted, lineHeight: 17, marginBottom: 12 },
  radarContainer: { alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.border },
  radarLegend: { marginBottom: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: theme.border },
  radarLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 5 },
  radarLegendDot: { width: 8, height: 8, borderRadius: 4 },
  radarLegendTexts: { flex: 1 },
  radarLegendLabel: { fontSize: 13, fontWeight: '600', color: theme.textPrimary },
  radarLegendDesc: { fontSize: 11, color: theme.textMuted, marginTop: 1 },
  radarLegendValue: { fontSize: 14, fontWeight: '700' },
  prefItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.border + '60' },
  prefItemIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  prefItemInfo: { flex: 1 },
  prefItemLabel: { fontSize: 11, fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  prefItemValue: { fontSize: 15, fontWeight: '700', color: theme.textPrimary, marginTop: 2 },
  prefItemPct: { fontSize: 13, fontWeight: '600', color: theme.textSecondary },
});

export default memo(GamePreferencesSectionInner);
