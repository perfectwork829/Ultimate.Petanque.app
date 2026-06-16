/**
 * SponsorItemMetrics — Per-item performance metrics for sponsored items.
 * Shows impressions, clicks and CTR for each terrain/club/tournament/player sponsored.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform, Pressable, Share } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getSupabaseClient } from '@/template';
import { BannerDetailedAnalytics } from '@/services/ambassadorAnalyticsService';

interface ItemMetric {
  id: string;
  name: string;
  type: string;
  icon: string;
  color: string;
  impressions: number;
  clicks: number;
  ctr: number;
}

interface Props {
  sponsorId: string;
  bannerData: BannerDetailedAnalytics | null;
  totalImp: number;
  period: number;
  tierColor: string;
  fr: boolean;
}

export default function SponsorItemMetrics({ sponsorId, bannerData, totalImp, period, tierColor, fr }: Props) {
  const supabase = getSupabaseClient();
  const [items, setItems] = useState<ItemMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!sponsorId) return;
    setLoading(true);
    try {
      const [tRes, cRes, toRes, plRes] = await Promise.all([
        supabase.from('terrains').select('id, name').eq('sponsor_id', sponsorId),
        supabase.from('clubs').select('id, name').eq('sponsor_id', sponsorId),
        supabase.from('tournaments').select('id, name').eq('sponsor_id', sponsorId),
        supabase.from('players').select('id, name').eq('sponsor_id', sponsorId),
      ]);
      const metrics: ItemMetric[] = [];
      (tRes.data || []).forEach((r: any) => metrics.push({ id: r.id, name: r.name, type: 'terrain', icon: 'sports-soccer', color: '#10B981', impressions: 0, clicks: 0, ctr: 0 }));
      (cRes.data || []).forEach((r: any) => metrics.push({ id: r.id, name: r.name, type: 'club', icon: 'home', color: '#D97706', impressions: 0, clicks: 0, ctr: 0 }));
      (toRes.data || []).forEach((r: any) => metrics.push({ id: r.id, name: r.name, type: 'tournament', icon: 'emoji-events', color: '#B45309', impressions: 0, clicks: 0, ctr: 0 }));
      (plRes.data || []).forEach((r: any) => metrics.push({ id: r.id, name: r.name, type: 'player', icon: 'person', color: '#3B82F6', impressions: 0, clicks: 0, ctr: 0 }));

      if (metrics.length > 0 && bannerData) {
        // Distribute page-level metrics proportionally across items of the same type
        const typeGroups = new Map<string, ItemMetric[]>();
        metrics.forEach(m => {
          if (!typeGroups.has(m.type)) typeGroups.set(m.type, []);
          typeGroups.get(m.type)!.push(m);
        });

        // Map item types to likely page sources
        const pageMapping: Record<string, string[]> = {
          terrain: ['directory', 'map'],
          club: ['directory', 'map'],
          tournament: ['directory'],
          player: ['directory'],
        };

        typeGroups.forEach((groupItems, type) => {
          const pages = pageMapping[type] || ['directory'];
          let totalPageImp = 0;
          let totalPageClk = 0;
          pages.forEach(page => {
            totalPageImp += bannerData.impressionsByPage[page] || 0;
            totalPageClk += bannerData.clicksByPage[page] || 0;
          });
          const share = groupItems.length;
          groupItems.forEach(item => {
            item.impressions = share > 0 ? Math.round(totalPageImp / share) : 0;
            item.clicks = share > 0 ? Math.round(totalPageClk / share) : 0;
            item.ctr = item.impressions > 0 ? Math.round((item.clicks / item.impressions) * 1000) / 10 : 0;
          });
        });
      }

      setItems(metrics);
    } catch { /* silent */ }
    setLoading(false);
  }, [sponsorId, bannerData, supabase]);

  useEffect(() => { loadMetrics(); }, [loadMetrics]);

  if (loading) {
    return (
      <View style={st.card}>
        <View style={{ paddingVertical: 20, alignItems: 'center' }}>
          <ActivityIndicator size="small" color={tierColor} />
        </View>
      </View>
    );
  }

  if (items.length === 0) return null;

  const maxImp = Math.max(...items.map(m => m.impressions), 1);

  // Group by type for section display
  const grouped = new Map<string, ItemMetric[]>();
  items.forEach(item => {
    if (!grouped.has(item.type)) grouped.set(item.type, []);
    grouped.get(item.type)!.push(item);
  });

  const typeLabels: Record<string, { fr: string; en: string }> = {
    terrain: { fr: 'Terrains', en: 'Terrains' },
    club: { fr: 'Clubs', en: 'Clubs' },
    tournament: { fr: 'Tournois', en: 'Tournaments' },
    player: { fr: 'Joueurs', en: 'Players' },
  };

  return (
    <View style={st.card}>
      <View style={st.header}>
        <View style={[st.iconBg, { backgroundColor: tierColor + '12' }]}>
          <MaterialIcons name="analytics" size={18} color={tierColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>{fr ? 'Performance par item' : 'Per-item Performance'}</Text>
          <Text style={st.subtitle}>{items.length} {fr ? 'items sponsorises' : 'sponsored items'} · {period}{fr ? 'j' : 'd'}</Text>
        </View>
      </View>

      {Array.from(grouped.entries()).map(([type, typeItems]) => (
        <View key={type} style={st.typeSection}>
          <View style={st.typeLabelRow}>
            <MaterialIcons name={(typeItems[0]?.icon || 'circle') as any} size={12} color={typeItems[0]?.color || '#94A3B8'} />
            <Text style={[st.typeLabel, { color: typeItems[0]?.color }]}>{fr ? typeLabels[type]?.fr : typeLabels[type]?.en}</Text>
            <View style={[st.typeCountBadge, { backgroundColor: (typeItems[0]?.color || '#94A3B8') + '12' }]}>
              <Text style={[st.typeCountText, { color: typeItems[0]?.color }]}>{typeItems.length}</Text>
            </View>
          </View>
          {typeItems.map((item, i) => (
            <Pressable key={item.id} style={[st.itemRow, i < typeItems.length - 1 && st.itemRowBorder, expandedId === item.id && { backgroundColor: item.color + '04', borderRadius: 10, marginHorizontal: -4, paddingHorizontal: 4 }]} onPress={() => setExpandedId(prev => prev === item.id ? null : item.id)}>
              <View style={[st.itemIcon, { backgroundColor: item.color + '10' }]}>
                <MaterialIcons name={item.icon as any} size={14} color={item.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={st.itemName} numberOfLines={1}>{item.name}</Text>
                <View style={st.barTrack}>
                  <View style={[st.barFill, { width: `${Math.max(3, (item.impressions / maxImp) * 100)}%`, backgroundColor: item.color }]} />
                </View>
                {expandedId === item.id ? (
                  <View style={st.drillDown}>
                    <View style={st.drillDownRow}>
                      <View style={[st.drillDownKpi, { borderColor: '#3B82F615' }]}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#3B82F6' }}>{item.impressions}</Text>
                        <Text style={st.drillDownLabel}>Imp.</Text>
                      </View>
                      <View style={[st.drillDownKpi, { borderColor: '#10B98115' }]}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: '#10B981' }}>{item.clicks}</Text>
                        <Text style={st.drillDownLabel}>{fr ? 'Clics' : 'Clicks'}</Text>
                      </View>
                      <View style={[st.drillDownKpi, { borderColor: tierColor + '15' }]}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: tierColor }}>{item.ctr}%</Text>
                        <Text style={st.drillDownLabel}>CTR</Text>
                      </View>
                    </View>
                    <View style={st.drillDownHint}>
                      <MaterialIcons name="info-outline" size={11} color="#94A3B8" />
                      <Text style={st.drillDownHintText}>{fr ? `Metriques estimees sur ${period}j` : `Estimated metrics over ${period}d`}</Text>
                    </View>
                  </View>
                ) : null}
              </View>
              <View style={st.metricsCol}>
                <View style={st.metricRow}>
                  <MaterialIcons name="visibility" size={10} color="#3B82F6" />
                  <Text style={[st.metricValue, { color: '#3B82F6' }]}>{item.impressions}</Text>
                </View>
                <View style={st.metricRow}>
                  <MaterialIcons name="touch-app" size={10} color="#10B981" />
                  <Text style={[st.metricValue, { color: '#10B981' }]}>{item.clicks}</Text>
                </View>
                <View style={st.metricRow}>
                  <MaterialIcons name="trending-up" size={10} color={tierColor} />
                  <Text style={[st.metricValue, { color: tierColor }]}>{item.ctr}%</Text>
                </View>
                <MaterialIcons name={expandedId === item.id ? 'expand-less' : 'expand-more'} size={14} color="#94A3B8" style={{ marginTop: 2 }} />
              </View>
            </Pressable>
          ))}
        </View>
      ))}

      {/* Export CSV */}
      <Pressable
        style={st.exportRow}
        onPress={async () => {
          try {
            let csv = 'Name,Type,Impressions,Clicks,CTR\n';
            items.forEach(m => { csv += `"${m.name}",${m.type},${m.impressions},${m.clicks},${m.ctr}%\n`; });
            csv += `\nTotal,${items.length},${items.reduce((s, m) => s + m.impressions, 0)},${items.reduce((s, m) => s + m.clicks, 0)},${totalImp > 0 ? Math.round((items.reduce((s, m) => s + m.clicks, 0) / Math.max(items.reduce((s, m) => s + m.impressions, 0), 1)) * 1000) / 10 : 0}%\n`;
            if (Platform.OS === 'web') {
              try {
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = `sponsor_items_${period}d.csv`; a.click();
                URL.revokeObjectURL(url);
              } catch { /* silent */ }
            } else {
              await Share.share({ message: csv, title: 'Sponsor Items CSV' });
            }
          } catch { /* silent */ }
        }}
      >
        <MaterialIcons name="download" size={14} color={tierColor} />
        <Text style={[st.exportText, { color: tierColor }]}>{fr ? 'Exporter CSV' : 'Export CSV'}</Text>
      </Pressable>

      {/* Legend */}
      <View style={st.legend}>
        <View style={st.legendItem}><MaterialIcons name="visibility" size={10} color="#3B82F6" /><Text style={st.legendText}>Imp.</Text></View>
        <View style={st.legendItem}><MaterialIcons name="touch-app" size={10} color="#10B981" /><Text style={st.legendText}>{fr ? 'Clics' : 'Clicks'}</Text></View>
        <View style={st.legendItem}><MaterialIcons name="trending-up" size={10} color={tierColor} /><Text style={st.legendText}>CTR</Text></View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    backgroundColor: '#FFF', borderRadius: 18, padding: 18, marginBottom: 14,
    borderWidth: 1, borderColor: '#E2E8F0',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4 },
      android: { elevation: 1 },
      default: {},
    }),
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  iconBg: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  subtitle: { fontSize: 11, color: '#94A3B8', marginTop: 1 },
  typeSection: { marginBottom: 12 },
  typeLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  typeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' },
  typeCountBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6 },
  typeCountText: { fontSize: 9, fontWeight: '800' },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  itemRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  itemIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  itemName: { fontSize: 13, fontWeight: '600', color: '#334155', marginBottom: 4 },
  barTrack: { height: 4, backgroundColor: '#F1F5F9', borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
  metricsCol: { alignItems: 'flex-end', gap: 3, minWidth: 60 },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metricValue: { fontSize: 10, fontWeight: '800' },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendText: { fontSize: 9, fontWeight: '600', color: '#94A3B8' },
  exportRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, marginTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  exportText: { fontSize: 12, fontWeight: '700' },
  drillDown: { marginTop: 8, gap: 6 },
  drillDownRow: { flexDirection: 'row', gap: 6 },
  drillDownKpi: { flex: 1, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, paddingVertical: 8, borderWidth: 1 },
  drillDownLabel: { fontSize: 8, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase' },
  drillDownHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  drillDownHintText: { fontSize: 9, color: '#94A3B8', fontStyle: 'italic' },
});
