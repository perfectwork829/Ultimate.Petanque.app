/**
 * useAppGetters — Extracted getter functions from AppContext.
 * 
 * These are pure lookup functions that operate on the data arrays.
 * They can be imported and used by components that need read-only access
 * to entity lookups without subscribing to the full AppContext.
 * 
 * Note: Currently these are still provided via AppContext for backward 
 * compatibility. This file serves as the canonical implementation.
 */
import { useCallback } from 'react';
import { Player, Match, Club, Tournament, Terrain, HeadToHead } from '@/types/petanque';

export function createGetters(
  players: Player[],
  clubs: Club[],
  tournaments: Tournament[],
  matches: Match[],
  terrains: Terrain[],
) {
  // Build lookup maps for O(1) access instead of O(n) find()
  const playerMap = new Map(players.map(p => [p.id, p]));
  const clubMap = new Map(clubs.map(c => [c.id, c]));
  const tournamentMap = new Map(tournaments.map(t => [t.id, t]));
  const matchMap = new Map(matches.map(m => [m.id, m]));
  const terrainMap = new Map(terrains.map(t => [t.id, t]));

  const getPlayerById = (id: string) => playerMap.get(id);
  const getClubById = (id: string) => clubMap.get(id);
  const getTournamentById = (id: string) => tournamentMap.get(id);
  const getMatchById = (id: string) => matchMap.get(id);
  const getTerrainById = (id: string) => terrainMap.get(id);

  const getMatchesByPlayer = (playerId: string) =>
    matches.filter(m => m.teamA.players.includes(playerId) || m.teamB.players.includes(playerId));

  const getMatchesByTournament = (tournamentId: string) =>
    matches.filter(m => m.tournamentId === tournamentId);

  const getHeadToHead = (player1Id: string, player2Id: string): HeadToHead => {
    const h2hMatches = matches.filter(m => {
      const p1InA = m.teamA.players.includes(player1Id);
      const p1InB = m.teamB.players.includes(player1Id);
      const p2InA = m.teamA.players.includes(player2Id);
      const p2InB = m.teamB.players.includes(player2Id);
      return (p1InA && p2InB) || (p1InB && p2InA);
    });

    const matchDetails = h2hMatches.map(m => {
      const p1InA = m.teamA.players.includes(player1Id);
      const p1Team: 'A' | 'B' = p1InA ? 'A' : 'B';
      const p1Won = m.winner === p1Team;
      return {
        id: m.id,
        date: m.date,
        player1Team: p1Team,
        player1Won: p1Won,
        scoreFor: p1InA ? m.teamA.score : m.teamB.score,
        scoreAgainst: p1InA ? m.teamB.score : m.teamA.score,
        format: m.format,
        mode: m.mode,
      };
    });

    const total = matchDetails.length;
    const p1Wins = matchDetails.filter(m => m.player1Won).length;
    const p2Wins = total - p1Wins;
    const p1Avg = total > 0 ? matchDetails.reduce((s, m) => s + m.scoreFor, 0) / total : 0;
    const p2Avg = total > 0 ? matchDetails.reduce((s, m) => s + m.scoreAgainst, 0) / total : 0;

    return {
      player1Id,
      player2Id,
      matches: matchDetails,
      stats: {
        totalMatches: total,
        player1Wins: p1Wins,
        player2Wins: p2Wins,
        player1WinRate: total > 0 ? (p1Wins / total) * 100 : 0,
        player1AvgScore: Math.round(p1Avg * 10) / 10,
        player2AvgScore: Math.round(p2Avg * 10) / 10,
        lastMatch: matchDetails.length > 0
          ? matchDetails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0].date
          : undefined,
      },
    };
  };

  const getCommonOpponents = (player1Id: string, player2Id: string): string[] => {
    const p1Opponents = new Set<string>();
    const p2Opponents = new Set<string>();

    matches.forEach(m => {
      if (m.teamA.players.includes(player1Id)) m.teamB.players.forEach(p => p1Opponents.add(p));
      else if (m.teamB.players.includes(player1Id)) m.teamA.players.forEach(p => p1Opponents.add(p));
      if (m.teamA.players.includes(player2Id)) m.teamB.players.forEach(p => p2Opponents.add(p));
      else if (m.teamB.players.includes(player2Id)) m.teamA.players.forEach(p => p2Opponents.add(p));
    });

    const common: string[] = [];
    p1Opponents.forEach(id => {
      if (p2Opponents.has(id) && id !== player1Id && id !== player2Id) common.push(id);
    });
    return common;
  };

  return {
    getPlayerById,
    getClubById,
    getTournamentById,
    getMatchById,
    getTerrainById,
    getMatchesByPlayer,
    getMatchesByTournament,
    getHeadToHead,
    getCommonOpponents,
  };
}
