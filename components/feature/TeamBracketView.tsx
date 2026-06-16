/**
 * TeamBracketView — Shows registered teams for a tournament.
 * Simple list of complete teams with member avatars and chat link.
 */
import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from '@/services/haptics';
import theme from '@/constants/theme';
import { getSupabaseClient } from '@/template';
import { TournamentTeam, getTeamSize } from '@/services/teamInvitationService';

interface Props {
  tournamentId: string;
  format: string;
  language: string;
}

function mapTeam(row: any): TournamentTeam {
  return {
    id: row.id, tournamentId: row.tournament_id, creatorUserId: row.creator_user_id,
    memberUserIds: row.member_user_ids || [], memberNames: row.member_names || [],
    format: row.format, status: row.status, completedAt: row.completed_at, createdAt: row.created_at,
  };
}

const TEAM_COLORS = ['#3B82F6', '#22C55E', '#F59E0B', '#EF4444', '#7C3AED', '#EC4899', '#06B6D4', '#D97706'];

export default function TeamBracketView({ tournamentId, format, language }: Props) {
  const fr = language === 'fr';
  const [teams, setTeams] = useState<TournamentTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const sb = getSupabaseClient();
      const { data } = await sb
        .from('tournament_teams')
        .select('*')
        .eq('tournament_id', tournamentId)
        .eq('status', 'complete')
        .order('created_at', { ascending: true });
      setTeams((data || []).map(mapTeam));
      setLoading(false);
    };
    load();
  }, [tournamentId]);

  if (loading) {
    return (
      <View style={s.container}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  if (teams.length === 0) return null;

  const teamSize = getTeamSize(format);

  return (
    <Animated.View entering={FadeInDown.duration(250)} style={s.container}>
      <Pressable style={s.header} onPress={() => { Haptics.selectionAsync(); setExpanded(p => !p); }}>
        <View style={s.headerIcon}>
          <MaterialIcons name="groups" size={18} color="#7C3AED" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{fr ? 'Equipes inscrites' : 'Registered Teams'}</Text>
          <Text style={s.headerSub}>{teams.length} {fr ? 'equipe(s) complete(s)' : 'complete team(s)'} • {format}</Text>
        </View>
        <View style={[s.teamCountBadge, { backgroundColor: '#7C3AED15' }]}>
          <Text style={[s.teamCountText, { color: '#7C3AED' }]}>{teams.length}</Text>
        </View>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color="#64748B" />
      </Pressable>

      {expanded ? (
        <View style={s.listBody}>
          {teams.map((t, i) => {
            const color = TEAM_COLORS[i % TEAM_COLORS.length];
            return (
              <Animated.View key={t.id} entering={FadeInDown.duration(200).delay(i * 50)}>
                <Pressable
                  style={s.teamCard}
                  onPress={() => router.push(`/team-chat/${t.id}` as any)}
                >
                  <View style={[s.teamIndex, { backgroundColor: color }]}>
                    <Text style={s.teamIndexText}>{i + 1}</Text>
                  </View>
                  <View style={s.teamMembersCol}>
                    <View style={s.teamMembersAvatars}>
                      {t.memberNames.map((name, mi) => (
                        <View key={mi} style={[s.memberDot, { backgroundColor: color, marginLeft: mi > 0 ? -6 : 0, zIndex: 10 - mi }]}>
                          <Text style={s.memberInitial}>{name.charAt(0)}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={s.teamNames} numberOfLines={1}>{t.memberNames.join(' & ')}</Text>
                    <Text style={s.teamMeta}>{t.memberUserIds.length}/{teamSize} {fr ? 'joueurs' : 'players'}</Text>
                  </View>
                  <MaterialIcons name="chat-bubble-outline" size={16} color="#22C55E" />
                  <MaterialIcons name="chevron-right" size={18} color="#CBD5E1" />
                </Pressable>
              </Animated.View>
            );
          })}
        </View>
      ) : null}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: { backgroundColor: '#FFF', borderRadius: 18, borderWidth: 1.5, borderColor: '#7C3AED20', overflow: 'hidden', ...Platform.select({ ios: { shadowColor: '#7C3AED', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 }, android: { elevation: 2 }, default: {} }) },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  headerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#7C3AED12', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: '#0F172A' },
  headerSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  teamCountBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  teamCountText: { fontSize: 14, fontWeight: '800' },
  listBody: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  teamCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FAFAFA', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  teamIndex: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  teamIndexText: { fontSize: 12, fontWeight: '800', color: '#FFF' },
  teamMembersCol: { flex: 1 },
  teamMembersAvatars: { flexDirection: 'row', marginBottom: 4 },
  memberDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFF' },
  memberInitial: { fontSize: 9, fontWeight: '800', color: '#FFF' },
  teamNames: { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  teamMeta: { fontSize: 10, color: '#94A3B8', marginTop: 1 },
});
