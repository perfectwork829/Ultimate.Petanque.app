/**
 * ConsentAnalyticsCard — Consent analytics widget for the partner portal.
 * Shows acceptance rate, response time, decline reasons, and per-item-type breakdown.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getSponsorConsentAnalytics, SponsorConsentAnalytics } from '@/services/sponsorConsentService';
import theme from '@/constants/theme';
import * as Haptics from '@/services/haptics';

interface Props {
  ambassadorId: string;
  fr: boolean;
  tierColor: string;
}

export default function ConsentAnalyticsCard({ ambassadorId, fr, tierColor }: Props) {
  const [analytics, setAnalytics] = useState<SponsorConsentAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    getSponsorConsentAnalytics(ambassadorId).then(({ analytics: a }) => {
      if (mounted) { setAnalytics(a); setLoading(false); }
    }).catch(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [ambassadorId]);

  if (loading) {
    return (
      <View style={[s.card, { borderColor: tierColor + '20' }]}>
        <ActivityIndicator size="small" color={tierColor} style={{ paddingVertical: 20 }} />
      </View>
    );
  }

  if (!analytics || analytics.totalProposals === 0) {
    return (
      <View style={[s.card, { borderColor: tierColor + '20' }]}>
        <View style={s.headerRow}>
          <View style={[s.iconBg, { backgroundColor: tierColor + '12' }]}>
            <MaterialIcons name="analytics" size={18} color={tierColor} />
          </View>
          <Text style={s.title}>{fr ? 'Analytique consentement' : 'Consent Analytics'}</Text>
        </View>
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <MaterialIcons name="pending-actions" size={28} color="#94A3B8" />
          <Text style={{ fontSize: 12, color: '#94A3B8', marginTop: 6 }}>{fr ? 'Aucune proposition envoyee' : 'No proposals sent yet'}</Text>
        </View>
      </View>
    );
  }

  const a = analytics;
  const rateColor = a.acceptanceRate >= 70 ? '#22C55E' : a.acceptanceRate >= 40 ? '#F59E0B' : '#EF4444';
  const resolved = a.accepted + a.refused + a.expired + a.removed;
  const typeIcon = (t: string) => t === 'terrain' ? 'sports-soccer' : t === 'club' ? 'home' : t === 'player' ? 'person' : 'emoji-events';
  const typeColor = (t: string) => t === 'terrain' ? '#10B981' : t === 'club' ? '#D97706' : t === 'player' ? '#3B82F6' : '#B45309';
  const typeLabel = (t: string) => t === 'terrain' ? 'Terrain' : t === 'club' ? 'Club' : t === 'player' ? (fr ? 'Joueur' : 'Player') : (fr ? 'Tournoi' : 'Tournament');

  return (
    <View style={[s.card, { borderColor: tierColor + '20' }]}>
      <Pressable style={s.headerRow} onPress={() => { Haptics.selectionAsync(); setExpanded(!expanded); }}>
        <View style={[s.iconBg, { backgroundColor: tierColor + '12' }]}>
          <MaterialIcons name="analytics" size={18} color={tierColor} />
        </View>
        <Text style={[s.title, { flex: 1 }]}>{fr ? 'Analytique consentement' : 'Consent Analytics'}</Text>
        <View style={[s.rateBadge, { backgroundColor: rateColor + '15' }]}>
          <Text style={[s.rateText, { color: rateColor }]}>{a.acceptanceRate}%</Text>
        </View>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={20} color="#94A3B8" />
      </Pressable>

      {/* KPI row always visible */}
      <View style={s.kpiRow}>
        <View style={s.kpi}>
          <Text style={[s.kpiValue, { color: '#22C55E' }]}>{a.accepted}</Text>
          <Text style={s.kpiLabel}>{fr ? 'Acceptes' : 'Accepted'}</Text>
        </View>
        <View style={s.kpi}>
          <Text style={[s.kpiValue, { color: '#EF4444' }]}>{a.refused}</Text>
          <Text style={s.kpiLabel}>{fr ? 'Refuses' : 'Refused'}</Text>
        </View>
        <View style={s.kpi}>
          <Text style={[s.kpiValue, { color: '#94A3B8' }]}>{a.expired}</Text>
          <Text style={s.kpiLabel}>{fr ? 'Expires' : 'Expired'}</Text>
        </View>
        <View style={s.kpi}>
          <Text style={[s.kpiValue, { color: '#F59E0B' }]}>{a.pending}</Text>
          <Text style={s.kpiLabel}>{fr ? 'En attente' : 'Pending'}</Text>
        </View>
      </View>

      {/* Status bar */}
      {resolved > 0 ? (
        <View style={s.statusBar}>
          {a.accepted > 0 ? <View style={[s.statusSegment, { flex: a.accepted, backgroundColor: '#22C55E' }]} /> : null}
          {a.refused > 0 ? <View style={[s.statusSegment, { flex: a.refused, backgroundColor: '#EF4444' }]} /> : null}
          {a.expired > 0 ? <View style={[s.statusSegment, { flex: a.expired, backgroundColor: '#94A3B8' }]} /> : null}
          {a.removed > 0 ? <View style={[s.statusSegment, { flex: a.removed, backgroundColor: '#F59E0B' }]} /> : null}
        </View>
      ) : null}

      {expanded ? (
        <View style={{ gap: 12, marginTop: 12 }}>
          {/* Response time */}
          <View style={s.metricRow}>
            <MaterialIcons name="schedule" size={14} color="#64748B" />
            <Text style={s.metricLabel}>{fr ? 'Temps de reponse moyen' : 'Avg response time'}</Text>
            <Text style={[s.metricValue, { color: a.avgResponseTimeHours > 48 ? '#EF4444' : a.avgResponseTimeHours > 24 ? '#F59E0B' : '#22C55E' }]}>
              {a.avgResponseTimeHours > 24
                ? `${Math.round(a.avgResponseTimeHours / 24)}${fr ? 'j' : 'd'} ${Math.round(a.avgResponseTimeHours % 24)}h`
                : `${a.avgResponseTimeHours}h`}
            </Text>
          </View>

          {/* Removed count */}
          {a.removed > 0 ? (
            <View style={s.metricRow}>
              <MaterialIcons name="link-off" size={14} color="#F59E0B" />
              <Text style={s.metricLabel}>{fr ? 'Retires par le proprietaire' : 'Removed by owner'}</Text>
              <Text style={[s.metricValue, { color: '#F59E0B' }]}>{a.removed}</Text>
            </View>
          ) : null}

          {/* Per item type breakdown */}
          {a.byItemType.length > 0 ? (
            <View>
              <Text style={s.subTitle}>{fr ? 'Par type d\'item' : 'By item type'}</Text>
              {a.byItemType.map(t => (
                <View key={t.type} style={s.typeRow}>
                  <View style={[s.typeIcon, { backgroundColor: typeColor(t.type) + '12' }]}>
                    <MaterialIcons name={typeIcon(t.type) as any} size={14} color={typeColor(t.type)} />
                  </View>
                  <Text style={s.typeLabel}>{typeLabel(t.type)}</Text>
                  <Text style={s.typeCount}>{t.total}</Text>
                  <View style={[s.typeRateBadge, { backgroundColor: t.rate >= 60 ? '#22C55E15' : t.rate >= 30 ? '#F59E0B15' : '#EF444415' }]}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: t.rate >= 60 ? '#22C55E' : t.rate >= 30 ? '#F59E0B' : '#EF4444' }}>{t.rate}%</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {/* Top refuse reasons */}
          {a.topRefuseReasons.length > 0 ? (
            <View>
              <Text style={s.subTitle}>{fr ? 'Raisons de refus frequentes' : 'Top decline reasons'}</Text>
              {a.topRefuseReasons.map((r, i) => (
                <View key={i} style={s.reasonRow}>
                  <View style={s.reasonDot} />
                  <Text style={s.reasonText} numberOfLines={2}>{r.reason}</Text>
                  <View style={s.reasonCount}>
                    <Text style={s.reasonCountText}>{r.count}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, borderWidth: 1.5, marginBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  iconBg: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  rateBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  rateText: { fontSize: 14, fontWeight: '800' },
  kpiRow: { flexDirection: 'row', gap: 6 },
  kpi: { flex: 1, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, paddingVertical: 10 },
  kpiValue: { fontSize: 18, fontWeight: '800' },
  kpiLabel: { fontSize: 9, fontWeight: '600', color: '#94A3B8', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  statusBar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 10, gap: 2 },
  statusSegment: { borderRadius: 3 },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metricLabel: { flex: 1, fontSize: 12, color: '#64748B' },
  metricValue: { fontSize: 14, fontWeight: '800' },
  subTitle: { fontSize: 11, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8, marginTop: 4 },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  typeIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  typeLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: '#0F172A' },
  typeCount: { fontSize: 12, fontWeight: '700', color: '#64748B', marginRight: 6 },
  typeRateBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  reasonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reasonDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' },
  reasonText: { flex: 1, fontSize: 12, color: '#64748B', lineHeight: 17 },
  reasonCount: { backgroundColor: '#EF444412', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  reasonCountText: { fontSize: 11, fontWeight: '800', color: '#EF4444' },
});
